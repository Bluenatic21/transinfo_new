from math import radians, cos, sin, asin, sqrt
from datetime import datetime, timedelta
import asyncio
from collections import defaultdict
import heapq
from typing import Iterator, TypeVar
from jose import jwt, JWTError
from auth import get_token_from_header_or_cookie, SECRET_KEY, ALGORITHM
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session, noload
from sqlalchemy import and_, or_
import os
import json

from database import get_db
from auth import get_current_user
from models import Transport, Order, NotificationType, Notification
# используем ту же модель/алиас, что и в проекте
from models import UserBlock as UB

router = APIRouter()

# Shared implementation with auth + keepalive


async def _notifications_ws_impl(websocket: WebSocket):
    """
    Authenticates the websocket, validates that query ?user_id matches the token,
    registers the connection, and keeps it alive (responds to ping).
    """
    from auth import get_token_from_header_or_cookie, get_current_user
    from database import SessionLocal
    # Extract token and query args
    # Принять соединение ДО проверки (чтобы не получить HTTP 403 на рукопожатии)
    subproto = None
    req_proto = websocket.headers.get("sec-websocket-protocol")
    if req_proto:
        parts = [p.strip().lower() for p in req_proto.split(",")]
        if "bearer" in parts:
            subproto = "bearer"
    try:
        await websocket.accept(subprotocol=subproto)
    except Exception:
        return

    # Извлекаем токен (приоритет уже правильный в auth.get_token_from_header_or_cookie)
    try:
        token = get_token_from_header_or_cookie(
            request=None, websocket=websocket)
    except Exception:
        token = None

    user_id_qs = websocket.query_params.get("user_id")
    # Verify token -> user
    db = SessionLocal()
    try:
        if not token:
            await websocket.close(code=4401)
            return
        try:
            current_user = get_current_user(db=db, token=token)
        except Exception:
            await websocket.close(code=4401)
            return
        if not user_id_qs or str(current_user.id) != str(user_id_qs):
            await websocket.close(code=4401)
            return

        key = str(current_user.id)
        user_notification_connections[key].add(websocket)
        try:
            while True:
                # keep alive: accept {"type":"ping"} and respond {"type":"pong"}
                msg = await websocket.receive_text()
                if not msg:
                    continue
                try:
                    import json
                    data = json.loads(msg)
                    if isinstance(data, dict) and data.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                except Exception:
                    pass
        except WebSocketDisconnect:
            pass
        finally:
            user_notification_connections[key].discard(websocket)
    finally:
        try:
            db.close()
        except Exception:
            pass

# user_id -> set of websocket connections
user_notification_connections = defaultdict(set)

# --- streaming helpers -------------------------------------------------------

T = TypeVar("T")


def _stream_query(query, *, chunk_size: int = 256) -> Iterator[T]:
    """Iterate over a SQLAlchemy query without loading everything into memory."""

    query = query.options(noload("*"))
    stream = query.execution_options(stream_results=True).yield_per(chunk_size)
    session = query.session
    for row in stream:
        yield row
        session.expunge(row)


# --------------------------- WEBSOCKET /notifications ---------------------------
# Фронт соединяется как ws://<host>/notifications?user_id=...&token=...
# Здесь мы регистрируем соединение и держим его открытым (для push по create_notification).


@router.websocket("/ws/notifications")
async def notifications_ws(websocket: WebSocket):
    return await _notifications_ws_impl(websocket)


@router.websocket("/notifications")
async def _legacy_notifications_ws_original(websocket: WebSocket, user_id: int = Query(...), token: str = Query(None)):
    # backward-compatible path
    return await _notifications_ws_impl(websocket)

# ------------------------------ УТИЛИТЫ ------------------------------


def haversine(lat1, lon1, lat2, lon2):
    """Расстояние между двумя координатами, км"""
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(float, [lat1, lon1, lat2, lon2])
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * \
        cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return R * c


ORDER_DEFAULT_RADIUS_KM = float(os.getenv("ORDER_DEFAULT_RADIUS_KM", "80"))

