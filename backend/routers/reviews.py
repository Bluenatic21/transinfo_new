from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user
from models import Review, User as UserModel
from schemas import ReviewCreate, ReviewOut, UserRatingOut

router = APIRouter()


def _recalc_user_rating(db: Session, target_user_id: int) -> None:
    """
    Пересчитывает итоговый рейтинг пользователя по всем отзывам.
    Значение кладём в users.final_rating, чтобы не считать AVG при каждом GET.
    """
    count_, avg_ = db.query(
        func.count(Review.id),
        func.avg(Review.stars10),
    ).filter(
        Review.target_user_id == target_user_id,
        Review.stars10.isnot(None),
    ).one()

    user = db.query(UserModel).get(target_user_id)
    if not user:
        return

    # Если отзывов нет – оставляем дефолтные 10.0
    user.final_rating = 10.0 if avg_ is None else float(avg_)
    db.add(user)


@router.post("/reviews", response_model=ReviewOut)
def create_review(
    payload: ReviewCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    # Нельзя оценивать самого себя
    if payload.target_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя оставить отзыв самому себе")

    target = db.query(UserModel).get(payload.target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    review = Review(
        target_user_id=payload.target_user_id,
        author_user_id=current_user.id,
        # ВАЖНО: заполняем все старые NOT NULL-поля тем же значением,
        # иначе база кинет IntegrityError.
        punctuality=payload.stars10,
        communication=payload.stars10,
        professionalism=payload.stars10,
        terms=payload.stars10,
        stars10=payload.stars10,
        comment=payload.comment,
    )

    db.add(review)
    try:
        # Вставляем отзыв и сразу обновляем агрегированный рейтинг
        db.flush()
        _recalc_user_rating(db, payload.target_user_id)
        db.commit()
    except IntegrityError:
        db.rollback()
        # Если есть ограничение уникальности по (author_user_id, target_user_id),
        # превращаем его в 400, а не 500.
        raise HTTPException(
            status_code=400,
            detail="Вы уже оставили отзыв этому пользователю",
        )

    db.refresh(review)
    return review


@router.get("/users/{user_id}/reviews", response_model=List[ReviewOut])
def list_user_reviews(
    user_id: int,
    db: Session = Depends(get_db),
):
    """Список отзывов о пользователе (он — target)."""
    return (
        db.query(Review)
        .filter(Review.target_user_id == user_id)
        .order_by(Review.created_at.desc())
        .all()
    )


@router.get("/users/{user_id}/rating", response_model=UserRatingOut)
def get_user_rating(
    user_id: int,
    db: Session = Depends(get_db),
):
    """Итоговый рейтинг + количество отзывов."""
    user = db.query(UserModel).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    count_ = (
        db.query(func.count(Review.id))
        .filter(Review.target_user_id == user_id, Review.stars10.isnot(None))
        .scalar()
    ) or 0

    return UserRatingOut(
        final_rating=float(user.final_rating or 0.0),
        count_reviews=count_,
    )
