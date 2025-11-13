# backend/support_rest.py
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database import get_db
from notifications import push_notification
from auth import get_current_user

# ORM
from models import Chat, ChatParticipant, ChatMessage, User, UserRole
from support_models import SupportTicket, TicketStatus, SupportRating

# bot + ws
from support_bot import start_for_chat as supportbot_start, cancel_for_chat as supportbot_cancel
from chat_rest import ws_emit_to_chat as _ws_emit_to_chat

# схемы
from support_schemas import SupportTicketOut, SupportTicketCreate

router = APIRouter()

# --- безопасный пуш в WS (без жёсткой зависимости) ---
try:
    from chat_rest import ws_emit_to_chat as _ws_emit_to_chat  # type: ignore
except Exception:
    _ws_emit_to_chat = None


def _emit(db: Session, chat_id: int, action: str, payload: dict) -> None:
    if not _ws_emit_to_chat:
        return
    try:
        import asyncio
        loop = asyncio.get_running_loop()
        loop.create_task(_ws_emit_to_chat(chat_id, action, payload))
    except RuntimeError:
        # если вызываем из sync-ручки без запущенного цикла — просто игнор
        pass


# --- утилиты ---

def _is_support_user(user: User) -> bool:
    role = getattr(user, "role", None)
    return str(role.value if hasattr(role, "value") else role).upper() == "SUPPORT"


def _get_support_user_ids(db: Session) -> List[int]:
    rows = db.query(User.id, User.role).all()
    return [uid for (uid, role) in rows if str(role or "").upper() == "SUPPORT"]


def _pick_agent_id(db: Session) -> Optional[int]:
    """
    Выбираем SUPPORT с минимальным числом активных тикетов.
    (Если никого нет — вернём None, тикет останется без привязки.)
    """
    support_ids = _get_support_user_ids(db)
    if not support_ids:
        return None

    counts = {uid: 0 for uid in support_ids}
    q = (
        db.query(SupportTicket.agent_user_id, func.count(SupportTicket.id))
        .filter(
            SupportTicket.status.in_(
                [TicketStatus.OPEN, TicketStatus.PENDING]),
            SupportTicket.agent_user_id.isnot(None),
            SupportTicket.agent_user_id.in_(support_ids),
        )
        .group_by(SupportTicket.agent_user_id)
        .all()
    )
    for uid, cnt in q:
        counts[uid] = cnt

    best = min(counts.items(), key=lambda kv: kv[1])[0] if counts else None
    return best


def _to_out(t: SupportTicket) -> SupportTicketOut:
    return SupportTicketOut(
        id=t.id,
        subject=t.subject,
        category=t.category,
        priority=t.priority,
        status=(t.status.value if hasattr(
            t.status, "value") else str(t.status)),
        user_id=t.user_id,
        agent_user_id=t.agent_user_id,
        chat_id=t.chat_id,
        created_at=t.created_at,
        updated_at=t.updated_at,
        last_message_at=t.last_message_at,
    )


async def _system_message(db: Session, chat_id: int, text: str, meta: dict | None = None):
    msg = ChatMessage(
        chat_id=chat_id,
        message_type="system",
        content=text,
        sender_id=None,
        sent_at=datetime.utcnow(),
    )
    db.add(msg)
    db.commit()
    _emit(db, chat_id, "message.new", {
        "id": msg.id,
        "chat_id": chat_id,
        "message_type": "text",
        "is_system": True,
        "content": text,
        "meta": meta or {},
        "sent_at": getattr(msg, "sent_at", datetime.utcnow()).isoformat(),
    })


# -------------------------------
# Tickets
# -------------------------------

