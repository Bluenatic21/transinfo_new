from models import User, Rating, Order
from utils.ratings import calc_final_rating
from sqlalchemy.orm import Session
from datetime import datetime


def recalc_all_user_ratings(db: Session):
    users = db.query(User).all()
    for user in users:
        ratings = db.query(Rating).filter(Rating.user_id == user.id).order_by(
            Rating.created_at.desc()).all()
        # Поддержка старой схемы: вместо 4 критериев просто используем score, дублируя

        class DummyRating:
            def __init__(self, r):
                self.punctuality = r.score
                self.communication = r.score
                self.professionalism = r.score
                self.reliability = r.score
        dummy_ratings = [DummyRating(r) for r in ratings]
        # Здесь deals остаются без изменений
        deals = []  # Если у тебя нет таблицы сделок — передай пустой список или получай, как в Order
        user.final_rating = calc_final_rating(user, dummy_ratings, deals)
    db.commit()
