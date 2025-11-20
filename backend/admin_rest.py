# admin_rest.py
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional, List, Union
import secrets

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, inspect
from uuid import UUID
from database import get_db
from auth import get_current_user  # ВАЖНО: НЕ security
from models import (
    User as UserModel,
    UserRole,
    Order,
    Transport,
    Match,
    TrackingSession,
    UserSession,
    SiteVisit,
)

try:
    from pydantic import ConfigDict
except ImportError:
    ConfigDict = None

router = APIRouter(prefix="/admin", tags=["admin"])

# ----- Гард админа


def admin_required(current_user: UserModel = Depends(get_current_user)):
    role_val = getattr(current_user.role, "value", current_user.role)
    if str(role_val).upper() != "ADMIN":
        raise HTTPException(status_code=403, detail="error.admin.only")
    return current_user


# ----- Pydantic схемы (минимум)


class UserOut(BaseModel):
    id: int
    email: Optional[str] = None
    name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = True
    manager_id: Optional[int] = None
    created_at: Optional[datetime] = None

    class Config:
        orm_mode = True


class UserPatch(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    manager_id: Optional[int] = None


class VerifyBody(BaseModel):
    verified: bool
    comment: Optional[str] = None


# ===== ФАЗА 2: Схемы =====
class OrderOut(BaseModel):
    id: int
    is_active: Optional[bool] = None
    status: Optional[str] = None
    created_at: Optional[datetime] = None
    if ConfigDict:
        model_config = ConfigDict(from_attributes=True)
    else:
        class Config:
            orm_mode = True


class TransportOut(BaseModel):
    id: UUID
    is_active: Optional[bool] = None
    status: Optional[str] = None
    created_at: Optional[datetime] = None
    if ConfigDict:
        model_config = ConfigDict(from_attributes=True)
    else:
        class Config:
            orm_mode = True


class TrackingSessionOut(BaseModel):
    id: UUID
    user_id: Optional[int] = None
    is_active: Optional[bool] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    if ConfigDict:
        model_config = ConfigDict(from_attributes=True)
    else:
        class Config:
            orm_mode = True


class OnlineUserOut(BaseModel):
    id: int
    email: Optional[str] = None
    name: Optional[str] = None
    role: Optional[str] = None
    phone: Optional[str] = None
    last_seen_at: datetime
    last_path: Optional[str] = None


class VisitStatOut(BaseModel):
    date: str
    total_visits: int
    unique_users: int


class AdminActionOut(BaseModel):
    id: int
    admin_user_id: int
    action: str
    target_type: str
    target_id: Union[int, UUID, str]
    payload_before: Optional[str] = None
    payload_after: Optional[str] = None
    created_at: datetime
    if ConfigDict:
        model_config = ConfigDict(from_attributes=True)
    else:
        class Config:
            orm_mode = True

# ----- DASHBOARD


@router.get("/stats")
def admin_stats(
    db: Session = Depends(get_db),
    _: UserModel = Depends(admin_required),
):
    now = datetime.utcnow()
    d7 = now - timedelta(days=7)
    d30 = now - timedelta(days=30)

    users_total = db.query(func.count(UserModel.id)).scalar()
    users_7d = db.query(func.count(UserModel.id)).filter(
        UserModel.created_at >= d7).scalar()
    users_30d = db.query(func.count(UserModel.id)).filter(
        UserModel.created_at >= d30).scalar()

    orders_total = db.query(func.count(Order.id)).scalar()
    transports_total = db.query(func.count(Transport.id)).scalar()
    matches_7d = db.query(func.count(Match.id)).filter(
        Match.created_at >= d7).scalar()

    tracking_active = db.query(func.count(TrackingSession.id)).filter(
        or_(getattr(TrackingSession, "is_active", False) == True,
            getattr(TrackingSession, "ended_at", None) == None)
    ).scalar()

    return {
        "users_total": users_total,
        "users_7d": users_7d,
        "users_30d": users_30d,
        "orders_total": orders_total,
        "transports_total": transports_total,
        "matches_7d": matches_7d,
        "tracking_active": tracking_active,
        "generated_at": now.isoformat(),
    }


@router.get("/stats/online-users")
def admin_online_users(
    db: Session = Depends(get_db),
    _: UserModel = Depends(admin_required),
):
    now = datetime.utcnow()
    cutoff = now - timedelta(minutes=5)
    rows = (
        db.query(UserSession, UserModel)
        .join(UserModel, UserModel.id == UserSession.user_id)
        .filter(UserSession.last_seen_at >= cutoff)
        .order_by(UserSession.last_seen_at.desc())
        .all()
    )
    users = []
    for session, user in rows:
        role_val = getattr(user.role, "value", user.role)
        name = getattr(user, "name", None) or getattr(
            user, "contact_person", None) or getattr(user, "organization", None)
        users.append({
            "id": user.id,
            "email": user.email,
            "name": name or user.email,
            "role": role_val,
            "phone": getattr(user, "phone", None),
            "last_seen_at": session.last_seen_at.isoformat() if session.last_seen_at else None,
            "last_path": session.last_path,
        })

    return {
        "count": len(users),
        "users": users,
        "generated_at": now.isoformat(),
    }


@router.get("/stats/visits")
def admin_visit_stats(
    db: Session = Depends(get_db),
    _: UserModel = Depends(admin_required),
):
    now = datetime.utcnow()
    days = 30
    start_date = (now - timedelta(days=days - 1)).date()
    start_dt = datetime.combine(start_date, datetime.min.time())

    rows = (
        db.query(
            func.date(SiteVisit.visited_at).label("visit_date"),
            func.count(SiteVisit.id).label("total_visits"),
            func.count(func.distinct(SiteVisit.user_id)).label("unique_users"),
        )
        .filter(SiteVisit.visited_at >= start_dt)
        .group_by(func.date(SiteVisit.visited_at))
        .order_by(func.date(SiteVisit.visited_at))
        .all()
    )

    by_date = {row.visit_date: row for row in rows}
    stats = []
    for idx in range(days):
        day = start_date + timedelta(days=idx)
        row = by_date.get(day)
        stats.append({
            "date": day.isoformat(),
            "total_visits": int(row.total_visits) if row else 0,
            "unique_users": int(row.unique_users) if row else 0,
        })

    return {
        "from": start_date.isoformat(),
        "to": now.date().isoformat(),
        "days": stats,
    }
# ----- USERS LIST


@router.get("/users", response_model=List[UserOut])
def list_users(
    q: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    manager_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: UserModel = Depends(admin_required),
):
    query = db.query(UserModel)
    if q:
        conds = [UserModel.email.ilike(f"%{q}%")]
        if hasattr(UserModel, "name"):
            conds.append(getattr(UserModel, "name").ilike(f"%{q}%"))
        query = query.filter(or_(*conds))
    if role:
        query = query.filter(func.upper(
            func.cast(UserModel.role, str)) == role.upper())
    if is_active is not None:
        query = query.filter(UserModel.is_active == is_active)
    if manager_id is not None:
        query = query.filter(UserModel.manager_id == manager_id)

    return query.order_by(UserModel.id.desc()).offset(offset).limit(limit).all()

# ----- USER DETAILS


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db), _: UserModel = Depends(admin_required)):
    obj = db.query(UserModel).get(user_id)
    if not obj:
        raise HTTPException(404, "error.user.notFound")
    return obj

