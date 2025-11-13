
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, date
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import SessionLocal
from models import (
    User as UserModel, UserRole,
    Transport as TransportModel,
    BillingUsageDaily, BillingPeriod, Subscription, SubscriptionStatus, Payment
)
from billing_calc import USD_SLOT_CENTS
from payments_tbc import create_payment
import os
import math


def _account_user_ids(db: Session, account_id: int):
    users = db.query(UserModel).filter(
        (UserModel.id == account_id) | (UserModel.manager_id == account_id)
    ).all()
    return [u.id for u in users]


def touch_usage_snapshot_for_user(db: Session, user_id: int):
    """
    Обновляет либо создаёт снапшот usage для аккаунта пользователя на сегодня.
    """
    # Определяем "аккаунт" (менеджер для EMPLOYEE)
    u = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not u:
        return
    account_id = u.manager_id if (
        u.role == UserRole.EMPLOYEE and u.manager_id) else u.id
    ids = _account_user_ids(db, account_id)

    active_count = (
        db.query(func.count(TransportModel.id))
        .filter(TransportModel.owner_id.in_(ids))
        .filter(TransportModel.is_active.is_(True))
        .scalar()
    ) or 0

    today = date.today()
    row = (
        db.query(BillingUsageDaily)
        .filter(BillingUsageDaily.account_id == account_id, BillingUsageDaily.day == today)
        .first()
    )
    if not row:
        row = BillingUsageDaily(
            account_id=account_id, day=today, active_transport_count=int(active_count))
        db.add(row)
    else:
        # Сохраняем максимум за день
        row.active_transport_count = max(
            row.active_transport_count or 0, int(active_count))
    db.commit()


def billing_snapshot_job():
    db = SessionLocal()
    try:
        # Снимок всем MANAGER/TRANSPORT/EMPLOYEE (идёт в учёт менеджера)
        users = db.query(UserModel).filter(UserModel.role.in_(
            [UserRole.MANAGER, UserRole.TRANSPORT, UserRole.EMPLOYEE])).all()
        seen_accounts = set()
        for u in users:
            account_id = u.manager_id if (
                u.role == UserRole.EMPLOYEE and u.manager_id) else u.id
            if account_id in seen_accounts:
                continue
            seen_accounts.add(account_id)
            ids = _account_user_ids(db, account_id)
            active_count = (
                db.query(func.count(TransportModel.id))
                .filter(TransportModel.owner_id.in_(ids))
                .filter(TransportModel.is_active.is_(True))
                .scalar()
            ) or 0
            today = date.today()
            row = (
                db.query(BillingUsageDaily)
                .filter(BillingUsageDaily.account_id == account_id, BillingUsageDaily.day == today)
                .first()
            )
            if not row:
                row = BillingUsageDaily(
                    account_id=account_id, day=today, active_transport_count=int(active_count))
                db.add(row)
            else:
                row.active_transport_count = max(
                    row.active_transport_count or 0, int(active_count))
        db.commit()
    except Exception as e:
        print("[Billing snapshot error]", e)
    finally:
        db.close()


def start_billing_scheduler():
    sch = BackgroundScheduler()
    # Снимок пикового usage раз в 15 минут (надёжнее, чем 1 раз в день)
    sch.add_job(billing_snapshot_job, 'cron', minute='*/15')
    # Ежечасно проверяем закрытие периодов (в dev так удобнее; в проде можно раз в сутки)
    sch.add_job(ensure_periods_job, 'cron', minute='5')
    sch.start()

# ====== ПОДДЕРЖКА ПЕРИОДОВ И АДДОНОВ ======


def _now_utc():
    return datetime.utcnow()


def _open_or_create_period(db: Session, sub: Subscription) -> BillingPeriod:
    period = (
        db.query(BillingPeriod)
        .filter(BillingPeriod.subscription_id == sub.id, BillingPeriod.closed_at.is_(None))
        .order_by(BillingPeriod.id.desc())
        .first()
    )
    if period:
        return period
    # создаём новый период на 30 дней «вперёд»
    start = _now_utc()
    end = start.replace(microsecond=0) + datetime.timedelta(days=30) if hasattr(
        datetime, "timedelta") else (start + __import__("datetime").timedelta(days=30))
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
    # и обновим ориентир продления
    sub.next_renewal_at = end
    db.commit()
    db.refresh(period)
    return period


def _account_user_ids(db: Session, account_id: int):
    users = db.query(UserModel).filter(
        (UserModel.id == account_id) | (UserModel.manager_id == account_id)
    ).all()
    return [u.id for u in users]


def _peak_active_transports(db: Session, account_id: int, start, end) -> int:
    q = (
        db.query(func.max(BillingUsageDaily.active_transport_count))
        .filter(BillingUsageDaily.account_id == account_id)
        .filter(BillingUsageDaily.day >= start.date())
        .filter(BillingUsageDaily.day <= end.date())
    )
    mx = q.scalar() or 0
    # подстрахуемся: если снапшотов ещё нет, берём текущее фактическое число
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


def _close_one_subscription_period(db: Session, sub: Subscription):
    period = _open_or_create_period(db, sub)
    now = _now_utc()
    if now < period.period_end:
        return  # ещё рано закрывать
    # считаем пик и платные слоты
    peak = _peak_active_transports(
        db, sub.account_id, period.period_start, period.period_end)
    chargeable = max(0, peak - 1)  # 1 бесплатный
    addons_usd = chargeable * USD_SLOT_CENTS

    period.peak_active_transports = peak
    period.chargeable_transport_slots = chargeable
    period.addons_amount_usd_cents = addons_usd
    period.closed_at = now
    db.commit()

    if addons_usd > 0:
        # создаём платёж в Payze (one-off) на сумму аддонов
        success_url = os.getenv(
            "TBC_SUCCESS_URL") or os.getenv("PAYZE_SUCCESS_URL")
        fail_url = os.getenv("TBC_FAIL_URL") or os.getenv("PAYZE_FAIL_URL")
        meta = {
            "account_id": sub.account_id,
            "reason": "transport_slots_addons",
            "subscription_id": sub.id,
            "period_id": period.id,
            "chargeable_slots": chargeable,
            "usd_cents": addons_usd,
        }
        try:
            payment_id, redirect_url = create_payment(
                amount=addons_usd / 100.0,
                currency="USD",
                description=f"Transport slots addons ({chargeable} × $7)",
                metadata=meta,
                success_url=success_url,
                fail_url=fail_url,
                preauthorize=False,
            )
            p = Payment(
                subscription_id=sub.id,
                amount_usd_cents=addons_usd,
                currency="USD",
                status="created",
                processor="payze",
                external_payment_id=payment_id,
                payload={"meta": meta, "redirect_url": redirect_url},
            )
            db.add(p)
            db.commit()
            # здесь можно триггернуть уведомление пользователю (WS/почта) с redirect_url
        except Exception as e:
            print("[Billing close period] Payze create_payment failed:", e)

    # открываем новый период
    _open_or_create_period(db, sub)
    db.commit()


def ensure_periods_job():
    db = SessionLocal()
    try:
        subs = db.query(Subscription).filter(
            Subscription.status == SubscriptionStatus.ACTIVE).all()
        for sub in subs:
            # OWNER подписок не имеет (у нас FREE), но на всякий проверим
            owner = db.query(UserModel).filter(
                UserModel.id == sub.account_id).first()
            if owner and owner.role == UserRole.OWNER:
                continue
            _close_one_subscription_period(db, sub)
    except Exception as e:
        print("[Billing ensure periods] error:", e)
    finally:
        db.close()
