
import os
import json
import requests

PAYZE_API_BASE = os.getenv("PAYZE_API_BASE", "https://payze.io/v2/api").strip()


class PayzeAuthError(RuntimeError):
    """401/невалидные ключи Payze."""
    pass


class PayzeHTTPError(RuntimeError):
    """Любая другая HTTP-ошибка Payze (>=400)."""

    def __init__(self, status, body):
        self.status = status
        self.body = body
        super().__init__(f"Payze HTTP {status}: {body[:300]}")


def _auth_header():
    # тримминг — частая причина 401 (лишние пробелы, переносы)
    key = (os.getenv("PAYZE_API_KEY") or "").strip()
    sec = (os.getenv("PAYZE_API_SECRET") or "").strip()
    if not key or not sec:
        # ранний и понятный фейл вместо 401 от Payze
        raise PayzeAuthError(
            "PAYZE_API_KEY / PAYZE_API_SECRET are empty or not loaded")
    return {
        "Authorization": f"{key}:{sec}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "transinfo-backend/1.0",
    }


def _mask(v: str) -> str:
    if not v:
        return "—"
    v = v.strip()
    return (v[:4] + "…" + v[-4:]) if len(v) > 8 else "set"


def payze_auth_debug_info():
    """Вернём, что именно подхватилось из окружения (без утечки секретов)."""
    key = (os.getenv("PAYZE_API_KEY") or "").strip()
    sec = (os.getenv("PAYZE_API_SECRET") or "").strip()
    return {
        "base": PAYZE_API_BASE,
        "key_mask": _mask(key),
        "sec_mask": _mask(sec),
        "key_len": len(key),
        "sec_len": len(sec),
    }


def create_payment(amount, currency="USD", description="Subscription", metadata=None,
                   success_url=None, fail_url=None, preauthorize=False):
    """
    Создаёт платёж в Payze и возвращает (payment_id, redirect_url).
    Документация: PUT https://payze.io/v2/api/payment (Create payment). :contentReference[oaicite:2]{index=2}
    """
    # Централизация редиректов: если не передали явно — берём из ENV
    success_url = success_url or os.getenv("PAYZE_SUCCESS_URL")
    fail_url = fail_url or os.getenv("PAYZE_FAIL_URL")

    body = {
        # типичные поля Payze (названия могут эволюционировать — оставляем tolerant parsing)
        "Amount": float(amount),
        "Currency": currency,
        "Preauthorize": bool(preauthorize),
        "Metadata": metadata or {},
        # поля редиректов встречаются в публичных примерах (SUCCESS_URL/FAIL_URL). :contentReference[oaicite:3]{index=3}
        "SuccessUrl": success_url,
        "FailUrl": fail_url,
        # на всякий — возможные альтернативные ключи:
        "SUCCESS_URL": success_url,
        "FAIL_URL": fail_url,
        "Description": description,
    }
    headers = _auth_header()
    url = f"{PAYZE_API_BASE}/payment"
    resp = requests.put(url, headers=headers, json=body, timeout=20)
    if resp.status_code == 401:
        raise PayzeAuthError(
            f"Unauthorized. Check PAYZE_API_KEY / PAYZE_API_SECRET. Body: {resp.text[:300]}")
    if resp.status_code >= 400:
        raise PayzeHTTPError(resp.status_code, resp.text or "")
    try:
        data = resp.json()
    except Exception:
        raise PayzeHTTPError(resp.status_code or 500,
                             f"Non-JSON response: {resp.text[:300]}")
    # Пробуем вытащить ID и ссылку на хостед-чекаут
    payment_id = (
        data.get("PaymentId")
        or data.get("data", {}).get("PaymentId")
        or data.get("id")
    )
    # в разных примерах встречаются разные поля; пытаемся аккуратно найти
    redirect_url = (
        data.get("RedirectUrl")
        or data.get("PayUrl")
        or data.get("PaymentUrl")
        or data.get("url")
        or data.get("data", {}).get("RedirectUrl")
        or data.get("data", {}).get("PayUrl")
        or data.get("data", {}).get("PaymentUrl")
    )
    if not redirect_url:
        raise PayzeHTTPError(
            resp.status_code or 500, f"No redirect url in response: {json.dumps(data)[:500]}")
    return payment_id, redirect_url


def payze_ping_auth():
    """
    Пробная проверка авторизации Payze без создания платежа.
    200 -> ок; 401 -> неверные/неподхваченные ключи.
    """
    # ping для проверки токенов (bankaccount не нужен)
    url = f"{PAYZE_API_BASE}/payment/query/token-based"
    headers = _auth_header()
    resp = requests.get(url, headers=headers, timeout=15)
    if resp.status_code == 401:
        raise PayzeAuthError(f"Unauthorized. Body: {resp.text[:300]}")
    if resp.status_code >= 400:
        raise PayzeHTTPError(resp.status_code, resp.text or "")
    return {"ok": True, "status": resp.status_code}
