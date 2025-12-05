from sqlalchemy.orm import Session
from sqlalchemy import func
from models import Review, User

# Все стартуют с 10 и только снижаются при плохих оценках:
# final = (C*10 + sum(s_i)) / (C + n)
M = 10.0
C = 10


def recalc_user_rating(db: Session, user_id: int) -> tuple[float, int]:
    legacy_avg = (Review.punctuality + Review.communication +
                  Review.professionalism + Review.terms) / 4.0
    s_expr = func.coalesce(Review.stars10 * 1.0, legacy_avg)
    n, avg_s = db.query(func.count(Review.id), func.coalesce(func.avg(s_expr), 0.0))\
                 .filter(Review.target_user_id == user_id).one()
    final = (C * M + n * float(avg_s)) / (C + (n or 0))
    # Границы 0..10 и подавление плавающих погрешностей
    final = max(0.0, min(10.0, round(final + 1e-8, 1)))
    db.query(User).filter(User.id == user_id).update({"final_rating": final})
    db.commit()
    return final, n
