from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, timedelta
from models import Order, Transport, ChatMessage, ChatParticipant, NotificationType
from database import SessionLocal
from notifications import create_notification
from support_models import SupportTicket, TicketStatus
from ws_events import ws_emit_to_chat
import asyncio

# --- SUPPORT: авто-закрытие чатов по бездействию ---


def _emit_ws_sync(chat_id: int, payload: dict):
    """
    Безопасная отправка async ws_emit_to_chat из планировщика (поток APScheduler).
    Делает маленький локальный loop, если нет текущего.
    """
    try:
        asyncio.get_running_loop()
        # Если вдруг есть общий loop — запускаем таском
        asyncio.create_task(ws_emit_to_chat(chat_id, payload))
    except RuntimeError:
        asyncio.run(ws_emit_to_chat(chat_id, payload))


def check_support_inactivity():
    db = SessionLocal()
    now = datetime.utcnow()
    try:
        # берём все активные/не закрытые тикеты с привязанным чатом
        tickets = (
            db.query(SupportTicket)
            .filter(SupportTicket.chat_id.isnot(None))
            .filter(SupportTicket.status.in_([TicketStatus.OPEN, TicketStatus.PENDING, TicketStatus.RESOLVED]))
            .all()
        )
        for t in tickets:
            last = t.last_message_at or t.updated_at or t.created_at
            silent_sec = (now - last).total_seconds() if last else 10**9

            # 2:00 — не было активности: старт 60-секундного отсчёта (однократно)
            if silent_sec >= 120 and not t.countdown_started_at:
                t.countdown_started_at = now
                # Persisted системное предупреждение
                warn = ChatMessage(
                    chat_id=t.chat_id,
                    sender_id=None,
                    message_type="system",
                    content="support.autoclose.warn",
                )
                db.add(warn)
                db.commit()
                # Эфемерно — запустить обратный отсчёт на клиенте
                eta = (now + timedelta(seconds=60)).isoformat() + "Z"
                _emit_ws_sync(t.chat_id, {
                    "action": "support.autoclose.countdown",
                    "chat_id": t.chat_id,
                    "data": {"seconds": 60, "until_iso": eta},
                })
                continue

            # 3:00 — финальное закрытие для пользователя
            if silent_sec >= 180:
                # Вежливое спасибо (видно в истории у поддержки)
                thanks = ChatMessage(
                    chat_id=t.chat_id,
                    sender_id=None,
                    message_type="system",
                    content="support.autoclose.thanks",
                )
                db.add(thanks)
                # Скрываем чат только для пользователя — удаляем его участие
                db.query(ChatParticipant).filter(
                    ChatParticipant.chat_id == t.chat_id,
                    ChatParticipant.user_id == t.user_id
                ).delete()
                # Помечаем тикет
                t.status = TicketStatus.CLOSED
                t.closed_at = now
                t.countdown_started_at = None
                db.commit()

                _emit_ws_sync(t.chat_id, {
                    "action": "support.autoclose.closed",
                    "chat_id": t.chat_id,
                    "data": {"closed_at_iso": now.isoformat() + "Z"},
                })
    finally:
        db.close()


