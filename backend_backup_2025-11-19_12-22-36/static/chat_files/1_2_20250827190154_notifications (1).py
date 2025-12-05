from math import radians, cos, sin, asin, sqrt
from datetime import datetime, timedelta
from models import Transport, Order, NotificationType, Notification
import asyncio
from collections import defaultdict
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user

from fastapi import APIRouter, Depends, HTTPException

from sqlalchemy import and_, or_
from models import UserBlock as UB

router = APIRouter()

# user_id -> set of websocket connections
user_notification_connections = defaultdict(set)

@router.get("/matches/unread_count")
def get_unread_matches(
    transport_id: str = None,
    order_id: int = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    if not transport_id and not order_id:
        raise HTTPException(status_code=400, detail="transport_id or order_id required")
    query = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.type == NotificationType.AUTO_MATCH,
        Notification.read == False
    )
    if transport_id:
        query = query.filter(Notification.related_id == str(transport_id))
    if order_id:
        query = query.filter(Notification.related_id == str(order_id))
    return {"unread": query.count()}

def _is_blocked_pair(db, a_id, b_id):
    return db.query(UB.id).filter(
        or_(
            and_(UB.blocker_id == a_id, UB.blocked_id == b_id),
            and_(UB.blocker_id == b_id, UB.blocked_id == a_id),
        )
    ).first() is not None

async def push_notification(user_id, data):
    print(
        f"[WS][PUSH_NOTIFY] push_notification called for user_id={user_id} with data={data}")
    ws_set = user_notification_connections.get(str(user_id))
    print(f"[WS][PUSH_NOTIFY] ws_set: {ws_set}")
    if ws_set:
        for ws in ws_set.copy():
            print(f"[WS][PUSH_NOTIFY] Sending to ws={ws}")
            try:
                await ws.send_json(data)
                print(f"[WS][PUSH_NOTIFY] Sent to ws={ws}")
            except Exception as e:
                user_notification_connections[str(user_id)].discard(ws)
                print(f"[ERROR] push_notification WS send_json: {e}")


def create_notification(db: Session, user_id, notif_type, message, related_id=None):
    """
    Создаёт запись в БД notifications и пушит событие по WS (асинхронно).
    """
    # --- Дедупликация для авто-матчей ---
    if notif_type == NotificationType.AUTO_MATCH:
        week_ago = datetime.utcnow() - timedelta(days=7)
        existing = db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.type == notif_type,
            Notification.related_id == str(related_id),
            Notification.created_at > week_ago
        ).first()
        if existing:
            # Уже есть такое свежее уведомление — не дублируем
            return

    notif = Notification(
        user_id=user_id,
        type=notif_type,
        message=message,
        related_id=related_id,
        created_at=datetime.utcnow(),
        read=False
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)

    event = {
        "event": "new_notification",
        "id": notif.id,
        "type": notif.type.value,
        "message": notif.message,
        "related_id": notif.related_id,
        "created_at": notif.created_at.isoformat() if notif.created_at else None,
        "read": notif.read,
    }
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(push_notification(user_id, event))
    except RuntimeError:
        try:
            asyncio.run(push_notification(user_id, event))
        except Exception as e:
            print("[ERROR] push_notification WS (asyncio.run):", e)
    except Exception as e:
        print("[ERROR] push_notification WS:", e)


def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(float, [lat1, lon1, lat2, lon2])
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * \
        cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return R * c


def normalize_str(val):
    # Универсально: lower + trim + без спецсимволов
    if not val:
        return ""
    return val.strip().lower().replace("ё", "е")


def normalize_city(city):
    return normalize_str(city)