# ----- USER PATCH


@router.patch("/users/{user_id}", response_model=UserOut)
def patch_user(
    user_id: int,
    body: UserPatch,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(admin_required)
):
    obj = db.query(UserModel).get(user_id)
    if not obj:
        raise HTTPException(404, "User not found")

    before = {"role": getattr(obj.role, "value", obj.role),
              "is_active": obj.is_active,
              "manager_id": obj.manager_id}

    if body.role is not None:
        try:
            obj.role = UserRole(body.role.upper())
        except Exception:
            raise HTTPException(400, "error.role.unknown")
    if body.is_active is not None:
        obj.is_active = body.is_active
    if body.manager_id is not None:
        obj.manager_id = body.manager_id

    db.add(obj)
    db.commit()
    db.refresh(obj)

    # Аудит если модель есть (не критично)
    try:
        from models import AdminAction
        db.add(AdminAction(
            admin_user_id=admin.id,
            action="USER_PATCH",
            target_type="user",
            target_id=obj.id,
            payload_before=str(before),
            payload_after=str({
                "role": getattr(obj.role, "value", obj.role),
                "is_active": obj.is_active,
                "manager_id": obj.manager_id
            })
        ))
        db.commit()
    except Exception:
        db.rollback()

    return obj


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(admin_required),
):
    obj = db.query(UserModel).get(user_id)
    if not obj:
        raise HTTPException(404, "User not found")
    if admin.id == obj.id:
        raise HTTPException(400, "error.admin.cannotDeleteSelf")

    before = {
        "email": obj.email,
        "role": getattr(obj.role, "value", obj.role),
        "is_active": obj.is_active,
    }

    # Обезличиваем данные, чтобы освободить e-mail и предотвратить логин
    timestamp = int(datetime.utcnow().timestamp())
    obj.email = f"deleted-{obj.id}-{timestamp}@deleted.local"
    obj.hashed_password = f"deleted-{secrets.token_hex(16)}"
    obj.is_active = False
    obj.manager_id = None
    obj.session_uuid = None
    obj.session_updated_at = datetime.utcnow()

    try:
        from models import UserSession

        db.query(UserSession).filter(UserSession.user_id == obj.id).delete()
    except Exception:
        pass

    db.add(obj)
    db.commit()
    db.refresh(obj)

    try:
        from models import AdminAction

        db.add(
            AdminAction(
                admin_user_id=admin.id,
                action="USER_DELETE",
                target_type="user",
                target_id=obj.id,
                payload_before=str(before),
                payload_after=str({"email": obj.email, "is_active": obj.is_active}),
            )
        )
        db.commit()
    except Exception:
        db.rollback()

    return {"ok": True}

