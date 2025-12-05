
from sqlalchemy.orm import Session
from models import User as UserModel, UserRole

# в USD центах (фикс): 30 GEL ≈ $15; 15 GEL ≈ $7
USD_BASE_CENTS = 1500
USD_EMPLOYEE_CENTS = 1500
USD_SLOT_CENTS = 700


def employees_qty_for_manager(db: Session, manager_id: int) -> int:
    return db.query(UserModel).filter(UserModel.manager_id == manager_id).count()


def amount_now_usd_cents(db: Session, user: UserModel) -> int:
    """
    Возвращаем сумму «сейчас» (база + сидения). Слоты добиваем в конце периода.
    OWNER = 0.
    """
    if user.role == UserRole.OWNER:
        return 0
    if user.role == UserRole.TRANSPORT:
        return USD_BASE_CENTS
    if user.role == UserRole.MANAGER:
        seats = employees_qty_for_manager(db, user.id)
        return USD_BASE_CENTS + seats * USD_EMPLOYEE_CENTS
    # EMPLOYEE не платит отдельно
    return 0
