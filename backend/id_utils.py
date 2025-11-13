import random
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

LOW, HIGH = 7000000, 7999999

def gen7():
    return random.randint(LOW, HIGH)

def looks_external(s: str) -> bool:
    return s.isdigit() and len(s) == 7 and s[0] == '7'

def assign_public_id(db, user_model, user_obj, max_tries: int = 10):
    """Присвоить уникальный public_id пользователю, с ретраями на случай гонок."""
    for _ in range(max_tries):
        candidate = gen7()
        exists = db.execute(
            select(user_model.id).where(user_model.public_id == candidate)
        ).first()
        if not exists:
            user_obj.public_id = candidate
            try:
                db.flush()
                return candidate
            except IntegrityError:
                db.rollback()
    raise RuntimeError("Не удалось сгенерировать уникальный public_id")

def resolve_user_by_any_id(db, user_model, any_id: str):
    """Найти пользователя по внутреннему id (int) или внешнему public_id (7xxxxxx)."""
    if looks_external(any_id):
        return db.execute(
            select(user_model).where(user_model.public_id == int(any_id))
        ).scalar_one_or_none()
    if any_id.isdigit():
        return db.execute(
            select(user_model).where(user_model.id == int(any_id))
        ).scalar_one_or_none()
    return None
