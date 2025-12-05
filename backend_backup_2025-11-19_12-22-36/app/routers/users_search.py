# app/routers/users_search.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_, func, cast, String

# ВАЖНО: пути импорта под твой проект.
# В твоём коде в auth.py используется "from database import get_db" и "from models import User".
# Если у тебя модели внутри пакета app/…, замени на: "from app.models.user import User" и "from app.database import get_db".
from database import get_db
from models import User

router = APIRouter()

@router.get("/users/search")
def search_users(query: str, db: Session = Depends(get_db)):
    """
    Поиск пользователей по имени/почте + по числовому id/public_id.
    Возвращаем "красивый" id: public_id (7xxxxxx), иначе обычный id.
    """
    q = (query or "").strip()
    if not q:
        return []

    like = f"%{q}%"
    filters = []

    # Поиск по name (если поле есть) и по e-mail (регистронезависимо)
    if hasattr(User, "name"):
        filters.append(User.name.ilike(like))
    filters.append(func.lower(User.email).like(func.lower(like)))

    # Если ввод — только цифры, ищем также по id / public_id как по строке
    if q.isdigit():
        filters.append(cast(User.id, String).ilike(like))
        if hasattr(User, "public_id"):
            filters.append(cast(User.public_id, String).ilike(like))

    users = (
        db.query(User)
          .filter(or_(*filters))
          .order_by(User.id.desc())
          .limit(20)
          .all()
    )

    return [
        {
            "id": (getattr(u, "public_id", None) or u.id),  # наружу — «красивый» id
            "public_id": getattr(u, "public_id", None),
            "email": u.email,
            "name": getattr(u, "name", None),
        }
        for u in users
    ]
