from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import Request
from sqlalchemy.orm import Session

from models import SiteVisit, User, UserSession

VISIT_INTERVAL = timedelta(minutes=30)


def _client_ip(request: Optional[Request]) -> Optional[str]:
    if not request:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
        if ip:
            return ip
    if request.client:
        return request.client.host
    return None


def record_user_activity(db: Session, user: User, request: Optional[Request] = None) -> None:
    """Upsert user session info and record periodic site visits."""
    if not user or not getattr(user, "id", None):
        return

    now = datetime.utcnow()
    ip_address = _client_ip(request)
    user_agent = request.headers.get("user-agent")[:512] if request else None
    last_path = request.url.path if request else None

    session = db.query(UserSession).filter(
        UserSession.user_id == user.id).first()
    if not session:
        session = UserSession(user_id=user.id)
        db.add(session)

    session.last_seen_at = now
    session.ip_address = ip_address
    session.user_agent = user_agent
    session.last_path = last_path
    if not session.created_at:
        session.created_at = now
    user.last_active_at = now

    should_add_visit = False
    if not session.last_visit_at:
        should_add_visit = True
    else:
        if now - session.last_visit_at >= VISIT_INTERVAL:
            should_add_visit = True

    if should_add_visit:
        session.last_visit_at = now
        visit = SiteVisit(
            user_id=user.id,
            visited_at=now,
            path=last_path,
            ip_address=ip_address,
        )
        db.add(visit)

    try:
        db.commit()
    except Exception:
        db.rollback()