# Максимальное количество автосовпадений для одного заказа/транспорта
# (чтобы не слать десятки/сотни уведомлений и не грузить CPU/ОЗУ)
AUTO_MATCH_MAX_NOTIFICATIONS_PER_ENTITY = int(
    os.getenv("AUTO_MATCH_MAX_NOTIFICATIONS_PER_ENTITY", "50")
)

# На сколько дней назад смотреть при автопоиске совпадений (по created_at).
# Если поставить 0 или отрицательное значение, ограничение по давности отключится.
AUTO_MATCH_LOOKBACK_DAYS = int(
    os.getenv("AUTO_MATCH_LOOKBACK_DAYS", "90")
)


def _parse_km(val, default=0.0):
    try:
        v = float(val) if val is not None else default
        if v < 0:
            return default
        return v
    except Exception:
        return default


def _order_pickup_coords(order):
    """Возвращает список (lat,lng) для точки(точек) погрузки заказа."""
    coords = []
    arr = getattr(order, "from_locations_coords", None) or []
    for c in arr:
        lat = c.get("lat") or c.get("latitude")
        lng = c.get("lng") or c.get("lon") or c.get("longitude")
        if lat is None or lng is None:
            continue
        try:
            coords.append((float(lat), float(lng)))
        except Exception:
            continue
    if not coords:
        # фоллбек на одиночные поля
        lat = getattr(order, "from_location_lat", None)
        lng = getattr(order, "from_location_lng", None)
        if lat is not None and lng is not None:
            try:
                coords.append((float(lat), float(lng)))
            except Exception:
                pass
    return coords


def _transport_pickup_point(transport):
    """Возвращает (lat,lng) точки старта транспорта, либо None."""
    lat = getattr(transport, "from_location_lat", None)
    lng = getattr(transport, "from_location_lng", None)
    if lat is None or lng is None:
        return None
    try:
        return (float(lat), float(lng))
    except Exception:
        return None


def _nearest_distance_km(point, coords):
    best = None
    for (la, lo) in coords:
        d = haversine(la, lo, point[0], point[1])
        best = d if best is None else min(best, d)
    return best if best is not None else float("inf")


def _check_location_match(transport, order):
    """Симметричная проверка гео-Соответствия по радиусу.
    Возвращает: (matched: bool, reason: str|None, best_dist_km: float)
    reason ∈ {"by_transport_radius","by_order_radius","by_city",None}
    """
    tr_point = _transport_pickup_point(transport)
    order_coords = _order_pickup_coords(order)

    tr_radius = _parse_km(getattr(transport, "from_radius", 0), default=0.0)

    ord_radius_raw = getattr(order, "from_radius", None)
    # если у заказа явный радиус не задан, используем дефолт (можно подкрутить ENV)
    ord_radius = _parse_km(
        ord_radius_raw,
        default=ORDER_DEFAULT_RADIUS_KM
    ) if ord_radius_raw in (None, "", 0, "0") else _parse_km(ord_radius_raw, default=0.0)

    # 1) Радиус транспорта → точки заказа
    if tr_point and tr_radius > 0 and order_coords:
        for (la, lo) in order_coords:
            if haversine(la, lo, tr_point[0], tr_point[1]) <= tr_radius:
                return True, "by_transport_radius", 0.0

    # 2) Радиус заказа → точка транспорта
    if tr_point and ord_radius > 0 and order_coords:
        d = _nearest_distance_km(tr_point, order_coords)
        if d <= ord_radius:
            return True, "by_order_radius", d

    # 3) Фоллбек по городу
    tr_city = normalize_city(getattr(transport, "from_location", "") or "")
    order_cities = [normalize_city(c) for c in (
        getattr(order, "from_locations", None) or [])]
    if tr_city and order_cities and any(c == tr_city for c in order_cities):
        return True, "by_city", float("inf")

    # 4) Нет Соответствия — вернём ближайшую дистанцию (для UI-подсказок)
    if tr_point and order_coords:
        d = _nearest_distance_km(tr_point, order_coords)
        return False, None, d

    return False, None, float("inf")


def normalize_str(val):
    if not val:
        return ""
    return str(val).strip().lower().replace("ё", "е")


