from fastapi import APIRouter, Depends, HTTPException, Body, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Literal
from datetime import datetime

from database import get_db
from auth import get_current_user
from models import (
    User,
    UserBlock,
    ContactRequest,
    UserContact,
    Notification,
    NotificationType,
)
from notifications import push_notification

router = APIRouter(prefix="/contacts", tags=["contacts"])


# ------------ helpers ------------

def _emit_contacts_update(*user_ids: int):
    """
    Эфемерный пуш в WS: сообщаем клиенту(ам), что список контактов/заявок обновился.
    Без блокировок и без падений, если нет event loop.
    """
    # отфильтруем мусор и дубликаты
    ids = {int(uid) for uid in user_ids if uid is not None}
    if not ids:
        return

    try:
        import asyncio
        loop = asyncio.get_running_loop()
        for uid in ids:
            loop.create_task(
                push_notification(uid, {"event": "contacts_update"})
            )
    except RuntimeError:
        # нет активного event loop (например, в фоновой задаче) — молча пропускаем
        pass
    except Exception:
        # безопасность прежде всего: уведомление эфемерное, не роняем запрос
        pass


def _is_blocked(db: Session, a: int, b: int) -> bool:
    return (
        db.query(UserBlock)
        .filter(
            ((UserBlock.blocker_id == a) & (UserBlock.blocked_id == b))
            | ((UserBlock.blocker_id == b) & (UserBlock.blocked_id == a))
        )
        .first()
        is not None
    )


def _serialize_user(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "role": str(getattr(u.role, "value", u.role)).upper()
        if getattr(u, "role", None)
        else None,
        "avatar": u.avatar,
        "organization": u.organization,
        "contact_person": u.contact_person,
        "phone": u.phone,
        "whatsapp": u.whatsapp,
        "viber": u.viber,
        "telegram": u.telegram,
        "country": u.country,
        "city": u.city,
        "person_type": u.person_type,
        "fleet": u.fleet,
        "created_at": u.created_at.isoformat() if isinstance(u.created_at, datetime) else None,
    }

# ------------ i18n helpers (ru/ka) ------------


def _user_lang(u: User | None) -> str:
    lang = getattr(u, "lang", None) or getattr(u, "locale", None)
    if isinstance(lang, str):
        lang = lang.lower()
    return lang if lang in ("ka", "ru") else "ru"


MESSAGES = {
    "errors.self_request": {
        "ru": "Нельзя отправить запрос себе",
        "ka": "საკუთარ თავს ვერ გაუგზავნით მოთხოვნას",
    },
    "errors.user_unavailable": {
        "ru": "Пользователь недоступен",
        "ka": "მომხმარებელი მიუწვდომელია",
    },
    "errors.request_not_found": {
        "ru": "Запрос не найден",
        "ka": "მოთხოვნა ვერ მოიძებნა",
    },
    "errors.request_exists": {
        "ru": "Заявка уже существует",
        "ka": "მოთხოვნა უკვე არსებობს",
    },
    "notify.request_sent": {
        "ru": "{name} отправил(а) запрос в контакты",
        "ka": "{name} გამოგიგზავნათ კონტაქტის მოთხოვნა",
    },
    "notify.request_accepted": {
        "ru": "{name} принял(а) ваш запрос в контакты",
        "ka": "{name} მიიღო თქვენი კონტაქტის მოთხოვნა",
    },
    "notify.request_declined": {
        "ru": "{name} отклонил(а) ваш запрос в контакты",
        "ka": "{name} უარყო თქვენი კონტაქტის მოთხოვნა",
    },
}


def _msg(key: str, lang: str = "ru", **params) -> str:
    tmpl = MESSAGES.get(key, {}).get(
        lang) or MESSAGES.get(key, {}).get("ru") or key
    try:
        return tmpl.format(**params)
    except Exception:
        return tmpl


def _notify(
    db: Session,
    user_id: int,
    ntype: NotificationType,
    message: str,
    related_id: str | None = None,
    extra: dict | None = None,
):
    # пишем в БД
    n = Notification(
        user_id=user_id,
        type=ntype,
        message=message,
        related_id=related_id,
        payload=extra,
    )
    db.add(n)
    db.commit()
    db.refresh(n)

    # соберём полезный payload для фронта / WS
    # строковое представление типа (работает и с Enum, и со строкой)
    type_str = (
        getattr(ntype, "value", None)
        or getattr(ntype, "name", None)
        or str(ntype)
    )

    # request_id из related_id ТОЛЬКО для заявок в контакты
    ntype_name = (getattr(ntype, "name", None) or str(ntype)).upper()
    request_id = (
        int(related_id) if ("CONTACT_REQUEST" in ntype_name and related_id and str(
            related_id).isdigit()) else None
    )

    payload = {
        "id": n.id,
        "type": type_str,
        "message": message,
        "related_id": related_id,     # универсальное поле (строка)
        "request_id": request_id,     # отдельное поле для удобства фронта
        "created_at": n.created_at.isoformat() if n.created_at else datetime.utcnow().isoformat(),
        "read": False,
        "payload": extra,
    }

    # fire-and-forget WS (если нет running loop — молча пропускаем)
    try:
        import asyncio
        loop = asyncio.get_running_loop()
        loop.create_task(
            push_notification(
                user_id, {"event": "new_notification", "notification": payload})
        )
    except RuntimeError:
        pass