# ----- VERIFY USER


@router.post("/users/{user_id}/verify")
def verify_user(
    user_id: int,
    body: VerifyBody,
    db: Session = Depends(get_db),
    admin: UserModel = Depends(admin_required),
):
    obj = db.query(UserModel).get(user_id)
    if not obj:
        raise HTTPException(404, "User not found")

    if hasattr(obj, "is_verified"):
        before = {"is_verified": obj.is_verified}
        obj.is_verified = bool(body.verified)
    elif hasattr(obj, "verification_status"):
        before = {"verification_status": obj.verification_status}
        obj.verification_status = "verified" if body.verified else "rejected"
    else:
        raise HTTPException(400, "error.user.noVerificationField")

    db.add(obj)
    db.commit()
    db.refresh(obj)

    try:
        from models import AdminAction
        db.add(AdminAction(
            admin_user_id=admin.id,
            action="USER_VERIFY",
            target_type="user",
            target_id=obj.id,
            payload_before=str(before),
            payload_after=str(
                {"verified": body.verified, "comment": body.comment})
        ))
        db.commit()
    except Exception:
        db.rollback()

    return {"ok": True}

# ===== ЗАЯВКИ (ORDERS) =====


@router.get("/orders", response_model=List[OrderOut])
def admin_orders(
    q: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: UserModel = Depends(admin_required),
):
    query = db.query(Order)
    if q:
        from sqlalchemy import or_
        fields = ["title", "description",
                  "from_city", "to_city", "contact_name"]
        query = query.filter(or_(*[
            getattr(Order, f).ilike(f"%{q}%") for f in fields if hasattr(Order, f)
        ])) if any(hasattr(Order, f) for f in fields) else query
    if is_active is not None and hasattr(Order, "is_active"):
        query = query.filter(Order.is_active == is_active)
    if status and hasattr(Order, "status"):
        query = query.filter(func.upper(Order.status) == status.upper())
    sort_col = getattr(Order, "created_at", getattr(Order, "id"))
    return query.order_by(sort_col.desc()).offset(offset).limit(limit).all()