@router.post("/support/tickets", response_model=SupportTicketOut)
def create_ticket(
    payload: SupportTicketCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Кнопка «Поддержка»:
      - если у пользователя есть OPEN/PENDING — возвращаем его (чат уже есть);
      - иначе создаём новый чат и тикет,
        добавляем всех SUPPORT как участников, отправляем приветствие.
    """
    existing = (
        db.query(SupportTicket)
        .filter(SupportTicket.user_id == current_user.id)
        .filter(SupportTicket.status.in_([TicketStatus.OPEN, TicketStatus.PENDING]))
        .order_by(SupportTicket.updated_at.desc())
        .first()
    )
    if existing:
        return _to_out(existing)

    # 1) чат
    chat = Chat(is_group=False)
    db.add(chat)
    db.commit()
    db.refresh(chat)

    # 2) тикет
    t = SupportTicket(
        subject=payload.subject or "Обращение в поддержку",
        category=payload.category,
        priority=payload.priority or "normal",
        status=TicketStatus.PENDING,
        user_id=current_user.id,
        chat_id=chat.id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        last_message_at=datetime.utcnow(),
    )
    db.add(t)
    db.commit()
    db.refresh(t)

    # 3) участники: инициатор + все SUPPORT
    if not db.query(ChatParticipant).filter_by(chat_id=chat.id, user_id=current_user.id).first():
        db.add(ChatParticipant(chat_id=chat.id, user_id=current_user.id))
    for uid in _get_support_user_ids(db):
        if uid != current_user.id and not db.query(ChatParticipant).filter_by(chat_id=chat.id, user_id=uid).first():
            db.add(ChatParticipant(chat_id=chat.id, user_id=uid))
    db.commit()

    # 3.1) Оповестим всех SUPPORT-агентов о новом тикете (чтобы Inbox обновился мгновенно)
    try:
        import asyncio
        for uid in _get_support_user_ids(db):
            if uid == current_user.id:
                continue
            asyncio.get_event_loop().create_task(push_notification(uid, {
                "event": "support.ticket.new",
                "chat_id": chat.id,
                "ticket_id": t.id,
                "user_id": current_user.id,
            }))
    except Exception:
        pass

    # 4) приветствие бота (одно системное сообщение)
    try:
        import asyncio
        asyncio.run(_system_message(
            db, chat.id,
            "support.welcome.askDescribe",
            {"support_status": "OPEN", "ticket_id": t.id},
        ))
    except RuntimeError:
        import asyncio
        asyncio.get_event_loop().create_task(_system_message(
            db, chat.id,
            "support.welcome.askDescribe",
            {"support_status": "OPEN", "ticket_id": t.id},
        ))

    # 5) если пользователь сразу написал текст — кладём его первым
    if payload.message and payload.message.strip():
        first = ChatMessage(
            chat_id=chat.id,
            sender_id=current_user.id,
            message_type="text",
            content=payload.message.strip(),
            sent_at=datetime.utcnow(),
        )
        db.add(first)
        t.last_message_at = first.sent_at
        db.add(t)
        db.commit()
        _emit(db, chat.id, "chat.message", {
              "chat_id": chat.id, "message_id": first.id})

    # 6) автоназначение (best effort)
    try:
        uid = _pick_agent_id(db)
        if uid and t.agent_user_id is None:
            t.agent_user_id = uid
            db.add(t)
            db.commit()
            db.refresh(t)
    except Exception:
        pass

    return _to_out(t)


@router.get("/support/tickets", response_model=List[SupportTicketOut])
def list_my_tickets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if _is_support_user(current_user):
        rows = db.query(SupportTicket).order_by(
            SupportTicket.created_at.desc()).all()
    else:
        rows = (
            db.query(SupportTicket)
            .filter(SupportTicket.user_id == current_user.id)
            .order_by(SupportTicket.created_at.desc())
            .all()
        )
    return [_to_out(x) for x in rows]


@router.get("/support/agent/tickets", response_model=List[SupportTicketOut])
def list_assigned_to_me(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_support_user(current_user):
        raise HTTPException(status_code=403, detail="error.support.agentOnly")
    rows = (
        db.query(SupportTicket)
        .filter(SupportTicket.agent_user_id == current_user.id)
        .filter(SupportTicket.status.in_([TicketStatus.OPEN, TicketStatus.PENDING]))
        .order_by(SupportTicket.updated_at.desc())
        .all()
    )
    return [_to_out(x) for x in rows]


@router.get("/support/tickets/{ticket_id}", response_model=SupportTicketOut)
def get_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = db.query(SupportTicket).get(ticket_id)
    if not t:
        raise HTTPException(404, "error.ticket.notFound")
    if not (_is_support_user(current_user) or current_user.id in (t.user_id, t.agent_user_id)):
        raise HTTPException(403, "error.forbidden")
    return _to_out(t)


@router.post("/support/tickets/{ticket_id}/claim", response_model=SupportTicketOut)
def claim_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _is_support_user(current_user):
        raise HTTPException(status_code=403, detail="error.support.agentOnly")
    t = db.query(SupportTicket).get(ticket_id)
    if not t:
        raise HTTPException(404, "error.ticket.notFound")
    t.agent_user_id = current_user.id
    t.status = TicketStatus.OPEN
    t.updated_at = datetime.utcnow()
    db.add(t)
    db.commit()
    db.refresh(t)

    # сообщение "оператор подключился"
    import asyncio
    asyncio.get_event_loop().create_task(_system_message(
        db, t.chat_id,
        "support.agent.joined",
        {
            "support_status": "OPEN",
            "ticket_id": t.id,
            "agent_id": current_user.id,
            "agent_name": (current_user.contact_person or current_user.email)
        },
    ))

    # остановить бота ожидания
    asyncio.get_event_loop().create_task(supportbot_cancel(t.chat_id))

    return _to_out(t)


@router.post("/support/tickets/{ticket_id}/close", response_model=SupportTicketOut)
def close_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = db.query(SupportTicket).get(ticket_id)
    if not t:
        raise HTTPException(404, "error.ticket.notFound")

    # закрывать может SUPPORT или участник тикета (инициатор/назначенный агент)
    if not (_is_support_user(current_user) or current_user.id in (t.user_id, t.agent_user_id)):
        raise HTTPException(status_code=403, detail="error.support.agentOnly")

    t.status = TicketStatus.CLOSED
    t.updated_at = datetime.utcnow()
    db.add(t)
    db.commit()
    db.refresh(t)

    # system-сообщение о закрытии
    try:
        # system-сообщение о закрытии + запрос оценки
        import asyncio
        asyncio.get_event_loop().create_task(_system_message(
            db, t.chat_id,
            "support.dialog.closedPleaseRate",
            {"support_status": "CLOSED", "ticket_id": t.id, "rating_request": True},
        ))

        # стоп бота
        asyncio.get_event_loop().create_task(supportbot_cancel(t.chat_id))
    except Exception:
        pass

    return _to_out(t)


@router.post("/support/tickets/{ticket_id}/rate")
def rate_ticket(
    ticket_id: int,
    payload: dict = Body(...),   # { "score": 1..5, "comment": "..." }
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = db.query(SupportTicket).get(ticket_id)
    if not t:
        raise HTTPException(404, "error.ticket.notFound")
    if current_user.id != t.user_id:
        raise HTTPException(403, "error.support.rate.ownOnly")

    score = int(payload.get("score") or 0)
    comment = (payload.get("comment") or "").strip()
    if score < 1 or score > 5:
        raise HTTPException(422, "error.score.range1to5")

    r = SupportRating(ticket_id=t.id, user_id=current_user.id,
                      score=score, comment=comment)
    db.add(r)
    db.commit()

    import asyncio
    asyncio.get_event_loop().create_task(_system_message(
        db, t.chat_id,
        "support.rating.accepted",
        {"rating_submitted": True, "ticket_id": t.id, "score": score},
    ))

    return {"ok": True}
