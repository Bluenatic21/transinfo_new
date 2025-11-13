from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session
from typing import List
from models import Notification
from schemas import NotificationOut
from auth import get_current_user
from database import get_db

router = APIRouter()


@router.get("/notifications", response_model=List[NotificationOut])
def get_notifications(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(Notification).filter_by(user_id=user.id).order_by(Notification.created_at.desc()).limit(100).all()


@router.post("/notifications/read")
def mark_read(ids: List[int] = Body(...), db: Session = Depends(get_db), user=Depends(get_current_user)):
    db.query(Notification).filter(Notification.user_id == user.id, Notification.id.in_(
        ids)).update({"read": True}, synchronize_session=False)
    db.commit()
    return {"status": "ok"}