def find_and_notify_auto_match_for_order(order: Order, db: Session):
    print(
        f"\n[AUTO_MATCH][ORDER->TRANSPORT] START. order.id={order.id}, owner_id={order.owner_id}, truck_type={order.truck_type}, from={order.from_locations}, date={order.load_date}")
    if not order.from_locations or not order.truck_type or not order.load_date:
        print("[AUTO_MATCH][ORDER->TRANSPORT] order missing key data")
        return
    order_cities = [normalize_city(city)
                    for city in (order.from_locations or [])]
    order_type = normalize_str(order.truck_type)
    order_date = None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            order_date = datetime.strptime(order.load_date, fmt)
            break
        except Exception:
            continue
    if not order_date:
        print(
            "[AUTO_MATCH][ORDER->TRANSPORT] Cannot parse order.load_date", order.load_date)
        return

    # Фильтруем транспорты в БД
    all_transports = db.query(Transport).filter(
        Transport.is_active == True,
        Transport.from_location.isnot(None),
        Transport.ready_date_from.isnot(None),
        Transport.ready_date_to.isnot(None)
    ).all()
    print(
        f"[AUTO_MATCH][ORDER->TRANSPORT] Total transports in DB: {len(all_transports)}")

    for tr in all_transports:
        tr_type = normalize_str(getattr(tr, "truck_type", ""))
        if tr_type != order_type:
            continue
        # --- Универсальное условие: сначала по радиусу и координатам, потом по названию города, если радиуса нет ---
        match_by_location = False
        try:
            tr_radius = float(tr.from_radius or 0)
        except Exception:
            tr_radius = 0
        if tr_radius > 0 and tr.from_location_lat and tr.from_location_lng and order.from_locations_coords:
            for coord in order.from_locations_coords:
                try:
                    dist = haversine(
                        coord["lat"], coord["lng"],
                        tr.from_location_lat, tr.from_location_lng
                    )
                    print(
                        f"[AUTO_MATCH] Distance: {dist}km, Transport radius: {tr_radius}km")
                    if dist <= tr_radius:
                        match_by_location = True
                        break
                except Exception as e:
                    print(f"[AUTO_MATCH] Error in haversine: {e}")
        else:
            tr_city = normalize_city(tr.from_location)
            if any(oc == tr_city for oc in order_cities):
                match_by_location = True
        if not match_by_location:
            continue
        # Даты (гибкая проверка)
        try:
            tr_from = datetime.strptime(tr.ready_date_from, "%d/%m/%Y")
            tr_to = datetime.strptime(tr.ready_date_to, "%d/%m/%Y")
            if not (tr_from <= order_date <= tr_to):
                continue
        except Exception:
            continue
        if order.owner_id == tr.owner_id:
            continue
        message = (
            f"Найден новый груз: {order.from_locations[0]} — дата погрузки {order.load_date}, "
            f"тип транспорта: {order.truck_type}. Заявка подобрана автоматически по вашим основным параметрам. "
            f"Проверьте детали — параметры могут отличаться."
        )
        create_notification(
            db=db,
            user_id=tr.owner_id,
            notif_type=NotificationType.AUTO_MATCH,
            message=message,
            related_id=str(order.id)
        )


