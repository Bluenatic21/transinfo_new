# utils/ratings.py
from datetime import datetime, timedelta


def calc_verification_score(user):
    score = 0.0
    if getattr(user, "email_verified", False):
        score += 0.5
    if getattr(user, "phone_verified", False):
        score += 1.0
    # Для поддержки и docs_verified, и identity_verified (у тебя в models — docs_verified)
    if getattr(user, "docs_verified", False) or getattr(user, "identity_verified", False):
        score += 1.5
    return score  # макс 3.0


def calc_user_rating_score(ratings, n_last=10):
    """
    ratings: список объектов Rating или словарей c полями punctuality, communication, professionalism, reliability
    """
    if not ratings:
        return 0.0
    last_ratings = ratings[-n_last:]  # последние N
    averages = [
        (getattr(r, "punctuality", 0) + getattr(r, "communication", 0) +
         getattr(r, "professionalism", 0) + getattr(r, "reliability", 0)) / 4
        for r in last_ratings
    ]
    avg_score = sum(averages) / len(averages)  # средний по сделкам (1-5)
    return avg_score / 5 * 7  # в диапазон 0–7


def calc_activity_score(user, deals, now=None):
    now = now or datetime.utcnow()
    last_active = getattr(user, "last_active_at", now) or now
    # deals: список объектов со статусом completed и полем completed_at
    deals_30 = [d for d in deals if d.completed_at and (
        now - d.completed_at).days <= 30]
    deals_60 = [d for d in deals if d.completed_at and (
        now - d.completed_at).days <= 60]
    inactive_days = (now - last_active).days if last_active else 999

    if len(deals_30) >= 3:
        return 1.0
    if len(deals_60) == 0:
        return -0.5
    if inactive_days > 90:
        return -1.0
    return 0.0


def calc_final_rating(user, ratings, deals, now=None):
    verification_score = calc_verification_score(user)
    user_rating_score = calc_user_rating_score(ratings)
    activity_score = calc_activity_score(user, deals, now)
    total = verification_score + user_rating_score + activity_score
    final = max(0, min(10, total))
    return round(final, 2)
