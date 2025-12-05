# block_rest.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
from models import User as UserModel, UserBlock

router = APIRouter()


def _blocked_union_ids(db: Session, me_id: int):
    mine = db.query(UserBlock.blocked_id).filter(
        UserBlock.blocker_id == me_id).all()
    me = db.query(UserBlock.blocker_id).filter(
        UserBlock.blocked_id == me_id).all()
    mine_ids = {row[0] for row in mine}
    me_ids = {row[0] for row in me}
    return {
        "blocked_by_me_ids": sorted(mine_ids),
        "blocked_me_ids":    sorted(me_ids),
        "all_ids":           sorted(mine_ids | me_ids),
    }


@router.get("/users/blocked")
def list_blocked(db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    return _blocked_union_ids(db, current_user.id)


@router.post("/users/{target_id}/block")
def block_user(target_id: int, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    if target_id == current_user.id:
        raise HTTPException(400, "error.block.self")
    exists = db.query(UserBlock).filter(
        UserBlock.blocker_id == current_user.id,
        UserBlock.blocked_id == target_id
    ).first()
    if exists:
        return {"status": "ok", "already": True}
    target = db.query(UserModel).filter(UserModel.id == target_id).first()
    if not target:
        raise HTTPException(404, "error.user.notFound")
    db.add(UserBlock(blocker_id=current_user.id, blocked_id=target_id))
    db.commit()
    return {"status": "ok"}


@router.delete("/users/{target_id}/block")
def unblock_user(target_id: int, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    deleted = db.query(UserBlock).filter(
        UserBlock.blocker_id == current_user.id,
        UserBlock.blocked_id == target_id
    ).delete(synchronize_session=False)
    db.commit()
    return {"status": "ok", "deleted": bool(deleted)}
