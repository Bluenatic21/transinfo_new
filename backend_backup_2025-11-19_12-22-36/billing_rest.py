
from auth import get_current_user
from payments_tbc import (
    create_payment,
    tbc_ping_auth,
    TbcAuthError,
    TbcHTTPError,
    get_payment_details,
)
from billing_calc import amount_now_usd_cents, USD_BASE_CENTS, USD_EMPLOYEE_CENTS, USD_SLOT_CENTS
from models import (
    User as UserModel, UserRole,
    Transport as TransportModel,
    Subscription, SubscriptionStatus,
    BillingUsageDaily,
    Payment, BillingPeriod,
)
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date, timedelta
from typing import Dict, Any
import os

from database import get_db

# === PAYMENTS MAINTENANCE SWITCH ===
# Set environment variable PAYMENTS_SUSPENDED to "1"/"true" to temporarily disable new checkouts.


def _payments_suspended() -> bool:
    return str(os.getenv("PAYMENTS_SUSPENDED", "0")).lower() in {"1", "true", "yes", "on"}


def require_payments_enabled():
    if _payments_suspended():
        # 503 so clients can retry later
        raise HTTPException(
            status_code=503, detail="Платёжная система временно отключена. Попробуйте позже.")
# === /PAYMENTS MAINTENANCE SWITCH ===


router = APIRouter(prefix="/api/billing", tags=["billing"])

# Фиксированные цены без курсов
USD_CENTS = {
    "BASE": 1500,         # $15  (30 GEL)
    "EMPLOYEE_SEAT": 1500,  # $15  (30 GEL)
    "TRANSPORT_SLOT": 700  # $7   (15 GEL)
}

PLAN_INFO = {
    "OWNER": {
        "monthly": {"GEL": 0, "USD": 0},
        "free_transport_slots": 0,
        "transport_slot_usd": 0,
        "employee_usd": 0,
    },
    "TRANSPORT": {
        "monthly": {"GEL": 30, "USD": 15},
        "free_transport_slots": 1,
        "transport_slot_usd": 7,
        "employee_usd": 0,
    },
    "MANAGER": {
        "monthly": {"GEL": 30, "USD": 15},
        "free_transport_slots": 1,
        "transport_slot_usd": 7,
        "employee_usd": 15,
    },
}


