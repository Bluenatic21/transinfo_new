from fastapi import APIRouter, Depends, Query, HTTPException, Body, Request, Response
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List
from collections import defaultdict
from datetime import datetime, timedelta
import asyncio

from database import get_db
from auth import get_current_user
from notifications import push_notification
from support_bot import start_for_chat as supportbot_start, cancel_for_chat as supportbot_cancel
from support_models import SupportTicket, TicketStatus
# вынесено, чтобы не было циклического импорта
from ws_events import ws_emit_to_chat

import asyncio
from ws_events import active_connections

# Модели / схемы
from models import (
    Chat, ChatParticipant, ChatMessage, ChatFile, User,
    GroupMute, ChatMessageReaction,
    GROUP_ROLE_OWNER, GROUP_ROLE_ADMIN, GROUP_ROLE_MEMBER,
    UserRole,
)
from schemas import (
    ChatMessageCreate, ChatMessageOut, ChatMessageUpdate,
    ChatMessageReactionIn, ChatMessageReactionOut,
    ChatParticipantOut, UserShort
)
from support_models import SupportTicket, TicketStatus


router = APIRouter()


def _i18n(code: str, message: str, **params):
    """Единый формат detail для ошибок: code + русский фолбэк + параметры."""
    return {"code": code, "message": message, "params": params or {}}


def _i18n_meta(key: str, fallback: str, **params):
    """Мета к системным сообщениям, чтобы фронт мог локализовать."""
    return {"i18n_key": key, "fallback": fallback, "params": params or {}}

# --- helpers ---------------------------------------------------------------


def _active_support_user_ids(db: Session) -> list[int]:
    """
    Отдаём список user_id активных саппорт-агентов.
    Если таблица пустая/недоступна, fallback на всех пользователей с ролью SUPPORT.
    """
    try:
        # ЛЕНИВЫЙ импорт: нет жёсткой зависимости от support_models,
        # и не будет NameError, если таблица ещё не смоделена.
        from support_models import SupportAgent
        ids = [
            a.user_id
            for a in db.query(SupportAgent)
                      .filter(SupportAgent.is_active == True)  # noqa: E712
                      .all()
        ]
        if ids:
            return ids
    except Exception:
        pass
    # fallback — все с ролью SUPPORT
    return [u.id for u in db.query(User).filter(User.role == UserRole.SUPPORT).all()]


# === PATCH: хук создания системного сообщения + рассылаем как message.new ===


async def _send_system_message(db, chat_id: int, text: str, meta: dict):
    sys_msg = ChatMessage(
        chat_id=chat_id,
        sender_id=None,
        message_type="system",
        content=text,
        is_system=True,
        meta=meta
    )
    db.add(sys_msg)
    db.commit()
    db.refresh(sys_msg)
    # WS пуш
    await ws_emit_to_chat(chat_id, "message.new", {
        "id": sys_msg.id, "chat_id": chat_id, "sender_id": None,
        "content": sys_msg.content, "message_type": "text",
        "is_system": True, "meta": meta, "sent_at": str(sys_msg.sent_at)
    })

# === PATCH: эпемерный пуш ===


async def _send_ephemeral(chat_id: int, action: str, payload: dict):
    await ws_emit_to_chat(chat_id, action, payload)

# --- Единая выборка сообщений + ETag ---


def _fetch_messages_core(
    db, user, chat_id: int, request: Request, response: Response,
    skip: int = 0, limit: int = 200, after_id: int | None = None, before_id: int | None = None
):
    limit = max(1, min(int(limit or 50), 200))
    skip = max(0, int(skip or 0))

    # доступ в чат
    part = db.query(ChatParticipant).filter_by(
        chat_id=chat_id, user_id=user.id).first()
    if not part:
        raise HTTPException(status_code=403, detail=_i18n(
            "error.accessDenied", "Нет доступа"))

    # ETag зависит от пользователя и его cleared_at, иначе после "удалить у меня"
    # прилетит 304 по старому etag и фронт оставит кэш.
    try:
        total = db.query(func.count(ChatMessage.id)).filter(
            ChatMessage.chat_id == chat_id).scalar() or 0
        last_id = db.query(func.max(ChatMessage.id)).filter(
            ChatMessage.chat_id == chat_id).scalar() or 0
        clr = int(part.cleared_at.timestamp()) if part.cleared_at else 0
        etag_value = f'W/"{chat_id}-{user.id}-{clr}-{last_id}-{total}"'
        inm = request.headers.get("if-none-match")
        if inm and inm == etag_value and after_id is None and before_id is None and skip == 0:
            return None, 304  # Not Modified
        response.headers["ETag"] = etag_value
    except Exception:
        pass

    q = (
        db.query(ChatMessage)
        .options(joinedload(ChatMessage.file))
        .filter(ChatMessage.chat_id == chat_id)
        .order_by(ChatMessage.id.desc())
    )

    # Персональный срез истории
    if part.cleared_at is not None:
        q = q.filter(ChatMessage.sent_at >= part.cleared_at)

    # Новые сообщения (после after_id)
    if after_id:
        q = q.filter(ChatMessage.id > int(after_id))

        # Старые сообщения (до before_id)
    if before_id:
        q = q.filter(ChatMessage.id < int(before_id))

    msgs = q.offset(skip).limit(limit).all()
    # Возвращаем "новые сверху" → разворачиваем под фронт (по необходимости)
    msgs = list(reversed(msgs))
    return msgs, 200


# --- Утилита: системное сообщение ---
def add_system_message(db: Session, chat_id: int, content: str, sender_id: int | None):
    sys_msg = ChatMessage(
        chat_id=chat_id,
        sender_id=sender_id,
        content=(content or "").strip(),
        message_type="system",
    )
    db.add(sys_msg)
    db.commit()


@router.options("/chat/{chat_id}/history")
def _cors_ok_chat_history(chat_id: int):
    # Пусть CORSMiddleware сформирует CORS-заголовки; здесь просто 200/204
    return Response(status_code=204)

# --- ИСТОРИЯ ЧАТА (совместимо со старым фронтом) ---


@router.get("/chat/{chat_id}/history")
def get_chat_history(
    chat_id: int,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    skip: int = 0,
    limit: int = 200,
    after_id: int | None = None,
    before_id: int | None = None,
):
    rows, code = _fetch_messages_core(
        db, user, chat_id, request, response, skip, limit, after_id, before_id)
    if code == 304:
        return Response(status_code=304)
    if not rows:
        return []

   # === REACTIONS (add to history response) ===
    try:
        message_ids = [m.id for m in rows]
        if message_ids:
            rlist = db.query(ChatMessageReaction).filter(
                ChatMessageReaction.message_id.in_(message_ids)
            ).all()
        else:
            rlist = []
        reactions_by_msg = defaultdict(list)
        for r in rlist:
            reactions_by_msg[r.message_id].append(
                ChatMessageReactionOut.from_orm(r))
    except Exception:
        reactions_by_msg = defaultdict(list)
    return [
        {
            "id": m.id,
            "sender_id": m.sender_id,
            "content": m.content,
            "message_type": m.message_type,
            "meta": getattr(m, "meta", None),
            "file_id": m.file_id,
            "file": (
                {
                    "file_url": m.file.file_url if m.file else None,
                    "name": m.file.filename if m.file else None,
                    "file_type": m.file.file_type if m.file else None,
                }
                if m.file_id else None
            ),
            "order_id": m.order_id,
            "transport_id": (str(m.transport_id) if m.transport_id else None),
            "sent_at": str(m.sent_at),
            "reactions": reactions_by_msg.get(m.id, []),
        }
        for m in rows
    ]