def check_order_deadlines():
    db = SessionLocal()
    now = datetime.utcnow()
    orders = db.query(Order).filter(Order.is_active ==
                                    True, Order.load_date != None).all()
    for order in orders:
        if not order.load_date:
            continue
        try:
            # --- Определяем дату ---
            load_date = order.load_date
            if isinstance(load_date, str):
                ds = load_date.strip()
                if "/" in ds:
                    load_date = datetime.strptime(ds, "%d/%m/%Y")
                elif "-" in ds:
                    load_date = datetime.strptime(ds, "%Y-%m-%d")
                else:
                    continue

            days_passed = (now.date() - load_date.date()).days
            if days_passed == 1:
                create_notification(
                    db,
                    user_id=order.owner_id,
                    notif_type="ORDER_OVERDUE_1",
                    message="notif.order.overdue1|{}|Срок даты загрузки заявки истёк.",
                    related_id=order.id
                )
            elif days_passed == 4:
                create_notification(
                    db,
                    user_id=order.owner_id,
                    notif_type="ORDER_OVERDUE_4",
                    message="notif.order.overdue4|{}|Прошло 4 дня с даты загрузки. Заявка будет скрыта, если вы не обновите дату загрузки.",
                    related_id=order.id
                )
            elif days_passed == 7:
                create_notification(
                    db,
                    user_id=order.owner_id,
                    notif_type="ORDER_OVERDUE_7",
                    message="notif.order.overdue7|{}|Прошло 7 дней с даты загрузки. Обновите дату, иначе завтра заявка будет автоматически скрыта.",
                    related_id=order.id
                )
            elif days_passed >= 8:
                if order.is_active:  # --- только если ещё не отключена!
                    order.is_active = False
                    db.commit()
                    create_notification(
                        db,
                        user_id=order.owner_id,
                        notif_type="ORDER_AUTO_DISABLED",
                        message="notif.order.autoDisabled|{}|Ваша заявка скрыта из-за истечения срока.",
                        related_id=order.id
                    )
        except Exception as e:
            print("[Order Overdue Check Error]", e)
    db.close()


def _parse_date_any(ds: str):
    """Поддерживаем dd.mm.yyyy, dd/mm/yyyy, yyyy-mm-dd."""
    ds = (ds or "").strip()
    for fmt in ("%d.%m.%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(ds, fmt)
        except Exception:
            pass
    return None


def check_transport_deadlines():
    """Ежедневная проверка просрочки по ТРАНСПОРТАМ от даты 'ready_date_to' (дата 'до')."""
    db = SessionLocal()
    now = datetime.utcnow()
    try:
        # Берём только активные транспорты
        transports = db.query(Transport).filter(
            Transport.is_active.is_(True)).all()
        for tr in transports:
            to_raw = getattr(tr, "ready_date_to", None)
            if not to_raw:
                continue
            to_dt = _parse_date_any(to_raw) if isinstance(
                to_raw, str) else to_raw
            if not to_dt:
                continue

            # Сколько дней прошло после "даты до"
            days_passed = (now.date() - to_dt.date()).days
            if days_passed < 1:
                continue

            # 1 / 4 / 7 дней — уведомления
            if days_passed in (1, 4, 7):
                try:
                    create_notification(
                        db=db,
                        user_id=tr.owner_id,
                        notif_type=NotificationType[f"TRANSPORT_OVERDUE_{days_passed}"],
                        # ключи notif.transport.overdue1 / 4 / 7 в новом формате
                        message={
                            1: "notif.transport.overdue1|{}|По объявлению транспорта просрочка 1 день.",
                            4: "notif.transport.overdue4|{}|По объявлению транспорта просрочка 4 дня.",
                            7: "notif.transport.overdue7|{}|По объявлению транспорта просрочка 7 дней."
                        }.get(days_passed, "notif.transport.overdue1|{}|По объявлению транспорта просрочка 1 день."),
                        related_id=str(tr.id),
                    )
                except Exception as e:
                    print("[Transport Overdue Notif Error]", e)

            # >= 8 дней — авто-деактивация + уведомление
            if days_passed >= 8 and getattr(tr, "is_active", False):
                try:
                    tr.is_active = False
                    db.commit()
                    create_notification(
                        db=db,
                        user_id=tr.owner_id,
                        notif_type=NotificationType.TRANSPORT_AUTO_DISABLED,
                        message="notif.transport.autoDisabled|{}|Ваше транспортное объявление скрыто из-за истечения срока.",
                        related_id=str(tr.id),
                    )
                except Exception as e:
                    print("[Transport Auto-Disable Error]", e)
    except Exception as e:
        print("[Transport Overdue Check Error]", e)
    finally:
        db.close()


def start_scheduler():
    scheduler = BackgroundScheduler()
    # Заказы — раз в день
    scheduler.add_job(check_order_deadlines, 'cron', hour=6, minute=0)
    # Транспорты — раз в день (чуть позже, чтобы не одновременно)
    scheduler.add_job(check_transport_deadlines, 'cron', hour=6, minute=2)
    # Саппорт — каждые 10 секунд
    scheduler.add_job(check_support_inactivity, 'interval', seconds=10)
    scheduler.start()