# ------------ routes ------------

@router.get("", response_model=List[dict])
def list_contacts(
    limit: int = Query(30, ge=1, le=200),
    offset: int = Query(0, ge=0),
    response: Response = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Базовый запрос контактов текущего пользователя
    base_q = (
        db.query(User)
        .join(UserContact, UserContact.contact_id == User.id)
        .filter(UserContact.user_id == current_user.id)
    )

    total = base_q.count()

    rows = (
        base_q
        .order_by(
            User.organization.asc().nulls_last(),
            User.contact_person.asc().nulls_last(),
        )
        .offset(offset)
        .limit(limit)
        .all()
    )
    if response is not None:
        try:
            response.headers["X-Total-Count"] = str(total)
            response.headers["X-Limit"] = str(limit)
            response.headers["X-Offset"] = str(offset)
        except Exception:
            pass
    return [_serialize_user(u) for u in rows]


@router.get("/requests")
def list_requests(
    direction: Literal["in", "out"] = Query("in"),
    status: Literal["pending", "accepted",
                    "declined", "all"] = Query("pending"),
    limit: int = Query(30, ge=1, le=200),
    offset: int = Query(0, ge=0),
    response: Response = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(ContactRequest)
    if direction == "in":
        q = q.filter(ContactRequest.receiver_id == current_user.id)
    else:
        q = q.filter(ContactRequest.sender_id == current_user.id)

    if status != "all":
        q = q.filter(ContactRequest.status == status)

    total = q.count()
    items = q.order_by(ContactRequest.created_at.desc()
                       ).offset(offset).limit(limit).all()

    def brief(u: User):
        if not u:
            return None
        return {
            "id": u.id,
            "email": u.email,
            "contact_person": u.contact_person,
            "organization": u.organization,
            "avatar": u.avatar,
        }

    out = []
    for r in items:
        sender = db.query(User).filter(User.id == r.sender_id).first()
        receiver = db.query(User).filter(User.id == r.receiver_id).first()
        out.append(
            {
                "id": r.id,
                "sender_id": r.sender_id,
                "receiver_id": r.receiver_id,
                "status": r.status,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "from_user": brief(sender),
                "to_user": brief(receiver),
            }
        )
    if response is not None:
        try:
            response.headers["X-Total-Count"] = str(total)
            response.headers["X-Limit"] = str(limit)
            response.headers["X-Offset"] = str(offset)
        except Exception:
            pass
    return out


@router.post("/request/{target_id}")
def send_request(
    target_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if target_id == current_user.id:
        raise HTTPException(
            400, _msg("errors.self_request", _user_lang(current_user)))

    if _is_blocked(db, current_user.id, target_id):
        raise HTTPException(
            403, _msg("errors.user_unavailable", _user_lang(current_user)))

    # язык адресата уведомления (если пригодится ниже)
    target_user = db.query(User).filter(User.id == target_id).first()

    # уже в контактах?
    already = (
        db.query(UserContact)
        .filter_by(user_id=current_user.id, contact_id=target_id)
        .first()
    )
    if already:
        return {"ok": True, "status": "already_contacts"}

    # встречный pending -> авто-ACCEPT
    reverse_req = (
        db.query(ContactRequest)
        .filter_by(sender_id=target_id, receiver_id=current_user.id, status="pending")
        .first()
    )
    if reverse_req:
        # создать двусторонние контакты (идемпотентно)
        for a, b in ((current_user.id, target_id), (target_id, current_user.id)):
            if not db.query(UserContact).filter_by(user_id=a, contact_id=b).first():
                db.add(UserContact(user_id=a, contact_id=b))
        reverse_req.status = "accepted"
        # на всякий случай — наши исходящие pending к этому же пользователю тоже отмечаем accepted
        db.query(ContactRequest).filter_by(
            sender_id=current_user.id, receiver_id=target_id, status="pending"
        ).update({"status": "accepted"})
        db.commit()

        me_name = (
            current_user.contact_person
            or current_user.organization
            or current_user.email
        )
        _notify(
            db,
            target_id,
            NotificationType.CONTACT_ACCEPTED,
            # fallback для старых клиентов (пока оставляем рус/любой)
            fallback := f"{me_name} принял(а) ваш запрос в контакты",
            related_id=str(current_user.id),
            extra={
                "i18n_key": "notify.request_accepted",
                "i18n_params": {"name": me_name},
                "fallback": fallback,
            },
        )
        _emit_contacts_update(current_user.id, target_id)
        return {"ok": True, "status": "accepted"}

    # наш уже существующий pending?
    exists = (
        db.query(ContactRequest)
        .filter_by(sender_id=current_user.id, receiver_id=target_id, status="pending")
        .first()
    )
    if exists:
        return {"ok": True, "status": "pending", "id": exists.id}

    # создать новый pending
    try:
        req = ContactRequest(
            sender_id=current_user.id, receiver_id=target_id, status="pending"
        )
        db.add(req)
        db.commit()
        db.refresh(req)
    except IntegrityError:
        db.rollback()
        # миграция поставила частичные UNIQUE индексы на pending; в гонке просто вернём 409 (локализуем detail)
        raise HTTPException(
            status_code=409, detail=_msg("errors.request_exists", _user_lang(current_user)))

    me_name = (
        current_user.contact_person or current_user.organization or current_user.email
    )
    _notify(
        db,
        target_id,
        NotificationType.CONTACT_REQUEST,
        fallback := f"{me_name} отправил(а) запрос в контакты",
        related_id=str(req.id),
        extra={
            "i18n_key": "notify.request_sent",
            "i18n_params": {"name": me_name},
            "fallback": fallback,
        },
    )
    return {"ok": True, "status": "pending", "id": req.id}


@router.post("/respond")
def respond_request(
    request_id: int = Body(..., embed=True),
    action: Literal["accept", "decline"] = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    req = db.query(ContactRequest).filter(
        ContactRequest.id == request_id).first()
    if not req or req.receiver_id != current_user.id:
        raise HTTPException(
            404, _msg("errors.request_not_found", _user_lang(current_user)))

    if req.status != "pending":
        return {"ok": True, "status": req.status}

    sender = db.query(User).filter(User.id == req.sender_id).first()
    receiver = db.query(User).filter(User.id == req.receiver_id).first()
    sender_lang = _user_lang(sender)

    if action == "accept":
        # двусторонние контакты (идемпотентно)
        for a, b in ((req.sender_id, req.receiver_id), (req.receiver_id, req.sender_id)):
            if not db.query(UserContact).filter_by(user_id=a, contact_id=b).first():
                db.add(UserContact(user_id=a, contact_id=b))

        # отмечаем текущий и возможный встречный pending как accepted
        req.status = "accepted"
        db.query(ContactRequest).filter_by(
            sender_id=req.receiver_id, receiver_id=req.sender_id, status="pending"
        ).update({"status": "accepted"})
        db.query(ContactRequest).filter_by(
            sender_id=req.sender_id, receiver_id=req.receiver_id, status="pending"
        ).update({"status": "accepted"})
        db.commit()

        me_name = (
            receiver.contact_person
            or receiver.organization
            or receiver.email
            if receiver
            else "Пользователь"
        )
        _notify(
            db,
            req.sender_id,
            NotificationType.CONTACT_ACCEPTED,
            fallback := f"{me_name} принял(а) ваш запрос в контакты",
            related_id=str(req.receiver_id),
            extra={
                "i18n_key": "notify.request_accepted",
                "i18n_params": {"name": me_name},
                "fallback": fallback,
            },
        )
        _emit_contacts_update(req.sender_id, req.receiver_id)
        return {"ok": True, "status": "accepted"}

    # decline
    req.status = "declined"
    db.commit()

    me_name = (
        receiver.contact_person
        or receiver.organization
        or receiver.email
        if receiver
        else "Пользователь"
    )
    _notify(
        db,
        req.sender_id,
        NotificationType.CONTACT_DECLINED,
        fallback := f"{me_name} отклонил(а) ваш запрос в контакты",
        related_id=str(req.receiver_id),
        extra={
            "i18n_key": "notify.request_declined",
            "i18n_params": {"name": me_name},
            "fallback": fallback,
        },
    )
    _emit_contacts_update(req.sender_id, req.receiver_id)
    return {"ok": True, "status": "declined"}


@router.delete("/{target_id}")
def remove_contact(
    target_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(UserContact).filter(
        UserContact.user_id == current_user.id, UserContact.contact_id == target_id
    ).delete()
    db.query(UserContact).filter(
        UserContact.user_id == target_id, UserContact.contact_id == current_user.id
    ).delete()
    db.commit()
    _emit_contacts_update(current_user.id, target_id)
    return {"ok": True}