# Мульти-язычные синонимы «Постоянно» (значение поля Transport.mode)
# ru, ka, en, tr, az, hy
PERMANENT_MODE_ALIASES = {
    "постоянно",                 # RU
    "მუდმივად",                 # KA
    "always", "always ready",    # EN
    "constant", "permanent",     # EN
    "daimi",                     # AZ (и TR часто)
    "sürekli", "surekli",        # TR (с диакритикой и без)
    "մշտապես", "մշտական",       # HY
}


def is_permanent_mode(val) -> bool:
    return normalize_str(val) in PERMANENT_MODE_ALIASES


# ---- Канонизация типа кузова (многоязычные синонимы → короткий код) ----
TRUCK_TYPE_ALIASES = {
    "refr_tent": {
        "реф/тент", "реф-тент", "рефтент", "реф тент",
        "refr/tent", "refr-tent", "refr tent",
    },
    "tent": {
        "тентованный", "тент", "штора",
        "tent", "tarpaulin", "curtain",
        "ფარდა", "ტენტი",
    },
    "refr": {
        "рефрижератор", "реф",
        "refrigerator", "refrigerated", "fridge",
        "სარეფრიჟერატორო",
    },
    "isotherm": {
        "изотермический", "изотерм",
        "isotherm", "isothermal",
        "იზოთერმული",
    },
}


def canon_truck_type(val: str) -> str:
    s = normalize_str(val)
    for code, aliases in TRUCK_TYPE_ALIASES.items():
        if s in aliases:
            return code
    # Фоллбек: сравнение по нормализованной строке, если неизвестный ярлык
    return s


def are_truck_types_compatible(order_code: str, tr_code: str) -> bool:
    """
    True, если тип кузова заказа совместим с типом транспорта.
    Особое правило: "реф/тент" совместим и с "реф", и с "тент".
    Сравнение выполняется по каноническим кодам (см. TRUCK_TYPE_ALIASES).
    """
    o = (order_code or "").strip()
    t = (tr_code or "").strip()
    if not o or not t:
        return False
    if o == t:
        return True
    # "реф/тент" ↔ реф ИЛИ тент (симметрично, на всякий случай)
    if o == "refr_tent":
        return t in {"refr", "tent"}
    if t == "refr_tent":
        return o in {"refr", "tent"}
    return False


def normalize_city(city):
    return normalize_str(city)


def parse_date(date_str):
    """Пробуем несколько форматов дат проекта"""
    # ISO ставим первым, далее слеши и точки
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(date_str, fmt)
        except Exception:
            continue
    return None


def _is_blocked_pair(db: Session, a_id: int, b_id: int) -> bool:
    """True, если хотя бы один из пользователей заблокировал другого (симметрия по эффекту)."""
    return db.query(UB.id).filter(
        or_(
            and_(UB.blocker_id == a_id, UB.blocked_id == b_id),
            and_(UB.blocker_id == b_id, UB.blocked_id == a_id),
        )
    ).first() is not None

# --------------------------- PUSH УВЕДОМЛЕНИЙ ---------------------------


async def push_notification(user_id, data):
    print(f"[WS][PUSH_NOTIFY] push_notification user_id={user_id} data={data}")
    ws_set = user_notification_connections.get(str(user_id))
    if ws_set:
        for ws in ws_set.copy():
            try:
                await ws.send_json(data)
            except Exception as e:
                user_notification_connections[str(user_id)].discard(ws)
                print(f"[ERROR] push_notification WS send_json: {e}")