def find_and_notify_auto_match_for_transport(transport: Transport, db: Session):
    print(
        f"\n[AUTO_MATCH][TRANSPORT->ORDER] START. transport.id={transport.id}, owner_id={transport.owner_id}, truck_type={transport.truck_type}, from={transport.from_location}, date={transport.ready_date_from}"
    )
    if not transport.from_location or not transport.truck_type or not transport.ready_date_from:
        print("[AUTO_MATCH][TRANSPORT->ORDER] transport missing key data")
        return
    if _is_blocked_pair(db, order.owner_id, tr.owner_id):
        continue

    tr_city = normalize_city(transport.from_location)
    tr_type = normalize_str(transport.truck_type)
    tr_from = None
    tr_to = None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            tr_from = datetime.strptime(transport.ready_date_from, fmt)
            tr_to = datetime.strptime(
                transport.ready_date_to, fmt) if transport.ready_date_to else tr_from
            break
        except Exception:
            continue
    if not tr_from or not tr_to:
        print("[AUTO_MATCH][TRANSPORT->ORDER] Cannot parse ready_date_from/to",
              transport.ready_date_from, transport.ready_date_to)
        return

    all_orders = db.query(Order).filter(
        Order.is_active == True,
        Order.from_locations.isnot(None),
        Order.load_date.isnot(None)
    ).all()
    print(
        f"[AUTO_MATCH][TRANSPORT->ORDER] Total orders in DB: {len(all_orders)}")

    orders = []
    for order in all_orders:
        # Тип кузова
        order_type = normalize_str(getattr(order, "truck_type", ""))
        if order_type != tr_type:
            continue
        # Локация (по радиусу или названию)
        match_by_location = False
        try:
            tr_radius = float(getattr(transport, "from_radius", 0) or 0)
        except Exception:
            tr_radius = 0

        if tr_radius > 0 and transport.from_location_lat and transport.from_location_lng and order.from_locations_coords:
            # Есть радиус и координаты — ищем хотя бы одну точку в радиусе
            for coord in order.from_locations_coords:
                try:
                    dist = haversine(
                        coord["lat"], coord["lng"],
                        transport.from_location_lat, transport.from_location_lng
                    )
                    print(
                        f"[AUTO_MATCH] Distance: {dist}km, Transport radius: {tr_radius}km")
                    if dist <= tr_radius:
                        match_by_location = True
                        break
                except Exception as e:
                    continue
        else:
            # Фоллбек: по названию города
            tr_city = normalize_city(transport.from_location)
            order_cities = [normalize_city(city)
                            for city in (order.from_locations or [])]
            if any(oc == tr_city for oc in order_cities):
                match_by_location = True

        if not match_by_location:
            continue

        # Дата (гибко: order_date ∈ [tr_from, tr_to])
        order_date = None
        for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
            try:
                order_date = datetime.strptime(order.load_date, fmt)
                break
            except Exception:
                order_date = None
        if not order_date:
            continue
        if not (tr_from <= order_date <= tr_to):
            continue
        # Владелец (чтобы не уведомлять самого себя)
        if order.owner_id == transport.owner_id:
            continue
        orders.append(order)

    print(f"[AUTO_MATCH][TRANSPORT->ORDER] Candidates found: {len(orders)}")
    for order in orders:
        message = (
            f"Найден новый транспорт: {transport.from_location}, доступен с {transport.ready_date_from} по {transport.ready_date_to}, "
            f"тип: {transport.truck_type}. Заявка подобрана автоматически под ваш груз. Проверьте детали — параметры могут отличаться."
        )
        create_notification(
            db=db,
            user_id=order.owner_id,
            notif_type=NotificationType.AUTO_MATCH,
            message=message,
            related_id=str(transport.id)
        )

def find_matching_orders_for_transport(transport, db, exclude_user_id=None):
    """
    Находит все заказы, которые совпадают с данным транспортом по основным параметрам.
    """
    from models import Order
    orders = db.query(Order).filter(Order.is_active == True).all()
    results = []
    tr_type = normalize_str(getattr(transport, "truck_type", ""))
    tr_from = parse_date(getattr(transport, "ready_date_from", ""))
    tr_to = parse_date(getattr(transport, "ready_date_to", "")) or tr_from
    tr_city = normalize_city(getattr(transport, "from_location", ""))

    for order in orders:
        if exclude_user_id and order.owner_id == exclude_user_id:
            continue
        order_type = normalize_str(getattr(order, "truck_type", ""))
        if order_type != tr_type:
            continue
        order_date = parse_date(getattr(order, "load_date", ""))
        if not order_date or not tr_from or not tr_to:
            continue
        if not (tr_from <= order_date <= tr_to):
            continue
        # Проверка по радиусу или по городу:
        matched = False
        try:
            tr_radius = float(getattr(transport, "from_radius", 0) or 0)
        except Exception:
            tr_radius = 0
        if (
            tr_radius > 0 and transport.from_location_lat is not None
            and transport.from_location_lng is not None
            and getattr(order, "from_locations_coords", None)
        ):
            for coord in order.from_locations_coords:
                try:
                    dist = haversine(
                        float(coord["lat"]), float(coord["lng"]),
                        float(transport.from_location_lat), float(transport.from_location_lng)
                    )
                    if dist <= tr_radius:
                        matched = True
                        break
                except Exception as e:
                    continue
        if not matched and tr_city and getattr(order, "from_locations", None):
            if any(tr_city == normalize_city(city) for city in order.from_locations):
                matched = True
        if matched:
            results.append(order)
    return results