@router.post("/orders/{order_id}/deactivate")
def admin_order_deactivate(order_id: int, db: Session = Depends(get_db), admin: UserModel = Depends(admin_required)):
    obj = db.query(Order).get(order_id)
    if not obj:
        raise HTTPException(status_code=404, detail={
                            "code": "error.order.notFound", "message": "Заявка не найдена"})
    before = {}
    if hasattr(obj, "is_active"):
        before["is_active"] = obj.is_active
        obj.is_active = False
    elif hasattr(obj, "status"):
        before["status"] = obj.status
        obj.status = "inactive"
    else:
        raise HTTPException(400, "Нет полей 'is_active'/'status'")
    db.add(obj)
    db.commit()
    db.refresh(obj)
    try:
        from models import AdminAction
        db.add(AdminAction(admin_user_id=admin.id, action="ORDER_DEACTIVATE",
                           target_type="order", target_id=obj.id,
                           payload_before=str(before),
                           payload_after=str({"is_active": getattr(obj, "is_active", None), "status": getattr(obj, "status", None)})))
        db.commit()
    except:
        db.rollback()
    return {"ok": True}


@router.post("/orders/{order_id}/activate")
def admin_order_activate(order_id: int, db: Session = Depends(get_db), admin: UserModel = Depends(admin_required)):
    obj = db.query(Order).get(order_id)
    if not obj:
        raise HTTPException(status_code=404, detail={
                            "code": "error.order.notFound", "message": "Заявка не найдена"})
    before = {}
    if hasattr(obj, "is_active"):
        before["is_active"] = obj.is_active
        obj.is_active = True
    elif hasattr(obj, "status"):
        before["status"] = obj.status
        obj.status = "active"
    else:
        raise HTTPException(400, "Нет полей 'is_active'/'status'")
    db.add(obj)
    db.commit()
    db.refresh(obj)
    try:
        from models import AdminAction
        db.add(AdminAction(admin_user_id=admin.id, action="ORDER_ACTIVATE",
                           target_type="order", target_id=obj.id,
                           payload_before=str(before),
                           payload_after=str({"is_active": getattr(obj, "is_active", None), "status": getattr(obj, "status", None)})))
        db.commit()
    except:
        db.rollback()
    return {"ok": True}


# ===== ТРАНСПОРТ =====
@router.get("/transports", response_model=List[TransportOut])
def admin_transports(
    q: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: UserModel = Depends(admin_required),
):
    query = db.query(Transport)
    if q:
        from sqlalchemy import or_
        fields = ["title", "description",
                  "from_city", "to_city", "driver_name"]
        query = query.filter(or_(*[
            getattr(Transport, f).ilike(f"%{q}%") for f in fields if hasattr(Transport, f)
        ])) if any(hasattr(Transport, f) for f in fields) else query
    if is_active is not None and hasattr(Transport, "is_active"):
        query = query.filter(Transport.is_active == is_active)
    if status and hasattr(Transport, "status"):
        query = query.filter(func.upper(Transport.status) == status.upper())
    sort_col = getattr(Transport, "created_at", getattr(Transport, "id"))
    return query.order_by(sort_col.desc()).offset(offset).limit(limit).all()


@router.post("/transports/{transport_id}/deactivate")
def admin_transport_deactivate(transport_id: str, db: Session = Depends(get_db), admin: UserModel = Depends(admin_required)):
    try:
        tid: UUID = UUID(transport_id)
    except Exception:
        tid = transport_id
    obj = db.query(Transport).get(tid)
    if not obj:
        raise HTTPException(status_code=404, detail={
                            "code": "error.transport.notFound", "message": "Транспорт не найден"})
    before = {}
    if hasattr(obj, "is_active"):
        before["is_active"] = obj.is_active
        obj.is_active = False
    elif hasattr(obj, "status"):
        before["status"] = obj.status
        obj.status = "inactive"
    else:
        raise HTTPException(400, "Нет полей 'is_active'/'status'")
    db.add(obj)
    db.commit()
    db.refresh(obj)
    try:
        from models import AdminAction
        db.add(AdminAction(admin_user_id=admin.id, action="TRANSPORT_DEACTIVATE",
                           target_type="transport", target_id=obj.id,
                           payload_before=str(before),
                           payload_after=str({"is_active": getattr(obj, "is_active", None), "status": getattr(obj, "status", None)})))
        db.commit()
    except:
        db.rollback()
    return {"ok": True}