def create_notification(
    db: Session,
    user_id,
    notif_type,
    message,
    related_id=None,
    payload=None,
    *,
    auto_commit: bool = True,
):
    """
    Создаёт запись в БД notifications и пушит событие по WS (асинхронно).
    Для AUTO_MATCH действует дедупликация за последние 7 дней по (user_id, type, related_id).
    """
    if notif_type == NotificationType.AUTO_MATCH:
        week_ago = datetime.utcnow() - timedelta(days=7)
        existing = db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.type == notif_type,
            Notification.related_id == str(related_id),
            Notification.created_at > week_ago
        ).first()
        if existing:
            return

    # --- ДЕДУПЛИКАЦИЯ ДЛЯ ПРОСРОЧЕК ПО ТРАНСПОРТАМ (на 24 часа) ---
    # Поддерживаем и Enum, и строковые значения типа ('TRANSPORT_OVERDUE_1', ...).
    try:
        # Приведём notif_type к Enum, если пришла строка
        nt_obj = notif_type
        if isinstance(nt_obj, str):
            try:
                nt_obj = NotificationType[nt_obj]
            except Exception:
                nt_obj = None

        dedup_types = {
            NotificationType.TRANSPORT_OVERDUE_1,
            NotificationType.TRANSPORT_OVERDUE_4,
            NotificationType.TRANSPORT_OVERDUE_7,
            NotificationType.TRANSPORT_AUTO_DISABLED,
        }
        if nt_obj in dedup_types:
            since = datetime.utcnow() - timedelta(hours=24)
            exists = db.query(Notification).filter(
                Notification.user_id == user_id,
                Notification.type == nt_obj,
                Notification.related_id == str(related_id),
                Notification.created_at > since
            ).first()
            if exists:
                return
    except Exception as e:
        # Не валим уведомление, просто логируем.
        print("[WARN] Transport overdue dedup check failed:", e)

    notif = Notification(
        user_id=user_id,
        type=notif_type,
        message=message,
        related_id=str(related_id) if related_id is not None else None,
        payload=payload,
        created_at=datetime.utcnow(),
        read=False,
    )
    db.add(notif)
    if auto_commit:
        db.commit()
        db.refresh(notif)
    else:
        # Flush to assign primary key/values without ending the surrounding
        # transaction – the caller is responsible for committing later.
        db.flush()

    event = {
        "event": "new_notification",
        "id": notif.id,
        "type": notif.type.value,
        "message": notif.message,
        "related_id": notif.related_id,
        "payload": notif.payload,
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

# --------------------------- REST: UNREAD / READ ---------------------------


@router.get("/matches/unread_count")
def get_unread_matches(
    transport_id: str = None,
    order_id: int = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not transport_id and not order_id:
        raise HTTPException(
            status_code=400, detail="transport_id or order_id required")

    query = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.type == NotificationType.AUTO_MATCH,
        Notification.read == False,
    )
    if transport_id:
        query = query.filter(Notification.related_id == str(transport_id))
    if order_id:
        query = query.filter(Notification.related_id == str(order_id))
    return {"unread": query.count()}


@router.patch("/matches/mark_read")
def mark_matches_as_read(
    transport_id: str = None,
    order_id: int = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not transport_id and not order_id:
        raise HTTPException(
            status_code=400, detail="transport_id or order_id required")

    query = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.type == NotificationType.AUTO_MATCH,
        Notification.read == False,
    )
    if transport_id:
        query = query.filter(Notification.related_id == str(transport_id))
    if order_id:
        query = query.filter(Notification.related_id == str(order_id))

    updated = query.update({"read": True}, synchronize_session="fetch")
    db.commit()
    return {"marked_read": updated}

# --------------------------- АВТОПОДБОРЫ + НОТИФИКАЦИИ ---------------------------


def _format_transport_period(tr: Transport) -> str:
    """Возвращает человекочитаемый период для транспорта.
    Если есть даты готовности — "from – to";
    иначе собирает из mode/regularity (например: "постоянно, каждый день").
    """
    try:
        start = (getattr(tr, "ready_date_from", None) or "").strip()
        end = (getattr(tr, "ready_date_to", None) or "").strip()
        mode = (getattr(tr, "mode", None) or "").strip()
        reg = (getattr(tr, "regularity", None) or "").strip()
        if start:
            return f"{start} – {end or start}"
        parts = [p for p in [mode, reg] if p]
        return ", ".join(parts)
    except Exception:
        return ""


def find_and_notify_auto_match_for_order(order: Order, db: Session):
    """
    ORDER -> TRANSPORT: находит подходящие транспорты и уведомляет владельцев транспорта.
    Учитывает блокировки (A↔B).
    Использует _stream_query, чтобы не грузить все транспорты в память.
    """
    print(
        f"\n[AUTO_MATCH][ORDER->TRANSPORT] START "
        f"order.id={order.id} owner_id={order.owner_id} "
        f"type={order.truck_type} (code={canon_truck_type(getattr(order, 'truck_type', ''))})"
    )

    # Базовая валидация
    if not order.from_locations or not order.truck_type or not order.load_date:
        print("[AUTO_MATCH][ORDER->TRANSPORT] order missing key data")
        return

    order_cities = [normalize_city(c) for c in (order.from_locations or [])]
    order_truck_type = canon_truck_type(getattr(order, "truck_type", ""))
    order_date = parse_date(getattr(order, "load_date", ""))

    if not order_date:
        print("[AUTO_MATCH][ORDER->TRANSPORT] cannot parse order.load_date")
        return

    # Ограничение по давности (по created_at транспорта)
    cutoff = None
    if AUTO_MATCH_LOOKBACK_DAYS > 0:
        try:
            cutoff = datetime.utcnow() - timedelta(days=AUTO_MATCH_LOOKBACK_DAYS)
        except Exception:
            cutoff = None

    transport_query = db.query(Transport).filter(
        Transport.is_active == True,
        Transport.from_location.isnot(None),
        Transport.ready_date_from.isnot(None),
    )
    if cutoff is not None:
        transport_query = transport_query.filter(Transport.created_at >= cutoff)

    total_candidates = transport_query.order_by(None).count()
    print(
        f"[AUTO_MATCH][ORDER->TRANSPORT] "
        f"Total active transports (with created_at filter={cutoff is not None}): "
        f"{total_candidates}"
    )

    matched = 0

    try:
        for tr in _stream_query(transport_query):
            # Не уведомляем самого себя
            if tr.owner_id == order.owner_id:
                continue

            # Блокировки в обе стороны
            if _is_blocked_pair(db, order.owner_id, tr.owner_id):
                continue

            tr_truck_type = canon_truck_type(getattr(tr, "truck_type", ""))
            if not are_truck_types_compatible(order_truck_type, tr_truck_type):
                continue

            tr_mode_raw = getattr(tr, "mode", "")
            tr_mode = normalize_str(tr_mode_raw)
            is_permanent = is_permanent_mode(tr_mode)
            tr_from = parse_date(getattr(tr, "ready_date_from", ""))
            tr_to = parse_date(getattr(tr, "ready_date_to", "")) or tr_from

            # Дата
            if not is_permanent:
                if not tr_from or not tr_to:
                    continue
                if not (tr_from <= order_date <= tr_to):
                    continue

            # Локация
            matched_loc, loc_reason, nearest_km = _check_location_match(tr, order)
            if not matched_loc:
                continue

            # --- формируем уведомление (как было) ---
            import json

            route = ", ".join(order.from_locations or [])
            date = order.load_date or ""
            truck_type = getattr(order, "truck_type", "")

            params = json.dumps(
                {
                    "route": route,
                    "date": date,
                    "truckType": truck_type,
                },
                ensure_ascii=False,
            )

            reason_label = ""
            if loc_reason == "by_transport_radius":
                reason_label = " · Соответствия по радиусу транспорта"
            elif loc_reason == "by_order_radius":
                reason_label = " · Соответствия по радиусу груза"
            elif loc_reason == "by_city":
                reason_label = " · Соответствия по городу"

            fallback = (
                f"Найден новый груз: {route}, дата: {date}. "
                f"Тип транспорта: {truck_type}."
            )
            message = f"notif.match.orderFound|{params}|{fallback}{reason_label}"

            create_notification(
                db=db,
                user_id=tr.owner_id,
                notif_type=NotificationType.AUTO_MATCH,
                message=message,
                related_id=str(order.id),
                payload={
                    "entity": "order",
                    "target_url": f"/orders/{order.id}",
                },
            )
            matched += 1

            # Лимит по количеству уведомлений для одного заказа
            if matched >= AUTO_MATCH_MAX_NOTIFICATIONS_PER_ENTITY:
                print(
                    f"[AUTO_MATCH][ORDER->TRANSPORT] "
                    f"limit {AUTO_MATCH_MAX_NOTIFICATIONS_PER_ENTITY} reached, stop"
                )
                break

        print(
            f"[AUTO_MATCH][ORDER->TRANSPORT] DONE order_id={getattr(order, 'id', None)} "
            f"matches={matched}"
        )
    except Exception as e:
        print(
            f"[AUTO_MATCH][ORDER->TRANSPORT] ERROR order_id={getattr(order, 'id', None)}: {e}"
        )


def find_and_notify_auto_match_for_transport(transport: Transport, db: Session):
    """
    TRANSPORT -> ORDER: находит подходящие заказы и уведомляет владельцев заказов.
    Учитывает блокировки _в обе стороны_ (A↔B).
    Использует _stream_query + лимиты, чтобы не грузить память.
    """
    print(
        f"\n[AUTO_MATCH][TRANSPORT->ORDER] START "
        f"transport.id={transport.id} owner_id={transport.owner_id} "
        f"type={transport.truck_type} (code={canon_truck_type(getattr(transport, 'truck_type', ''))})"
    )

    # Базовая валидация
    if not transport.from_location or not transport.truck_type:
        print("[AUTO_MATCH][TRANSPORT->ORDER] transport missing key data")
        return

    tr_type = canon_truck_type(getattr(transport, "truck_type", ""))
    tr_mode_raw = getattr(transport, "mode", "")
    tr_mode = normalize_str(tr_mode_raw)
    is_permanent = is_permanent_mode(tr_mode)
    tr_from = parse_date(getattr(transport, "ready_date_from", ""))
    tr_to = parse_date(getattr(transport, "ready_date_to", "")) or tr_from

    _iso_from = tr_from
    _iso_to = tr_to
    print(
        f"[AUTO_MATCH][TRANSPORT->ORDER] mode='{tr_mode_raw}' -> permanent={is_permanent} "
        f"ready={getattr(transport, 'ready_date_from', '')}."
        f"{getattr(transport, 'ready_date_to', '')} -> "
        f"\"{_iso_from.strftime('%Y-%m-%d') if _iso_from else '-'}."
        f"{_iso_to.strftime('%Y-%m-%d') if _iso_to else '-'}\""
    )

    # Ограничение по давности (по created_at заказа)
    cutoff = None
    if AUTO_MATCH_LOOKBACK_DAYS > 0:
        try:
            cutoff = datetime.utcnow() - timedelta(days=AUTO_MATCH_LOOKBACK_DAYS)
        except Exception:
            cutoff = None

    # Стриминг активных заказов
    order_query = db.query(Order).filter(
        Order.is_active == True,
        Order.from_locations.isnot(None),
        Order.load_date.isnot(None),
    )
    if cutoff is not None:
        order_query = order_query.filter(Order.created_at >= cutoff)

    total_orders = order_query.order_by(None).count()
    print(
        f"[AUTO_MATCH][TRANSPORT->ORDER] Total active orders "
        f"(with created_at filter={cutoff is not None}): {total_orders}"
    )

    matched = 0

    try:
        import json

        for order in _stream_query(order_query):
            # Не матчим самих себя
            if order.owner_id == transport.owner_id:
                continue

            # Блокировки (оба направления)
            if _is_blocked_pair(db, order.owner_id, transport.owner_id):
                continue

            order_type = canon_truck_type(getattr(order, "truck_type", ""))
            if not are_truck_types_compatible(order_type, tr_type):
                continue

            order_date = parse_date(getattr(order, "load_date", ""))
            if not order_date:
                continue

            # Дата
            if not is_permanent:
                if not tr_from or not tr_to:
                    continue
                if not (tr_from <= order_date <= tr_to):
                    continue

            # Локация
            matched_loc, loc_reason, nearest_km = _check_location_match(
                transport, order
            )
            if not matched_loc:
                continue

            # --- формируем уведомление (как раньше) ---
            route = ", ".join(order.from_locations or [])
            date = order.load_date or ""
            truck_type = getattr(order, "truck_type", "")

            params = json.dumps(
                {"route": route, "date": date, "truckType": truck_type},
                ensure_ascii=False,
            )

            reason_label = ""
            if loc_reason == "by_transport_radius":
                reason_label = " · Соответствия по радиусу транспорта"
            elif loc_reason == "by_order_radius":
                reason_label = " · Соответствия по радиусу груза"
            elif loc_reason == "by_city":
                reason_label = " · Соответствия по городу"

            fallback = (
                f"Найден новый груз: {route}, дата: {date}. "
                f"Тип транспорта: {truck_type}."
            )
            message = f"notif.match.orderFound|{params}|{fallback}{reason_label}"

            create_notification(
                db=db,
                user_id=order.owner_id,
                notif_type=NotificationType.AUTO_MATCH,
                message=message,
                related_id=str(transport.id),
                payload={
                    "entity": "transport",
                    "target_url": f"/transports/{transport.id}",
                },
            )
            matched += 1

            # Лимит по количеству уведомлений для одного транспорта
            if matched >= AUTO_MATCH_MAX_NOTIFICATIONS_PER_ENTITY:
                print(
                    f"[AUTO_MATCH][TRANSPORT->ORDER] "
                    f"limit {AUTO_MATCH_MAX_NOTIFICATIONS_PER_ENTITY} reached, stop"
                )
                break

        print(
            f"[AUTO_MATCH][TRANSPORT->ORDER] DONE transport_id={getattr(transport, 'id', None)} "
            f"matches={matched}"
        )
    except Exception as e:
        print(
            f"[AUTO_MATCH][TRANSPORT->ORDER] ERROR transport_id={getattr(transport, 'id', None)}: {e}"
        )
# --------------------------- ПОИСК Соответствий (без уведомлений) ---------------------------


def find_matching_orders_for_transport(
    transport: Transport,
    db: Session,
    exclude_user_id=None,
):
    """
    Находит заказы, совпадающие с транспортом (для UI/фильтра matches_only).
    Без уведомлений. Учитывает блокировки.
    """
    # Базовый запрос по активным заказам
    order_query = db.query(Order).filter(Order.is_active == True)
    if exclude_user_id:
        order_query = order_query.filter(Order.owner_id != exclude_user_id)

    total_orders = order_query.order_by(None).count()
    print(
        f"[MATCH LIST T->O] total active orders={total_orders} for transport_id={getattr(transport, 'id', None)}"
    )

    results = []
    seen = set()

    tr_type = canon_truck_type(getattr(transport, "truck_type", ""))
    tr_mode_raw = getattr(transport, "mode", "")
    tr_mode = normalize_str(tr_mode_raw)
    is_permanent = is_permanent_mode(tr_mode)
    tr_from = parse_date(getattr(transport, "ready_date_from", ""))
    tr_to = parse_date(getattr(transport, "ready_date_to", "")) or tr_from

    for order in _stream_query(order_query):
        if exclude_user_id and order.owner_id == exclude_user_id:
            continue
        if _is_blocked_pair(db, order.owner_id, transport.owner_id):
            continue

        order_type = canon_truck_type(getattr(order, "truck_type", ""))
        if order_type != tr_type:
            continue

        order_date = parse_date(getattr(order, "load_date", ""))
        if not order_date:
            continue

        if not is_permanent:
            if not tr_from or not tr_to:
                continue
            if not (tr_from <= order_date <= tr_to):
                continue

        matched, _, _ = _check_location_match(transport, order)
        if not matched:
            continue

        oid = getattr(order, "id", None)
        if oid is not None and oid not in seen:
            seen.add(oid)
            results.append(order)

    print(
        f"[MATCH LIST T->O] transport_id={getattr(transport, 'id', None)} matches={len(results)}"
    )
    return results



def find_matching_orders(order_data: Order, db: Session, exclude_user_id=None):
    """
    Находит совпадающие заказы к заказу по типу/дате (используется в некоторых местах UI).
    """
    query = db.query(Order).filter(
        Order.truck_type == order_data.truck_type,
        Order.load_date == order_data.load_date,
        Order.is_active == True,
    )
    if exclude_user_id:
        query = query.filter(Order.owner_id != exclude_user_id)
    return query.all()


def find_matching_transports(order: Order, db: Session, exclude_user_id=None):
    """
    Находит совпадающие транспорты к заказу. Без отправки уведомлений.
    Учитывает блокировки.
    Используется фильтр matches_only и карточки Соответствий.
    """
    _order_iso = parse_date(getattr(order, "load_date", ""))
    print(
        f"[MATCH DEBUG] order.id={getattr(order, 'id', None)} "
        f"truck_type={order.truck_type} (code={canon_truck_type(getattr(order, 'truck_type', ''))}) "
        f"load_date={order.load_date} -> "
        f"\"{_order_iso.strftime('%Y-%m-%d') if _order_iso else '-'}\""
    )

    transport_query = db.query(Transport).filter(Transport.is_active == True)
    if exclude_user_id:
        transport_query = transport_query.filter(
            Transport.owner_id != exclude_user_id
        )

    total_candidates = transport_query.order_by(None).count()
    print(
        f"[MATCH DEBUG] found {total_candidates} transport candidates (all active)"
    )

    results = []
    seen = set()  # dedupe by id

    order_truck_type = canon_truck_type(getattr(order, "truck_type", ""))
    order_date = parse_date(getattr(order, "load_date", ""))

    for tr in _stream_query(transport_query):
        if exclude_user_id and tr.owner_id == exclude_user_id:
            continue
        if _is_blocked_pair(db, order.owner_id, tr.owner_id):
            continue

        tr_truck_type = canon_truck_type(getattr(tr, "truck_type", ""))
        if not are_truck_types_compatible(order_truck_type, tr_truck_type):
            continue

        tr_mode = normalize_str(getattr(tr, "mode", ""))
        is_permanent = is_permanent_mode(tr_mode)
        tr_from = parse_date(getattr(tr, "ready_date_from", ""))
        tr_to = parse_date(getattr(tr, "ready_date_to", "")) or tr_from

        if not order_date:
            continue
        if not is_permanent:
            if not tr_from or not tr_to:
                continue
            if not (tr_from <= order_date <= tr_to):
                continue

        matched, _, _ = _check_location_match(tr, order)
        if not matched:
            continue

        tr_id = getattr(tr, "id", None)
        if tr_id is not None and tr_id not in seen:
            seen.add(tr_id)
            results.append(tr)

    print(
        f"[MATCH DEBUG] order_id={getattr(order, 'id', None)}: {len(results)} matches found"
    )
    return results



def nearest_orders_for_transport(transport: Transport, db: Session, limit: int = 10):
    tr_point = _transport_pickup_point(transport)
    if not tr_point:
        return []
    order_query = db.query(Order).filter(Order.is_active == True)
    scored_heap = []
    for order in _stream_query(order_query):
        coords = _order_pickup_coords(order)
        if not coords:
            continue
        d = _nearest_distance_km(tr_point, coords)
        if d == float("inf"):
            continue
        if len(scored_heap) < limit:
            heapq.heappush(scored_heap, (-d, order))
        else:
            worst = -scored_heap[0][0]
            if d < worst:
                heapq.heapreplace(scored_heap, (-d, order))
    scored = sorted(scored_heap, key=lambda item: -item[0])
    return [(order, -distance) for distance, order in scored]


def nearest_transports_for_order(order: Order, db: Session, limit: int = 10):
    coords = _order_pickup_coords(order)
    if not coords:
        return []
    transport_query = db.query(Transport).filter(Transport.is_active == True)
    scored_heap = []
    for tr in _stream_query(transport_query):
        tr_point = _transport_pickup_point(tr)
        if not tr_point:
            continue
        d = _nearest_distance_km(tr_point, coords)
        if d == float("inf"):
            continue
        if len(scored_heap) < limit:
            heapq.heappush(scored_heap, (-d, tr))
        else:
            worst = -scored_heap[0][0]
            if d < worst:
                heapq.heapreplace(scored_heap, (-d, tr))
    scored = sorted(scored_heap, key=lambda item: -item[0])
    return [(tr, -distance) for distance, tr in scored]
