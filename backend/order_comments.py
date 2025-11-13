from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models import OrderComment, User, Order
from schemas import OrderCommentCreate, OrderCommentOut
from auth import get_current_user

router = APIRouter()


@router.get("/orders/{order_id}/comments", response_model=List[OrderCommentOut])
def get_order_comments(order_id: int, db: Session = Depends(get_db)):
    comments = db.query(OrderComment).filter(
        OrderComment.order_id == order_id).order_by(OrderComment.created_at).all()
    result = []
    for c in comments:
        user = c.user  # User объект (relationship)
        out = OrderCommentOut(
            id=c.id,
            user_id=c.user_id,
            order_id=c.order_id,
            created_at=c.created_at,
            content=c.content,
            username=(getattr(user, "contact_person", None) or getattr(
                user, "organization", None) or getattr(user, "username", None) or getattr(user, "email", None)),
            avatar=(getattr(user, "avatar", None)
                    or getattr(user, "avatar_url", None)),
            contact_person=getattr(user, "contact_person", None)
        )
        result.append(out)
    return result


@router.post("/orders/{order_id}/comments", response_model=OrderCommentOut)
def add_order_comment(order_id: int, data: OrderCommentCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Проверка, что order существует (можно убрать если не требуется)
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(404, detail="error.order.notFound")
    comment = OrderComment(
        order_id=order_id,
        user_id=user.id,
        content=data.content,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return OrderCommentOut(
        id=comment.id,
        user_id=comment.user_id,
        order_id=comment.order_id,
        created_at=comment.created_at,
        content=comment.content,
        username=user.organization or user.email
    )