@router.post("/transports/{transport_id}/activate")
def admin_transport_activate(transport_id: str, db: Session = Depends(get_db), admin: UserModel = Depends(admin_required)):
    try:
        tid: UUID = UUID(transport_id)
    except Exception:
        tid = transport_id
    obj = db.query(Transport).get(tid)
    if not obj:
        raise HTTPException(status_code=404, detail={
                            "code": "error.transport.notFound", "message": "Транспорт не найден"})
    before = {}
    if hasattr(obj, "is_active"):
        before["is_active"] = obj.is_active
        obj.is_active = True
    elif hasattr(obj, "status"):
        before["status"] = obj.status
        obj.status = "active"
    else:
        raise HTTPException(400, "Нет полей 'is_active'/'status'")
    db.add(obj)
    db.commit()
    db.refresh(obj)
    try:
        from models import AdminAction
        db.add(AdminAction(admin_user_id=admin.id, action="TRANSPORT_ACTIVATE",
                           target_type="transport", target_id=obj.id,
                           payload_before=str(before),
                           payload_after=str({"is_active": getattr(obj, "is_active", None), "status": getattr(obj, "status", None)})))
        db.commit()
    except:
        db.rollback()
    return {"ok": True}

# ===== ТРЕКИНГ =====


@router.get("/tracking/sessions", response_model=List[TrackingSessionOut])
def admin_tracking_sessions(
    is_active: Optional[bool] = Query(None),
    user_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: UserModel = Depends(admin_required),
):
    query = db.query(TrackingSession)
    if is_active is not None and hasattr(TrackingSession, "is_active"):
        query = query.filter(TrackingSession.is_active == is_active)
    if user_id is not None and hasattr(TrackingSession, "user_id"):
        query = query.filter(TrackingSession.user_id == user_id)
    sort_col = getattr(TrackingSession, "started_at",
                       getattr(TrackingSession, "id"))
    return query.order_by(sort_col.desc()).offset(offset).limit(limit).all()


@router.post("/tracking/sessions/{session_id}/revoke")
def admin_tracking_revoke(session_id: str, db: Session = Depends(get_db), admin: UserModel = Depends(admin_required)):
    try:
        sid: UUID = UUID(session_id)
    except Exception:
        sid = session_id
    obj = db.query(TrackingSession).get(sid)
    if not obj:
        raise HTTPException(404, "Tracking session not found")
    before = {"is_active": getattr(
        obj, "is_active", None), "ended_at": getattr(obj, "ended_at", None)}
    if hasattr(obj, "is_active"):
        obj.is_active = False
    if hasattr(obj, "ended_at"):
        obj.ended_at = datetime.utcnow()
    db.add(obj)
    db.commit()
    db.refresh(obj)
    try:
        from models import AdminAction
        db.add(AdminAction(admin_user_id=admin.id, action="TRACKING_REVOKE",
                           target_type="tracking_session", target_id=obj.id,
                           payload_before=str(before),
                           payload_after=str({"is_active": getattr(obj, "is_active", None), "ended_at": getattr(obj, "ended_at", None)})))
        db.commit()
    except:
        db.rollback()
    return {"ok": True}

# ===== АУДИТ =====


@router.get("/audit", response_model=List[AdminActionOut])
def admin_audit(
    action: Optional[str] = Query(None),
    target_type: Optional[str] = Query(None),
    admin_user_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: UserModel = Depends(admin_required),
):
    try:
        from models import AdminAction
    except Exception:
        return []

    # если таблицы нет — тихо возвращаем пусто
    try:
        engine = db.get_bind()
        if not inspect(engine).has_table(AdminAction.__tablename__):
            return []
    except Exception:
        return []

    try:
        q = db.query(AdminAction)
        if action:
            q = q.filter(func.upper(AdminAction.action) == action.upper())
        if target_type:
            q = q.filter(func.upper(AdminAction.target_type)
                         == target_type.upper())
        if admin_user_id:
            q = q.filter(AdminAction.admin_user_id == admin_user_id)
        return q.order_by(AdminAction.id.desc()).offset(offset).limit(limit).all()
    except Exception:
        return []
