from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, text
from typing import List

from database import get_db
from models import Review, User as UserModel
from schemas import ReviewCreate, ReviewOut, UserRatingOut
from services.rating import recalc_user_rating
from auth import get_current_user
from models import NotificationType
from notifications import create_notification

router = APIRouter(prefix="/reviews", tags=["reviews"])

COOLDOWN_DAYS = 30


@router.post("", response_model=ReviewOut)
def create_review(payload: ReviewCreate, db: Session = Depends(get_db), me: UserModel = Depends(get_current_user)):
    if payload.target_user_id == me.id:
        raise HTTPException(status_code=400, detail="Нельзя оценивать себя.")

    already = db.query(func.count(Review.id)).filter(
        Review.author_user_id == me.id,
        Review.target_user_id == payload.target_user_id,
        Review.created_at >= text(f"now() - interval '{COOLDOWN_DAYS} days'")
    ).scalar()
    if already:
        raise HTTPException(
            status_code=409, detail=f"Вы уже оставляли отзыв этому пользователю в последние {COOLDOWN_DAYS} дней.")

    # Новый формат: одна оценка 1..10
    if payload.stars10 < 1 or payload.stars10 > 10:
        raise HTTPException(
            status_code=400, detail="stars10 должен быть в диапазоне 1..10")

    # В БД legacy-поля NOT NULL → заполняем их тем же значением, чтобы не падать на вставке
    review = Review(
        target_user_id=payload.target_user_id,
        author_user_id=me.id,
        stars10=payload.stars10,
        punctuality=payload.stars10,
        communication=payload.stars10,
        professionalism=payload.stars10,
        terms=payload.stars10,
        comment=payload.comment,
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    # --- Уведомляем получателя отзыва ---
    try:
        author_label = getattr(me, "organization", None) or getattr(
            me, "contact_person", None) or getattr(me, "email", "пользователь")
    except Exception:
        author_label = "пользователь"
    create_notification(
        db=db,
        user_id=payload.target_user_id,
        notif_type=NotificationType.REVIEW_RECEIVED,
        message=f"Вам оставили отзыв от {author_label}",
        related_id=review.id,  # id отзыва для возможной подсветки
    )
    recalc_user_rating(db, payload.target_user_id)
    return review


@router.get("/user/{user_id}", response_model=List[ReviewOut])
def list_reviews_for_user(
    user_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    offset = (page - 1) * per_page
    items = (db.query(Review)
               .filter(Review.target_user_id == user_id)
               .order_by(desc(Review.created_at))
               .offset(offset).limit(per_page).all())
    return items


@router.get("/user/{user_id}/rating", response_model=UserRatingOut)
def get_user_rating(user_id: int, db: Session = Depends(get_db)):
    from services.rating import M, C
    s_expr = func.coalesce(
        Review.stars10 * 1.0,
        (Review.punctuality + Review.communication +
         Review.professionalism + Review.terms) / 4.0
    )
    n, avg_s = db.query(func.count(Review.id), func.coalesce(func.avg(s_expr), 0.0))\
                 .filter(Review.target_user_id == user_id).one()
    final = (C * M + n * float(avg_s)) / (C + (n or 0))
    final = max(0.0, min(10.0, round(final + 1e-8, 1)))
    return {"final_rating": final, "count_reviews": n}