@router.options("/chat/{chat_id}/mark_read")
def _cors_ok_mark_read(chat_id: int):
    return Response(status_code=204)


@router.options("/chat/{chat_id}/meta")
def _cors_ok_chat_meta(chat_id: int):
    return Response(status_code=204)


@router.options("/chat/{chat_id}/peer")
def _cors_ok_chat_peer(chat_id: int):
    return Response(status_code=204)

# --- СООБЩЕНИЯ / PAGINATION (+ ETag) ---


@router.options("/chat/{chat_id}/messages")
def _cors_ok_chat_messages(chat_id: int):
    return Response(status_code=204)


@router.get("/chat/{chat_id}/messages", response_model=List[ChatMessageOut])
def get_chat_messages(
    chat_id: int,
    request: Request,          # без значений по умолчанию — до skip/limit
    response: Response,        # без значений по умолчанию — до skip/limit
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    participant = db.query(ChatParticipant).filter_by(
        chat_id=chat_id, user_id=user.id).first()
    if not participant:
        raise HTTPException(status_code=403, detail=_i18n(
            "error.accessDenied", "Нет доступа"))

    # ETag учитывает пользователя и его cleared_at
    try:
        total = db.query(func.count(ChatMessage.id)).filter(
            ChatMessage.chat_id == chat_id).scalar() or 0
        last_id = db.query(func.max(ChatMessage.id)).filter(
            ChatMessage.chat_id == chat_id).scalar() or 0
        clr = int(participant.cleared_at.timestamp()
                  ) if participant.cleared_at else 0
        etag_value = f'W/"{chat_id}-{user.id}-{clr}-{last_id}-{total}"'
        inm = request.headers.get("if-none-match")
        if inm and inm == etag_value and skip == 0:
            return Response(status_code=304)
        response.headers["ETag"] = etag_value
    except Exception:
        pass

    q = (
        db.query(ChatMessage)
        .options(joinedload(ChatMessage.file))
        .filter(ChatMessage.chat_id == chat_id)
    )
    # Личный срез — скрываем всё до cleared_at
    if participant.cleared_at is not None:
        q = q.filter(ChatMessage.sent_at >= participant.cleared_at)
    messages = (
        q.order_by(ChatMessage.sent_at.asc())
         .offset(skip).limit(limit).all()
    )
    if not messages:
        return []

    # Реакции
    message_ids = [m.id for m in messages]
    reactions = db.query(ChatMessageReaction).filter(
        ChatMessageReaction.message_id.in_(message_ids)).all()
    reactions_by_msg = defaultdict(list)
    for r in reactions:
        reactions_by_msg[r.message_id].append(
            ChatMessageReactionOut.from_orm(r))

    result: List[ChatMessageOut] = []
    for m in messages:
        item = ChatMessageOut.from_orm(m)
        try:
            object.__setattr__(item, "meta", getattr(m, "meta", None))
        except Exception:
            pass
        object.__setattr__(item, "reactions", reactions_by_msg.get(m.id, []))
        result.append(item)
    return result


@router.post("/chat/{chat_id}/delete")
def clear_chat_for_me(
    chat_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    chat = db.query(Chat).filter_by(id=chat_id).first()
    if not chat:
        raise HTTPException(404, _i18n("error.chat.notFound", "Чат не найден"))
    part = db.query(ChatParticipant).filter_by(
        chat_id=chat_id, user_id=user.id).first()
    if not part:
        # идемпотентно: для пользователя уже «нет»
        return {"ok": True, "status": "not_participant"}
    part.cleared_at = datetime.utcnow()
    db.add(part)
    db.commit()
    return {"ok": True, "status": "cleared_for_me"}

# --- НЕПРОЧИТАННЫЕ ---


@router.get("/my-chats/unread_count")
def unread_chats_count(db: Session = Depends(get_db), user=Depends(get_current_user)):
    links = db.query(ChatParticipant).filter_by(user_id=user.id).all()
    if not links:
        return {"unread": 0}
    unread = (
        db.query(ChatMessage)
        .join(ChatParticipant,
              (ChatParticipant.chat_id == ChatMessage.chat_id) &
              (ChatParticipant.user_id == user.id))
        .filter(ChatMessage.sender_id != user.id)
        .filter(ChatMessage.is_read == False)  # noqa: E712
        .filter(
            (ChatParticipant.cleared_at.is_(None)) |
            (ChatMessage.sent_at >= ChatParticipant.cleared_at)
        )
        .count()
    )
    return {"unread": unread}


@router.post("/chat/{chat_id}/mark_read")
def mark_chat_read(chat_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    updated = (
        db.query(ChatMessage)
        .filter(ChatMessage.chat_id == chat_id, ChatMessage.sender_id != user.id, ChatMessage.is_read == False)
        .update({"is_read": True}, synchronize_session=False)
    )
    db.commit()

    # Неблокирующая рассылка "прочитано" отправителю(ям)
    async def _broadcast_seen(_chat_id: int, _user_id: int):
        for ws in list(active_connections.get(_chat_id, [])):
            try:
                await ws.send_json({"event": "messages_seen", "chat_id": _chat_id, "seen_by": _user_id})
            except Exception:
                try:
                    active_connections[_chat_id].remove(ws)
                except Exception:
                    pass
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_broadcast_seen(chat_id, user.id))
    except RuntimeError:
        asyncio.run(_broadcast_seen(chat_id, user.id))

    return {"status": "ok", "updated": updated}


# --- СПИСОК МОИХ ЧАТОВ (c support метой) ---
@router.get("/my-chats")
def get_my_chats(
    limit: int = Query(30, ge=1, le=200),
    offset: int = Query(0, ge=0),
    response: Response = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    try:
        # Все чаты, где состоит пользователь
        links = db.query(ChatParticipant).filter_by(user_id=user.id).all()
        chat_ids = list({p.chat_id for p in links})
        if not chat_ids:
            return []

        # Карта саппорт-тикетов по chat_id
        tickets = db.query(SupportTicket).filter(
            SupportTicket.chat_id.in_(chat_ids)).all()
        support_by_chat = {
            t.chat_id: t for t in tickets if getattr(t, "chat_id", None)}

        chats = db.query(Chat).filter(Chat.id.in_(chat_ids)).all()
        out = []

        has_is_read = hasattr(ChatMessage, "is_read")

        for chat in chats:
            # персональный срез для текущего пользователя
            cp = next((p for p in links if p.chat_id == chat.id), None)
            last_q = db.query(ChatMessage).filter(
                ChatMessage.chat_id == chat.id)
            if cp and cp.cleared_at is not None:
                last_q = last_q.filter(ChatMessage.sent_at >= cp.cleared_at)
            last_msg = last_q.order_by(ChatMessage.sent_at.desc()).first()

            # Приватные чаты без сообщений скрываем, группы показываем всегда
            if not last_msg and not getattr(chat, "is_group", False):
                continue

            # непрочитанные (если в схеме есть поле is_read)
            if has_is_read:
                unread_count = (
                    db.query(ChatMessage)
                    .filter_by(chat_id=chat.id)
                    .filter(ChatMessage.sender_id != user.id)
                    .filter(ChatMessage.is_read == False)  # noqa: E712
                    .count()
                )
            else:
                unread_count = 0

            # peer для приватного чата
            peer = None
            if not getattr(chat, "is_group", False):
                peer_link = (
                    db.query(ChatParticipant)
                    .filter(ChatParticipant.chat_id == chat.id, ChatParticipant.user_id != user.id)
                    .first()
                )
                if peer_link:
                    peer_user = db.query(User).filter_by(
                        id=peer_link.user_id).first()
                    if peer_user:
                        peer = {
                            "id": peer_user.id,
                            "organization": getattr(peer_user, "organization", None),
                            "contact_person": getattr(peer_user, "contact_person", None),
                            "full_name": getattr(peer_user, "full_name", None),
                            "email": getattr(peer_user, "email", None),
                            "avatar": getattr(peer_user, "avatar", None),
                        }

            st = support_by_chat.get(chat.id)
            # SUPPORT: если тикет уже назначен другому агенту — не показываем его в списке
            if getattr(user, "role", None) == UserRole.SUPPORT:
                if st and getattr(st, "agent_user_id", None) and st.agent_user_id != user.id:
                    continue

            item = {
                "chat_id": chat.id,
                "order_id": getattr(chat, "order_id", None),
                "transport_id": (str(getattr(chat, "transport_id", "")) or None),
                "unread": unread_count,
                "last_message": {
                    "content": getattr(last_msg, "content", "") if last_msg else "",
                    "message_type": getattr(last_msg, "message_type", "") if last_msg else "",
                    "sent_at": (
                        getattr(last_msg, "sent_at", None).isoformat() if last_msg and getattr(last_msg, "sent_at", None)
                        else (getattr(chat, "created_at", None).isoformat() if getattr(chat, "is_group", False) and getattr(chat, "created_at", None) else None)
                    ),
                },
                "peer": peer,
                "is_group": bool(getattr(chat, "is_group", False)),
                "group_name": getattr(chat, "group_name", None),
                "group_avatar": getattr(chat, "group_avatar", None),
                "owner_id": getattr(chat, "owner_id", None),

                # support-блок
                "support": bool(st),
                "support_ticket_id": (getattr(st, "id", None) if st else None),
                "support_status": (str(getattr(st, "status", "")) if st else None),
                "support_subject": (getattr(st, "subject", None) if st else None),
            }

            if st:
                is_support_agent = (
                    getattr(user, "role", None) == UserRole.SUPPORT)
                item["support_logo_url"] = getattr(
                    chat, "group_avatar", None) or "/static/support-logo.svg"
                item["input_locked"] = (
                    getattr(st, "status", None) == TicketStatus.CLOSED and is_support_agent)
                # автозакрытия больше нет
                item["autoclose_eta_iso"] = None

                if is_support_agent:
                    owner = db.query(User).filter_by(id=getattr(st, "user_id", None)).first(
                    ) if getattr(st, "user_id", None) else None
                    if owner:
                        item["display_title"] = owner.organization or getattr(
                            owner, "contact_person", None) or owner.email or f"ID: {owner.id}"
                        item["display_subtitle"] = getattr(owner, "contact_person", None) or owner.email or (
                            str(getattr(st, "status", "")) if st else "")
                    else:
                        item["display_title"] = "Клиент"
                        item["display_title_key"] = "chat.support.clientTitle"
                        item["display_subtitle"] = (
                            str(getattr(st, "status", "")) if st else "")
                else:
                    item["display_title"] = "Поддержка"
                    item["display_title_key"] = "support.title"
                    item["display_subtitle"] = getattr(st, "subject", None) or (
                        str(getattr(st, "status", "")) if st else "")

            out.append(item)

        # пагинация по собранному списку
        total = len(out)
        try:
            out.sort(
                key=lambda x: (x.get("last_message", {})
                               or {}).get("sent_at") or "",
                reverse=True
            )
        except Exception:
            pass
        page = out[offset: offset + limit]

        if response is not None:
            try:
                response.headers["X-Total-Count"] = str(total)
                response.headers["X-Limit"] = str(limit)
                response.headers["X-Offset"] = str(offset)
            except Exception:
                pass

        return page

    except Exception as e:
        import traceback
        print("ERROR in /my-chats:", str(e))
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"my-chats failed: {e}")


# --- ЛЁГКАЯ МЕТА ДЛЯ ШАПКИ ---
@router.get("/chat/{chat_id}/meta")
def get_chat_meta(chat_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    participant = db.query(ChatParticipant).filter_by(
        chat_id=chat_id, user_id=user.id).first()
    if not participant:
        raise HTTPException(status_code=403, detail="Access denied")

    chat = db.query(Chat).filter_by(id=chat_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail=_i18n(
            "error.chat.notFound", "Чат не найден"))

    st = db.query(SupportTicket).filter_by(chat_id=chat_id).first()

    # peer (для 1:1)
    peer = None
    if not chat.is_group:
        other = db.query(ChatParticipant).filter(
            ChatParticipant.chat_id == chat_id,
            ChatParticipant.user_id != user.id
        ).first()
        if other:
            u = db.query(User).filter_by(id=other.user_id).first()
            if u:
                peer = {
                    "id": u.id,
                    "email": getattr(u, "email", None),
                    "role": str(getattr(u.role, "value", u.role)),
                    "organization": getattr(u, "organization", None),
                    "contact_person": getattr(u, "contact_person", None),
                    "full_name": getattr(u, "full_name", None),
                    "name": getattr(u, "name", None),  # безопасно
                    "phone": getattr(u, "phone", None),
                    "avatar": getattr(u, "avatar", None),
                }
    is_support_agent = (getattr(user, "role", None) == UserRole.SUPPORT)

    data = {
        "chat_id": chat.id,
        "is_group": bool(chat.is_group),
        "group_name": chat.group_name,
        "group_avatar": chat.group_avatar,
        "peer": peer,
        "support": bool(st),
        "support_ticket_id": (st.id if st else None),
        "support_status": (str(getattr(st, "status", "")) if st else None),
        "support_subject": (st.subject if st else None),
        "support_logo_url": (chat.group_avatar or "/static/support-logo.svg") if st else None,
        "display_title": ("Поддержка" if st and not is_support_agent else None),
        "display_title_key": ("support.title" if st and not is_support_agent else None),
        "display_subtitle": (st.subject or (str(getattr(st, "status", "")) if st else "")) if st and not is_support_agent else None,
        "input_locked": (getattr(st, "status", None) == TicketStatus.CLOSED and is_support_agent) if st else False,
        # SUPPORT: если идёт последняя минута — отдаём ETA (start + 60s)
        "autoclose_eta_iso": (
            ((st.countdown_started_at + timedelta(seconds=60)).isoformat() + "Z")
            if (st and getattr(st, "countdown_started_at", None)) else None
        ),
    }
    return data


# --- ПОЛУЧИТЬ ПАРУ ДЛЯ ЧАТА (peer) ---
@router.get("/chat/{chat_id}/peer")
def get_chat_peer(chat_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    participants = db.query(ChatParticipant).filter_by(chat_id=chat_id).all()
    if not participants:
        raise HTTPException(404, _i18n(
            "error.chat.noParticipants", "Чат не найден или нет участников"))

    for p in participants:
        if p.user_id != user.id:
            peer_user = db.query(User).filter_by(id=p.user_id).first()
            if peer_user:
                return {
                    "id": peer_user.id,
                    "email": getattr(peer_user, "email", None),
                    "role": str(peer_user.role) if hasattr(peer_user.role, "value") else str(peer_user.role),
                    "organization": getattr(peer_user, "organization", None),
                    "contact_person": getattr(peer_user, "contact_person", None),
                    "phone": getattr(peer_user, "phone", None),
                    "avatar": getattr(peer_user, "avatar", None),
                }

    # Фолбэк для саппорт-чатов
    st = db.query(SupportTicket).filter_by(chat_id=chat_id).first()
    if st:
        if getattr(user, "role", None) == UserRole.SUPPORT:
            peer_user = db.query(User).filter_by(id=st.user_id).first()
            if peer_user:
                return {
                    "id": peer_user.id,
                    "email": getattr(peer_user, "email", None),
                    "role": str(peer_user.role) if hasattr(peer_user.role, "value") else str(peer_user.role),
                    "organization": getattr(peer_user, "organization", None),
                    "contact_person": getattr(peer_user, "contact_person", None),
                    "phone": getattr(peer_user, "phone", None),
                    "avatar": getattr(peer_user, "avatar", None),
                }
        chat = db.query(Chat).filter_by(id=chat_id).first()
        return {
            "id": 0,
            "email": "support@transinfo",
            "role": "SUPPORT",
            "organization": "Support",
            "contact_person": "Support",
            "full_name": "Support",
            "name": "Поддержка",
            "name_key": "support.title",
            "phone": None,
            "avatar": (chat.group_avatar if chat else None) or "/static/support-logo.svg",
        }

    raise HTTPException(404, _i18n(
        "error.chat.peerNotFound", "Собеседник не найден"))


# --- СОЗДАТЬ/НАЙТИ ЧАТ ПО TRANSPORT ---
@router.post("/chat/by_transport/{transport_id}")
def get_or_create_chat_by_transport(transport_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    from models import Transport
    chat = (
        db.query(Chat)
        .filter(Chat.transport_id == transport_id)
        .join(ChatParticipant, ChatParticipant.chat_id == Chat.id)
        .filter(ChatParticipant.user_id == user.id)
        .first()
    )
    if not chat:
        transport = db.query(Transport).filter(
            Transport.id == transport_id).first()
        if not transport:
            raise HTTPException(status_code=404, detail=_i18n(
                "error.transport.notFound", "Транспорт не найден"))
        chat = Chat(transport_id=transport_id)
        db.add(chat)
        db.commit()
        db.refresh(chat)
        db.add_all([
            ChatParticipant(chat_id=chat.id, user_id=user.id, role=(
                user.role.value if hasattr(user.role, "value") else user.role)),
            ChatParticipant(chat_id=chat.id,
                            user_id=transport.owner_id, role="OWNER"),
        ])
        db.commit()
    return {"chat_id": chat.id}


# --- СОЗДАТЬ/НАЙТИ ЧАТ ПО ORDER ---
@router.post("/chat/by_order/{order_id}")
def get_or_create_order_chat(order_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    from models import Order
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, "error.order.notFound")

    owner_id = order.owner_id
    if user.id == owner_id:
        raise HTTPException(400, "error.chat.noSelfChat")

    # Если уже есть чат между владельцем заказа и текущим — вернём его
    chats = db.query(Chat).filter(Chat.order_id == order_id).all()
    for c in chats:
        uids = {p.user_id for p in db.query(ChatParticipant).filter(
            ChatParticipant.chat_id == c.id)}
        if {user.id, owner_id} == uids:
            return {"chat_id": c.id}

    # Создаём
    chat = Chat(order_id=order_id)
    db.add(chat)
    db.commit()
    db.refresh(chat)
    db.add_all([
        ChatParticipant(chat_id=chat.id, user_id=user.id, role=(
            user.role.value if hasattr(user.role, "value") else user.role)),
        ChatParticipant(chat_id=chat.id, user_id=owner_id),
    ])
    db.commit()

    # Системное сообщение (информация о заказе)
    try:
        msg = (
            f"📦 Заказ №{order.id}\n"
            f"Маршрут: {(order.from_locations[0] if getattr(order, 'from_locations', None) else '-')}"
            f" → {(order.to_locations[0] if getattr(order, 'to_locations', None) else '-')}\n"
            f"Груз: {order.cargo_items[0]['name'] if getattr(order, 'cargo_items', None) else '-'}, "
            f"Вес: {order.cargo_items[0]['tons'] if getattr(order, 'cargo_items', None) else '-'} т\n"
            f"Дата загрузки: {getattr(order, 'load_date', None) or '-'}\n"
            f"Цена: {getattr(order, 'rate_with_vat', None) or '-'} {getattr(order, 'rate_currency', None) or ''}"
        )
        db.add(ChatMessage(
            chat_id=chat.id,
            sender_id=None,
            content=msg,
            message_type="order_info",
            meta=_i18n_meta(
                "chat.order.info",
                "📦 Заказ №{id}\\nМаршрут: {from} → {to}\\nГруз: {cargo}, Вес: {tons} т\\nДата загрузки: {date}\\nЦена: {rate} {cur}",
                id=order.id,
                **{
                    "from": (order.from_locations[0] if getattr(order, "from_locations", None) else "-"),
                    "to": (order.to_locations[0] if getattr(order, "to_locations", None) else "-"),
                    "cargo": (order.cargo_items[0]["name"] if getattr(order, "cargo_items", None) else "-"),
                    "tons": (order.cargo_items[0]["tons"] if getattr(order, "cargo_items", None) else "-"),
                    "date": (getattr(order, "load_date", None) or "-"),
                    "rate": (getattr(order, "rate_with_vat", None) or "-"),
                    "cur": (getattr(order, "rate_currency", None) or "")
                }
            )
        ))
        db.commit()
    except Exception:
        pass

    return {"chat_id": chat.id}


# --- ПРИВАТНЫЙ ЧАТ ПО USER ---
@router.post("/chat/by_user/{user_id}")
def get_or_create_private_chat(
    user_id: int,
    order_id: int = Body(default=None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    from models import Order  # для системного сообщения, если будет order_id
    if user_id == user.id:
        raise HTTPException(400, _i18n(
            "error.chat.noSelfChat", "Нельзя открыть чат с самим собой"))
    recipient = db.query(User).filter(User.id == user_id).first()
    if not recipient:
        raise HTTPException(404, _i18n(
            "error.user.notFound", "Пользователь не найден"))

    # 1) Если задан order_id — переиспользуем/создаём чат заявки
    if order_id:
        chat = db.query(Chat).filter(Chat.order_id == order_id).first()
        if chat:
            return {"chat_id": chat.id}
        chat = Chat(order_id=order_id)
        db.add(chat)
        db.commit()
        db.refresh(chat)
        db.add_all([
            ChatParticipant(chat_id=chat.id, user_id=user.id, role=(
                user.role.value if hasattr(user.role, "value") else user.role)),
            ChatParticipant(chat_id=chat.id, user_id=user_id),
        ])
        db.commit()
        # системное сообщение о заказе (best-effort)
        order = db.query(Order).filter(Order.id == order_id).first()
        if order:
            try:
                msg = (
                    f"📦 Заказ №{order.id}\n"
                    f"Маршрут: {(order.from_locations[0] if getattr(order, 'from_locations', None) else '-')}"
                    f" → {(order.to_locations[0] if getattr(order, 'to_locations', None) else '-')}\n"
                    f"Дата загрузки: {getattr(order, 'load_date', None) or '-'}"
                )
                db.add(ChatMessage(
                    chat_id=chat.id,
                    sender_id=None,
                    content=msg,
                    message_type="order_info",
                    meta=_i18n_meta(
                        "chat.order.brief",
                        "📦 Заказ №{id}\\nМаршрут: {from} → {to}\\nДата загрузки: {date}",
                        id=order.id,
                        **{
                            "from": (order.from_locations[0] if getattr(order, "from_locations", None) else "-"),
                            "to": (order.to_locations[0] if getattr(order, "to_locations", None) else "-"),
                            "date": (getattr(order, "load_date", None) or "-")
                        }
                    )
                ))
                db.commit()
            except Exception:
                pass
        return {"chat_id": chat.id}

    # 2) Обычный приватный чат (без заявки)
    private_chats = db.query(Chat).filter(
        Chat.order_id == None, Chat.transport_id == None).all()
    for c in private_chats:
        uids = {p.user_id for p in db.query(ChatParticipant).filter(
            ChatParticipant.chat_id == c.id)}
        if {user.id, user_id} == uids:
            return {"chat_id": c.id}
    chat = Chat()
    db.add(chat)
    db.commit()
    db.refresh(chat)
    db.add_all([
        ChatParticipant(chat_id=chat.id, user_id=user.id, role=(
            user.role.value if hasattr(user.role, "value") else user.role)),
        ChatParticipant(chat_id=chat.id, user_id=user_id),
    ])
    db.commit()
    return {"chat_id": chat.id}


# --- ПОСЛАТЬ СООБЩЕНИЕ + АВТО-ПЕРЕОТКРЫТИЕ SUPPORT ---
@router.post("/chat/{chat_id}/send")
async def send_chat_message(
    chat_id: int,
    msg: ChatMessageCreate = Body(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    try:
        redirected = False
        # доступ / автодобавление саппорта
        part = db.query(ChatParticipant).filter_by(
            chat_id=chat_id, user_id=user.id).first()
        if not part:
            st = db.query(SupportTicket).filter_by(chat_id=chat_id).first()
            if st and getattr(user, "role", None) == UserRole.SUPPORT:
                db.add(ChatParticipant(chat_id=chat_id, user_id=user.id))
                db.commit()
            else:
                raise HTTPException(403, _i18n(
                    "error.accessDenied", "Нет доступа"))

        # файл (если указан)
        file = None
        file_id = getattr(msg, "file_id", None)
        if file_id:
            file = db.query(ChatFile).filter_by(
                id=file_id, chat_id=chat_id).first()
            if not file:
                raise HTTPException(400, _i18n(
                    "error.file.notFound", "Файл не найден"))

        # support — закрытые тикеты пользователю не переоткрываем, просим создать новый
                # Если это чат поддержки и пишет агент — гасим бота ожидания
        try:
            st = db.query(SupportTicket).filter_by(chat_id=chat_id).first()
        except Exception:
            st = None
        if st is not None and getattr(user, "role", None) == UserRole.SUPPORT:
            try:
                await supportbot_cancel(chat_id)
            except Exception:
                pass

        # SUPPORT: автоклейм тикета первым ответившим агентом
        st = db.query(SupportTicket).filter_by(chat_id=chat_id).first()
        if st and getattr(user, "role", None) == UserRole.SUPPORT and not getattr(st, "agent_user_id", None):
            st.agent_user_id = user.id
            try:
                if getattr(st, "status", None) == TicketStatus.OPEN:
                    st.status = TicketStatus.PENDING
            except Exception:
                pass
            db.commit()
            # Оповещаем остальных агентов (через user-уведомления WS)
            agent_name = getattr(user, "contact_person", None) or getattr(
                user, "full_name", None) or getattr(user, "email", None)
            for uid in _active_support_user_ids(db):
                if uid == user.id:
                    continue
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(push_notification(uid, {
                        "event": "support.ticket.claimed",
                        "chat_id": chat_id,
                        "ticket_id": st.id,
                        "agent_id": user.id,
                        "agent_name": agent_name,
                    }))
                except RuntimeError:
                    await push_notification(uid, {
                        "event": "support.ticket.claimed",
                        "chat_id": chat_id,
                        "ticket_id": st.id,
                        "agent_id": user.id,
                        "agent_name": agent_name,
                    })
            # Эфемерное событие в сам чат (для открытого экрана)
            try:
                await ws_emit_to_chat(chat_id, {
                    "action": "support.assigned",
                    "chat_id": chat_id,
                    "data": {
                        "ticket_id": st.id,
                        "agent_id": user.id,
                        "agent_name": agent_name,
                    },
                })
            except Exception:
                pass

        # support — закрытые тикеты пользователю не переоткрываем, просим создать новый
        st = db.query(SupportTicket).filter_by(chat_id=chat_id).first()
        if st and getattr(user, "role", None) != UserRole.SUPPORT:
            if st.status in (TicketStatus.CLOSED, TicketStatus.RESOLVED):
                # Авто-создание нового тикета/чата при попытке пользователя написать в закрытый диалог
                new_chat = Chat(
                    is_group=True,
                    group_name="Support",
                    group_avatar="/static/support-logo.svg",
                    owner_id=user.id
                )
                db.add(new_chat)
                db.flush()
                # Участники: автор и все активные SUPPORT-агенты (или, если их нет, все с ролью SUPPORT)
                db.add(ChatParticipant(chat_id=new_chat.id, user_id=user.id))
                for uid in _active_support_user_ids(db):
                    if not db.query(ChatParticipant).filter_by(chat_id=new_chat.id, user_id=uid).first():
                        db.add(ChatParticipant(
                            chat_id=new_chat.id, user_id=uid))

                new_t = SupportTicket(
                    user_id=user.id,
                    status=TicketStatus.OPEN,
                    chat_id=new_chat.id,
                    subject="Запрос в поддержку"
                )
                db.add(new_t)
                db.commit()
                db.refresh(new_t)

                # Системное уведомление в старом чате
                db.add(ChatMessage(
                    chat_id=chat_id,
                    sender_id=user.id,
                    message_type="system",
                    content=f"Диалог закрыт. Создано новое обращение №{new_t.id}. Продолжим там.",
                    meta=_i18n_meta("support.redirectNewTicket",
                                    "Диалог закрыт. Создано новое обращение №{id}. Продолжим там.",
                                    id=new_t.id)
                ))
                db.commit()
                chat_id = new_chat.id
                st = new_t
                redirected = True

        chat_msg = ChatMessage(
            chat_id=chat_id,
            sender_id=user.id,
            content=msg.content,
            message_type=msg.message_type,
            file_id=(file.id if file else None),
            order_id=getattr(msg, "order_id", None),
            transport_id=getattr(msg, "transport_id", None),
        )
        db.add(chat_msg)
        db.commit()
        db.refresh(chat_msg)

        out = {
            "id": chat_msg.id,
            "sender_id": chat_msg.sender_id,
            "content": chat_msg.content,
            "message_type": chat_msg.message_type,
            "file_id": chat_msg.file_id,
            "order_id": chat_msg.order_id,
            "transport_id": chat_msg.transport_id,
            "sent_at": str(chat_msg.sent_at),
            "file": ({
                "file_url": chat_msg.file.file_url,
                "filename": chat_msg.file.filename,
                "file_type": chat_msg.file.file_type,
            } if chat_msg.file else None),
        }

 # ✅ Мгновенная доставка в канал чата (без ожидания уведомлений/REST)
        try:
            await ws_emit_to_chat(chat_id, "message.new", {**out, "chat_id": chat_id})
        except Exception as e:
            print("[WARN] ws_emit_to_chat(message.new) failed:", e)

        # SUPPORT: гарантируем, что все активные агенты состоят в чате
        if st:
            try:
                for uid in _active_support_user_ids(db):
                    if not db.query(ChatParticipant).filter_by(chat_id=chat_id, user_id=uid).first():
                        db.add(ChatParticipant(chat_id=chat_id, user_id=uid))
                db.commit()
            except Exception:
                db.rollback()

        # Push в WS всем участникам (кроме отправителя), уважая mute для групп
        participants = db.query(ChatParticipant).filter_by(
            chat_id=chat_id).all()
        chat = db.query(Chat).filter_by(id=chat_id).first()

        for p in participants:
            if p.user_id == user.id:
                continue
            if chat and chat.is_group:
                mute = db.query(GroupMute).filter_by(
                    user_id=p.user_id, chat_id=chat_id, muted=True).first()
                if mute:
                    continue
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(push_notification(p.user_id, {
                    "event": "new_message",
                    "chat_id": chat_id,
                    "message": out,
                }))
            except RuntimeError:
                await push_notification(p.user_id, {
                    "event": "new_message",
                    "chat_id": chat_id,
                    "message": out,
                })
                # Сообщим фронту, если было авто-перенаправление в новый чат
        if redirected:
            out["redirect_chat_id"] = chat_id

        # --- SUPPORT: если это саппорт-чат — обновим last_message_at и сбросим возможный отсчёт ---
        try:
            st = db.query(SupportTicket).filter_by(chat_id=chat_id).first()
            if st:
                st.last_message_at = datetime.utcnow()
                if st.countdown_started_at:
                    st.countdown_started_at = None
                    db.commit()
                    # Эфемерно сообщаем клиентам, что отсчёт отменён
                    await ws_emit_to_chat(chat_id, {
                        "action": "support.autoclose.cancelled",
                        "chat_id": chat_id,
                        "data": {},
                    })
        except Exception:
            pass

        return out

    except HTTPException as e:
        # Не превращаем осознанные 4xx (например, 409 SUPPORT_TICKET_*) в 500
        raise e
    except Exception as e:
        import traceback
        print("ERROR in /chat/{chat_id}/send:", str(e))
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail="INTERNAL_ERROR")


# --- РЕАКЦИИ (коллекция и одиночная) ---
@router.put("/chat/{chat_id}/messages/{message_id}", response_model=ChatMessageOut)
async def edit_message(
    chat_id: int,
    message_id: int,
    payload: ChatMessageUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    part = db.query(ChatParticipant).filter_by(
        chat_id=chat_id, user_id=user.id).first()
    if not part:
        raise HTTPException(403, _i18n("error.accessDenied", "Нет доступа"))

    msg = db.query(ChatMessage).filter_by(
        id=message_id, chat_id=chat_id).first()
    if not msg:
        raise HTTPException(404, _i18n(
            "error.message.notFound", "Сообщение не найдено"))

    if msg.sender_id != getattr(user, "id", None):
        raise HTTPException(403, _i18n(
            "error.message.editForbidden", "Можно редактировать только свои сообщения"))

    if msg.message_type not in (None, "", "text"):
        raise HTTPException(400, _i18n(
            "error.message.editType", "Редактировать можно только текстовые сообщения"))

    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(400, _i18n(
            "error.message.empty", "Сообщение не может быть пустым"))

    msg.content = content
    try:
        msg.edited_at = datetime.utcnow()
    except Exception:
        pass
    db.add(msg)
    db.commit()
    db.refresh(msg)

    out = ChatMessageOut.from_orm(msg)
    outgoing = jsonable_encoder(out)
    if isinstance(outgoing, dict):
        outgoing.setdefault("edited", True)
        outgoing.setdefault("edited_at", datetime.utcnow().isoformat())
    try:
        await ws_emit_to_chat(
            chat_id,
            "message.updated",
            {"chat_id": chat_id, "message": outgoing},
        )
    except Exception:
        pass

    return out


@router.post("/chat/{chat_id}/messages/{message_id}/reactions", response_model=List[ChatMessageReactionOut])
def add_message_reaction(
    chat_id: int,
    message_id: int,
    payload: ChatMessageReactionIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    part = db.query(ChatParticipant).filter_by(
        chat_id=chat_id, user_id=user.id).first()
    if not part:
        raise HTTPException(403, _i18n("error.accessDenied", "Нет доступа"))

    msg = db.query(ChatMessage).filter_by(
        id=message_id, chat_id=chat_id).first()
    if not msg:
        raise HTTPException(404, _i18n(
            "error.message.notFound", "Сообщение не найдено"))

    db.query(ChatMessageReaction).filter_by(
        message_id=message_id, user_id=user.id).delete()
    db.add(ChatMessageReaction(message_id=message_id,
           user_id=user.id, reaction=payload.reaction))
    db.commit()

    items = db.query(ChatMessageReaction).filter_by(
        message_id=message_id).all()
    return [ChatMessageReactionOut.from_orm(r) for r in items]


@router.delete("/chat/{chat_id}/messages/{message_id}/reactions", response_model=List[ChatMessageReactionOut])
def remove_message_reaction(
    chat_id: int,
    message_id: int,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    part = db.query(ChatParticipant).filter_by(
        chat_id=chat_id, user_id=user.id).first()
    if not part:
        raise HTTPException(403, _i18n("error.accessDenied", "Нет доступа"))

    msg = db.query(ChatMessage).filter_by(
        id=message_id, chat_id=chat_id).first()
    if not msg:
        raise HTTPException(404, _i18n(
            "error.message.notFound", "Сообщение не найдено"))

    db.query(ChatMessageReaction).filter_by(
        message_id=message_id, user_id=user.id).delete()
    db.commit()

    items = db.query(ChatMessageReaction).filter_by(
        message_id=message_id).all()
    return [ChatMessageReactionOut.from_orm(r) for r in items]


# Доп. короткая реакция (альтернативный путь)
@router.post("/chat/{chat_id}/message/{message_id}/react")
def react_to_message(
    chat_id: int,
    message_id: int,
    reaction: ChatMessageReactionIn = Body(...),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    msg = db.query(ChatMessage).filter_by(
        id=message_id, chat_id=chat_id).first()
    if not msg:
        raise HTTPException(404, _i18n(
            "error.message.notFound", "Сообщение не найдено"))

    db.query(ChatMessageReaction).filter_by(
        message_id=message_id, user_id=user.id).delete()
    new_reaction = ChatMessageReaction(
        message_id=message_id, user_id=user.id, reaction=reaction.reaction)
    db.add(new_reaction)
    db.commit()
    db.refresh(new_reaction)

    participants = db.query(ChatParticipant).filter_by(chat_id=chat_id).all()
    out = {
        "event": "message_reacted",
        "chat_id": chat_id,
        "message_id": message_id,
        "user_id": user.id,
        "reaction": reaction.reaction,
        "created_at": str(new_reaction.created_at),
    }
    for p in participants:
        if p.user_id == user.id:
            continue
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(push_notification(p.user_id, out))
        except RuntimeError:
            asyncio.run(push_notification(p.user_id, out))
    return out


# --- УЧАСТНИКИ / РОЛИ / МЬЮТ ---
def is_group_admin(db: Session, chat_id: int, user_id: int):
    part = db.query(ChatParticipant).filter_by(
        chat_id=chat_id, user_id=user_id).first()
    return bool(part and part.role in (GROUP_ROLE_OWNER, GROUP_ROLE_ADMIN))


@router.get("/chat/{chat_id}/participants", response_model=List[ChatParticipantOut])
def get_chat_participants(chat_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    part = db.query(ChatParticipant).filter_by(
        chat_id=chat_id, user_id=user.id).first()
    if not part:
        raise HTTPException(403, "Нет доступа")

    participants = db.query(ChatParticipant).filter_by(chat_id=chat_id).all()
    user_ids = [p.user_id for p in participants]
    users = db.query(User).filter(User.id.in_(user_ids)).all()
    users_map = {u.id: u for u in users}

    result: List[ChatParticipantOut] = []
    for p in participants:
        dto = ChatParticipantOut.from_orm(p)
        if dto.joined_at is None:
            # у старых записей может быть NULL — безопасный дефолт
            dto.joined_at = datetime.utcnow()
        user_obj = users_map.get(p.user_id)
        if user_obj:
            dto.user = UserShort.from_orm(user_obj)
        result.append(dto)
    return result


@router.post("/group/{chat_id}/add_member")
def add_member(chat_id: int, user_id: int = Body(...), db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if not is_group_admin(db, chat_id, current_user.id):
        raise HTTPException(403, _i18n(
            "error.group.onlyAdminAdd", "Только администратор может добавлять участников"))
    existing = db.query(ChatParticipant).filter_by(
        chat_id=chat_id, user_id=user_id).first()
    if existing:
        raise HTTPException(400, _i18n(
            "error.group.alreadyMember", "Пользователь уже в группе"))
    db.add(ChatParticipant(chat_id=chat_id, user_id=user_id, role="member"))
    db.commit()

    participants = db.query(ChatParticipant).filter_by(chat_id=chat_id).all()
    for p in participants:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(push_notification(
                p.user_id, {"event": "group_members_updated", "chat_id": chat_id}))
        except RuntimeError:
            asyncio.run(push_notification(
                p.user_id, {"event": "group_members_updated", "chat_id": chat_id}))

    return {"status": "ok"}


@router.post("/group/{chat_id}/remove_member")
def remove_member(chat_id: int, user_id: int = Body(...), db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if not is_group_admin(db, chat_id, current_user.id):
        raise HTTPException(403, "error.group.onlyAdminRemove")
    if user_id == current_user.id:
        raise HTTPException(400, "error.group.cannotRemoveSelf")

    user_obj = db.query(User).filter_by(id=user_id).first()
    db.query(ChatParticipant).filter_by(
        chat_id=chat_id, user_id=user_id).delete()
    db.commit()

    participants = db.query(ChatParticipant).filter_by(chat_id=chat_id).all()
    for p in participants:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(push_notification(
                p.user_id, {"event": "group_members_updated", "chat_id": chat_id}))
        except RuntimeError:
            asyncio.run(push_notification(
                p.user_id, {"event": "group_members_updated", "chat_id": chat_id}))

    if user_obj:
        display_name = (
            getattr(user_obj, "organization", None)
            or getattr(user_obj, "full_name", None)
            or getattr(user_obj, "contact_person", None)
            or getattr(user_obj, "email", None)
            or str(getattr(user_obj, "id", ""))
        )
        owner_part = db.query(ChatParticipant).filter_by(
            chat_id=chat_id, role="owner").first()
        owner_id = owner_part.user_id if owner_part else current_user.id
        content = f" {display_name} удалён из группы"
        add_system_message(db, chat_id, content, owner_id)

        try:
            sys = db.query(ChatMessage).filter_by(chat_id=chat_id, content=content, sender_id=owner_id)\
                .order_by(ChatMessage.sent_at.desc()).first()
            if sys:
                sys.meta = _i18n_meta(
                    "group.userRemoved", "{name} удалён из группы", name=display_name)
                db.commit()
        except Exception:
            pass

        sys_msg = (
            db.query(ChatMessage)
            .filter_by(chat_id=chat_id, content=content, sender_id=owner_id)
            .order_by(ChatMessage.sent_at.desc())
            .first()
        )
        if sys_msg:
            out = {
                "id": sys_msg.id,
                "sender_id": sys_msg.sender_id,
                "content": sys_msg.content,
                "message_type": sys_msg.message_type,
                "file_id": sys_msg.file_id,
                "order_id": sys_msg.order_id,
                "transport_id": sys_msg.transport_id,
                "sent_at": str(sys_msg.sent_at),
                "file": None,
            }
            for p in participants:
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(push_notification(
                        p.user_id, {"event": "new_message", "chat_id": chat_id, "message": out}))
                except RuntimeError:
                    asyncio.run(push_notification(
                        p.user_id, {"event": "new_message", "chat_id": chat_id, "message": out}))

    return {"status": "ok"}


@router.post("/group/{chat_id}/set_role")
def set_role(chat_id: int, user_id: int = Body(...), role: str = Body(...), db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if not is_group_admin(db, chat_id, current_user.id):
        raise HTTPException(403, _i18n(
            "error.group.onlyAdminChangeRole", "Только администратор может менять роли"))

    part = db.query(ChatParticipant).filter_by(
        chat_id=chat_id, user_id=user_id).first()
    if not part:
        raise HTTPException(404, _i18n(
            "error.user.notFound", "Пользователь не найден"))
    if role not in ("admin", "member"):
        raise HTTPException(400, _i18n(
            "error.group.badRole", "Недопустимая роль"))
    if part.role == "owner":
        raise HTTPException(400, _i18n(
            "error.group.cannotChangeOwner", "Нельзя менять роль владельца"))

    old_role = part.role
    part.role = role
    db.commit()

    user_obj = db.query(User).filter_by(id=user_id).first()
    if user_obj and old_role != role:
        display_name = (
            getattr(user_obj, "organization", None)
            or getattr(user_obj, "full_name", None)
            or getattr(user_obj, "contact_person", None)
            or getattr(user_obj, "email", None)
            or str(getattr(user_obj, "id", ""))
        )
        if role == "admin":
            content = f" {display_name} назначен администратором группы"
            meta = _i18n_meta("group.userPromotedAdmin",
                              "{name} назначен администратором группы", name=display_name)
        elif old_role == "admin" and role == "member":
            content = f" {display_name} больше не является администратором группы"
            meta = _i18n_meta("group.userAdminRevoked",
                              "{name} больше не является администратором группы", name=display_name)
        else:
            content = None
            meta = None
        if content:
            owner_part = db.query(ChatParticipant).filter_by(
                chat_id=chat_id, role="owner").first()
            owner_id = owner_part.user_id if owner_part else current_user.id
            add_system_message(db, chat_id, content, owner_id)
            try:
                sys = db.query(ChatMessage).filter_by(chat_id=chat_id, content=content, sender_id=owner_id)\
                    .order_by(ChatMessage.sent_at.desc()).first()
                if sys and meta:
                    sys.meta = meta
                    db.commit()
            except Exception:
                pass
    return {"status": "ok"}


@router.post("/group/{chat_id}/leave")
def leave_group(chat_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    part = db.query(ChatParticipant).filter_by(
        chat_id=chat_id, user_id=current_user.id).first()
    if not part:
        raise HTTPException(404, _i18n(
            "error.group.notMember", "Вы не состоите в группе"))
    if part.role == "OWNER":
        raise HTTPException(400, _i18n(
            "error.group.ownerCannotLeave", "Владелец не может выйти из своей группы"))

    db.delete(part)
    db.commit()

    participants = db.query(ChatParticipant).filter_by(chat_id=chat_id).all()
    for p in participants:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(push_notification(
                p.user_id, {"event": "group_members_updated", "chat_id": chat_id}))
        except RuntimeError:
            asyncio.run(push_notification(
                p.user_id, {"event": "group_members_updated", "chat_id": chat_id}))

    return {"status": "ok"}


# --- MUTE / UNMUTE ГРУПП ---
@router.get("/group-mute", tags=["chat"])
def get_muted_groups(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return [m.chat_id for m in db.query(GroupMute).filter_by(user_id=user.id, muted=True).all()]


@router.post("/group-mute/{chat_id}", tags=["chat"])
def mute_group(chat_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    mute = db.query(GroupMute).filter_by(
        user_id=user.id, chat_id=chat_id).first()
    if not mute:
        mute = GroupMute(user_id=user.id, chat_id=chat_id, muted=True)
        db.add(mute)
    else:
        mute.muted = True
    db.commit()
    return {"ok": True}


@router.post("/group-unmute/{chat_id}", tags=["chat"])
def unmute_group(chat_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    mute = db.query(GroupMute).filter_by(
        user_id=user.id, chat_id=chat_id).first()
    if mute:
        mute.muted = False
        db.commit()
    return {"ok": True}


# --- УДАЛЕНИЕ/ВЫХОД ИЗ ЧАТА ---
@router.post("/chat/{chat_id}/delete", tags=["chat"])
def delete_chat(chat_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    chat = db.query(Chat).filter_by(id=chat_id).first()
    if not chat:
        raise HTTPException(404, _i18n("error.chat.notFound", "Чат не найден"))

    part = db.query(ChatParticipant).filter_by(
        chat_id=chat_id, user_id=user.id).first()
    if not part:
        # Идемпотентно: пользователя в чате нет — считаем, что уже «удалено для меня»
        return {"ok": True, "status": "not_participant"}

    # КЛЮЧ: очищаем историю только для ТЕКУЩЕГО пользователя
    part.cleared_at = datetime.utcnow()
    db.add(part)
    db.commit()
    return {"ok": True, "status": "cleared_for_me"}


# --- ПРОБА ДОСТУПА ДЛЯ WS ---
@router.get("/chat/{chat_id}/can-join")
def chat_can_join(chat_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cp = db.query(ChatParticipant).filter_by(
        chat_id=chat_id, user_id=current_user.id).first()
    if not cp:
        raise HTTPException(status_code=403, detail=_i18n(
            "error.accessDenied", "Нет доступа"))
    return {"ok": True}


@router.post("/chat/{chat_id}/join")
def join_chat(chat_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Явное присоединение в чат. Идемпотентно.
    """
    cp = db.query(ChatParticipant).filter_by(
        chat_id=chat_id, user_id=current_user.id).first()
    if not cp:
        db.add(ChatParticipant(chat_id=chat_id, user_id=current_user.id))
        db.commit()
    return {"ok": True}