@router.post("/fake_pay", dependencies=[Depends(require_payments_enabled)])
def fake_pay(
    days: int = 30,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """
    ТЕСТОВАЯ ручка: включает/продлевает подписку на `days` дней вперёд.
    Используется для проверки paywall без реального TBC.
    """
    from datetime import datetime, timedelta
    # чей счёт биллим (для EMPLOYEE — менеджер)
    account_id = (current_user.manager_id if current_user.role == UserRole.EMPLOYEE and current_user.manager_id
                  else current_user.id)
    sub = (
        db.query(Subscription)
        .filter(Subscription.account_id == account_id)
        .first()
    )
    now = datetime.utcnow()
    if not sub:
        sub = Subscription(
            account_id=account_id,
            role=current_user.role,
            period="monthly",
            status=SubscriptionStatus.ACTIVE,
            next_renewal_at=now + timedelta(days=days),
        )
        db.add(sub)
        db.commit()
        db.refresh(sub)
    else:
        # просто продлеваем и активируем
        sub.status = SubscriptionStatus.ACTIVE
        base = sub.next_renewal_at if (
            sub.next_renewal_at and sub.next_renewal_at > now) else now
        sub.next_renewal_at = base + timedelta(days=days)
        db.commit()
        db.refresh(sub)
    return {
        "ok": True,
        "subscription_id": sub.id,
        "status": sub.status.value,
        "next_renewal_at": sub.next_renewal_at,
        "account_id": sub.account_id,
    }


@router.post("/fake_cancel")
def fake_cancel(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """
    ТЕСТОВАЯ ручка: отменяет подписку аккаунта (делает CANCELED).
    Удобно для проверки paywall без реальных оплат.
    """
    account_id = (current_user.manager_id if current_user.role == UserRole.EMPLOYEE and current_user.manager_id
                  else current_user.id)
    sub = (
        db.query(Subscription)
        .filter(Subscription.account_id == account_id)
        .first()
    )
    if not sub:
        return {"ok": True, "status": "INACTIVE"}
    sub.status = SubscriptionStatus.CANCELED
    db.commit()
    db.refresh(sub)
    return {"ok": True, "status": sub.status.value}


def _billing_account_id(u: UserModel) -> int:
    # EMPLOYEE биллится на менеджера
    if u.role.name == "EMPLOYEE" and u.manager_id:
        return u.manager_id
    return u.id


def _account_user_ids(db: Session, account_id: int):
    # Менеджер + его сотрудники; для TRANSPORT просто он сам
    users = db.query(UserModel).filter(
        (UserModel.id == account_id) | (UserModel.manager_id == account_id)
    ).all()
    return [x.id for x in users]


@router.get("/plans")
def get_plans() -> Dict[str, Any]:
    return PLAN_INFO


@router.get("/subscription")
def get_subscription(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    if current_user.role == UserRole.OWNER:
        return {"role": "OWNER", "status": "FREE", "period": "monthly"}

    account_id = _billing_account_id(current_user)
    sub = (
        db.query(Subscription)
        .filter(Subscription.account_id == account_id)
        .filter(Subscription.status != SubscriptionStatus.CANCELED)
        .first()
    )

    if not sub:
        return {
            "id": None,
            "role": current_user.role.value,
            "status": "INACTIVE",
            "period": "monthly",
            "next_renewal_at": None,
        }

    return {
        "id": sub.id,
        "role": sub.role.value,
        "status": sub.status.value,
        "period": sub.period,
        "next_renewal_at": sub.next_renewal_at,
    }


def _open_or_create_period(db: Session, sub: Subscription) -> BillingPeriod:
    period = (
        db.query(BillingPeriod)
        .filter(BillingPeriod.subscription_id == sub.id, BillingPeriod.closed_at.is_(None))
        .order_by(BillingPeriod.id.desc())
        .first()
    )
    if period:
        return period
    start = datetime.utcnow()
    end = start + timedelta(days=30)
    period = BillingPeriod(
        subscription_id=sub.id,
        period_start=start,
        period_end=end,
        peak_active_transports=0,
        chargeable_transport_slots=0,
        employees_qty=0,
        base_amount_usd_cents=0,
        addons_amount_usd_cents=0,
    )
    db.add(period)
    sub.next_renewal_at = end
    db.commit()
    db.refresh(period)
    return period


def _peak_active_transports(db: Session, account_id: int, start, end) -> int:
    mx = (
        db.query(func.max(BillingUsageDaily.active_transport_count))
        .filter(BillingUsageDaily.account_id == account_id)
        .filter(BillingUsageDaily.day >= start.date())
        .filter(BillingUsageDaily.day <= end.date())
        .scalar()
    ) or 0
    if mx == 0:
        ids = _account_user_ids(db, account_id)
        cur = (
            db.query(func.count(TransportModel.id))
            .filter(TransportModel.owner_id.in_(ids))
            .filter(TransportModel.is_active.is_(True))
            .scalar()
        ) or 0
        mx = int(cur)
    return int(mx)


@router.get("/period/preview")
def period_preview(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    if current_user.role == UserRole.OWNER:
        return {"message": "OWNER is free"}
    account_id = _billing_account_id(current_user)
    sub = (
        db.query(Subscription)
        .filter(Subscription.account_id == account_id, Subscription.status == SubscriptionStatus.ACTIVE)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription")
    period = _open_or_create_period(db, sub)
    peak = _peak_active_transports(
        db, account_id, period.period_start, period.period_end)
    chargeable = max(0, peak - 1)
    amount_usd = chargeable * (USD_SLOT_CENTS / 100.0)
    return {
        "period_start": period.period_start,
        "period_end": period.period_end,
        "peak_active_transports": peak,
        "chargeable_slots": chargeable,
        "addons_amount_usd": amount_usd,
    }


@router.get("/usage/preview")
def usage_preview(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    if current_user.role == UserRole.OWNER:
        return {"active_transports": 0, "free_slots": 0, "chargeable_slots": 0, "chargeable_usd": 0}

    account_id = _billing_account_id(current_user)
    ids = _account_user_ids(db, account_id)

    active_count = (
        db.query(func.count(TransportModel.id))
        .filter(TransportModel.owner_id.in_(ids))
        .filter(TransportModel.is_active.is_(True))
        .scalar()
    ) or 0

    free_slots = 1  # MANAGER/TRANSPORT
    chargeable_slots = max(0, active_count - free_slots)
    return {
        "active_transports": int(active_count),
        "free_slots": free_slots,
        "chargeable_slots": chargeable_slots,
        "chargeable_usd": chargeable_slots * (USD_CENTS["TRANSPORT_SLOT"] / 100.0),
    }


@router.post("/webhooks/payze")  # оставляем для совместимости
async def payze_webhook(req: Request, db: Session = Depends(get_db)):
    """
    Обрабатываем события Payze. Структура содержит PaymentStatus/PaymentId/FinalAmount/Currency и т.п. :contentReference[oaicite:4]{index=4}
    """
    try:
        payload = await req.json()
    except Exception:
        payload = {}

    payment_status = (payload or {}).get("PaymentStatus")
    payment_id = (payload or {}).get("PaymentId") or (
        payload or {}).get("data", {}).get("PaymentId")
    final_amount = (payload or {}).get("FinalAmount")
    currency = (payload or {}).get("Currency")

    p = Payment(
        subscription_id=None,
        amount_usd_cents=0,  # для простоты: пишем 0, в проде маппим конверсию если платили не в USD
        currency=currency or "USD",
        status=("succeeded" if payment_status in ("Captured", "Blocked")
                else str(payment_status or "unknown")),
        processor="tbc",
        external_payment_id=payment_id,
        payload=payload,
    )
    db.add(p)
    db.commit()
    return {"ok": True}


@router.post("/webhooks/tbc")
async def tbc_webhook(req: Request, db: Session = Depends(get_db)):
    """
    Простой webhook для TBC:
    ждём JSON {"PaymentId": "..."} и фиксируем итоговый статус в таблице payments.
    Рекомендуется в кабинете TBC указать этот URL.
    """
    try:
        payload = await req.json()
    except Exception:
        payload = {}
    pay_id = (payload or {}).get("PaymentId") or (payload or {}).get("payId")
    status = "unknown"
    if pay_id:
        try:
            details = get_payment_details(pay_id)
            raw = (details or {}).get("status") or (
                details or {}).get("statusCode")
            if str(raw).lower() in ("succeeded", "approved"):
                status = "succeeded"
            elif str(raw).lower() in ("waitingconfirm", "preauthorized"):
                status = "blocked"
            elif str(raw).lower() in ("failed",):
                status = "failed"
            elif str(raw).lower() in ("expired",):
                status = "expired"
            else:
                status = str(raw or "unknown")
        except Exception:
            status = "unknown"
    p = Payment(
        subscription_id=None,
        amount_usd_cents=0,
        currency="USD",
        status=status,
        processor="tbc",
        external_payment_id=pay_id,
        payload=payload,
    )
    db.add(p)
    db.commit()
    return {"ok": True}


@router.post("/checkout/addons", dependencies=[Depends(require_payments_enabled)])
def start_checkout_addons(
    request: Request,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """
    Создаём платёж на сумму аддонов (слоты) за текущий открытый период — по пиковому значению на текущий момент.
    Удобно для ручного теста в dev. В проде это делает планировщик при закрытии периода.
    """
    if current_user.role == UserRole.OWNER:
        raise HTTPException(status_code=400, detail="OWNER plan is free")
    account_id = _billing_account_id(current_user)
    sub = (
        db.query(Subscription)
        .filter(Subscription.account_id == account_id, Subscription.status == SubscriptionStatus.ACTIVE)
        .first()
    )
    if not sub:
        raise HTTPException(status_code=404, detail="No active subscription")
    period = _open_or_create_period(db, sub)
    peak = _peak_active_transports(
        db, account_id, period.period_start, period.period_end)
    chargeable = max(0, peak - 1)
    addons_usd_cents = chargeable * USD_SLOT_CENTS
    if addons_usd_cents <= 0:
        raise HTTPException(status_code=400, detail="No addons to charge")
    # используем TBC_* если заданы, иначе — ваши старые переменные
    success_url = os.getenv(
        "TBC_SUCCESS_URL") or os.getenv("PAYZE_SUCCESS_URL")
    fail_url = os.getenv("TBC_FAIL_URL") or os.getenv("PAYZE_FAIL_URL")
    meta = {
        "account_id": sub.account_id,
        "reason": "transport_slots_addons_manual",
        "subscription_id": sub.id,
        "period_id": period.id,
        "chargeable_slots": chargeable,
        "usd_cents": addons_usd_cents,
    }
    try:
        payment_id, redirect_url = create_payment(
            amount=addons_usd_cents / 100.0,
            currency="USD",
            description=f"Transport slots addons ({chargeable} × $7)",
            metadata=meta,
            success_url=success_url,
            fail_url=fail_url,
            preauthorize=False,
            user_ip=(request.client.host if request and request.client else None),
        )
    except TbcAuthError as e:
        raise HTTPException(
            status_code=401, detail=f"TBC auth failed: {str(e)}")
    except TbcHTTPError as e:
        raise HTTPException(
            status_code=502, detail=f"TBC error {e.status}: {e.body[:300]}")
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"TBC unknown error: {str(e)[:300]}")
    draft = Payment(
        subscription_id=sub.id,
        amount_usd_cents=addons_usd_cents,
        currency="USD",
        status="created",
        processor="tbc",
        external_payment_id=payment_id,
        payload={"meta": meta, "redirect_url": redirect_url},
    )
    db.add(draft)
    db.commit()
    return {"payment_id": payment_id, "redirect_url": redirect_url}


@router.get("/debug/tbc-auth", dependencies=[Depends(require_payments_enabled)])
def debug_tbc_auth():
    """
    Быстрый тест авторизации TBC.
    200 -> всё ок. 401 -> проверьте ключи/подписку.
    """
    try:
        return tbc_ping_auth()
    except TbcAuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except TbcHTTPError as e:
        raise HTTPException(
            status_code=502, detail=f"TBC error {e.status}: {e.body[:300]}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Унифицированный ping (для фронта/мониторинга)


@router.get("/ping")
def ping_tbc():
    try:
        return tbc_ping_auth()
    except TbcAuthError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except TbcHTTPError as e:
        raise HTTPException(
            status_code=502, detail=f"TBC error {e.status}: {e.body[:300]}")


@router.post("/checkout/start", dependencies=[Depends(require_payments_enabled)])
def start_checkout(
    request: Request,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """
    Создаём платёж на сумму «база + сидения» по фикс. тарифам ($15 / $15 за seat).
    Возвращаем redirect_url (TBC E-Commerce / tpay).
    """
    if current_user.role == UserRole.OWNER:
        raise HTTPException(status_code=400, detail="OWNER plan is free")

    usd_cents = amount_now_usd_cents(db, current_user)
    if usd_cents <= 0:
        raise HTTPException(status_code=400, detail="Nothing to pay now")

    # предпочтительно брать TBC_*, но оставляем fallback на старые PAYZE_* чтобы фронт не ломать
    success_url = os.getenv(
        "TBC_SUCCESS_URL") or os.getenv("PAYZE_SUCCESS_URL")
    fail_url = os.getenv("TBC_FAIL_URL") or os.getenv("PAYZE_FAIL_URL")

    meta = {
        "account_id": current_user.id,
        "reason": "subscription_base",
        "role": current_user.role.value,
        "usd_cents": usd_cents,
    }
    try:
        payment_id, redirect_url = create_payment(
            amount=usd_cents / 100.0,
            currency="USD",
            description=f"Subscription for {current_user.role.value}",
            metadata=meta,
            success_url=success_url,
            fail_url=fail_url,
            preauthorize=False,
            user_ip=(request.client.host if request and request.client else None),
        )
    except TbcAuthError as e:
        raise HTTPException(
            status_code=401, detail=f"TBC auth failed: {str(e)}")
    except TbcHTTPError as e:
        raise HTTPException(
            status_code=502, detail=f"TBC error {e.status}: {e.body[:300]}")
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"TBC unknown error: {str(e)[:300]}")
    # сохраняем запись-черновик
    draft = Payment(
        subscription_id=None,
        amount_usd_cents=usd_cents,
        currency="USD",
        status="created",
        processor="tbc",
        external_payment_id=payment_id,
        payload={"meta": meta},
    )
    db.add(draft)
    db.commit()
    return {"payment_id": payment_id, "redirect_url": redirect_url}