def find_matching_orders(order_data, db, exclude_user_id=None):
    query = db.query(Order).filter(
        Order.truck_type == order_data.truck_type,
        Order.load_date == order_data.load_date,
        Order.is_active == True  # <--- Правильное поле активности
    )
    if exclude_user_id:
        query = query.filter(Order.owner_id != exclude_user_id)
    return query.all()

# Найти совпадающие транспорты для заявки по типу кузова, дате, координатам/радиусу
from datetime import datetime

def normalize_str(val):
    if not val:
        return ""
    return str(val).strip().lower().replace("ё", "е")

def normalize_city(city):
    return normalize_str(city)

def parse_date(date_str):
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(date_str, fmt)
        except Exception:
            continue
    return None

def find_matching_transports(order, db, exclude_user_id=None):
    from models import Transport
    print(f"[MATCH DEBUG] order_data.id={getattr(order, 'id', None)} truck_type={order.truck_type} load_date={order.load_date}")

    # Собираем все активные транспорты, подходящие по типу кузова
    candidates = db.query(Transport).filter(
        Transport.is_active == True,
    ).all()
    print(f"[MATCH DEBUG] found {len(candidates)} transport candidates (all active)")

    results = []
    order_truck_type = normalize_str(getattr(order, "truck_type", ""))
    order_date = parse_date(getattr(order, "load_date", ""))

    for tr in candidates:
        if exclude_user_id and tr.owner_id == exclude_user_id:
            continue

        tr_truck_type = normalize_str(getattr(tr, "truck_type", ""))
        if tr_truck_type != order_truck_type:
            continue

        tr_from = parse_date(getattr(tr, "ready_date_from", ""))
        tr_to = parse_date(getattr(tr, "ready_date_to", "")) or tr_from
        if not order_date or not tr_from or not tr_to:
            continue
        if not (tr_from <= order_date <= tr_to):
            continue

        try:
            tr_radius = float(getattr(tr, "from_radius", 0) or 0)
        except Exception:
            tr_radius = 0

        print(f"[MATCH DEBUG] Transport {tr.id} radius={tr_radius} from_lat={tr.from_location_lat} from_lng={tr.from_location_lng}")

        # Проверка по радиусу (координаты!)
        matched = False
        if (
            tr_radius > 0
            and tr.from_location_lat is not None
            and tr.from_location_lng is not None
            and getattr(order, "from_locations_coords", None)
        ):
            for coord in order.from_locations_coords:
                try:
                    dist = haversine(
                        float(coord["lat"]), float(coord["lng"]),
                        float(tr.from_location_lat), float(tr.from_location_lng)
                    )
                    print(f"[MATCH DEBUG] Coord {coord} => dist={dist:.2f}km (limit {tr_radius}km)")
                    if dist <= tr_radius:
                        print(f"[MATCH DEBUG] => MATCHED BY RADIUS: order_id={getattr(order, 'id', None)} transport_id={tr.id}")
                        results.append(tr)
                        matched = True
                        break
                except Exception as e:
                    print(f"[MATCH ERROR] Exception in radius check: {e}")
        # Если не совпало по радиусу, fallback на город
        if not matched and tr.from_location and getattr(order, "from_locations", None):
            tr_city = normalize_city(tr.from_location)
            if any(tr_city == normalize_city(city) for city in order.from_locations):
                print(f"[MATCH DEBUG] => MATCHED BY CITY: order_id={getattr(order, 'id', None)} transport_id={tr.id}")
                results.append(tr)

    print(f"[MATCH DEBUG] order_id={getattr(order, 'id', None)}: {len(results)} matches found")
    return results

@router.patch("/matches/mark_read")
def mark_matches_as_read(
    transport_id: str = None,
    order_id: int = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    if not transport_id and not order_id:
        raise HTTPException(status_code=400, detail="transport_id or order_id required")

    query = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.type == NotificationType.AUTO_MATCH,
        Notification.read == False
    )
    if transport_id:
        query = query.filter(Notification.related_id == str(transport_id))
    if order_id:
        query = query.filter(Notification.related_id == str(order_id))
    updated = query.update({"read": True}, synchronize_session="fetch")
    db.commit()
    return {"marked_read": updated}

