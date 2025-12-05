import logging
import re
from os import getenv
from typing import Tuple, Dict, Optional

import httpx

# === ENV ===
BASE: str = (getenv("CITYNET_SMS_BASE_URL", "") or "").strip()
USER: str = (getenv("CITYNET_SMS_USERNAME", "") or "").strip()
PASS: str = (getenv("CITYNET_SMS_PASSWORD", "") or "").strip()
DRY: bool = (getenv("CITYNET_SMS_DRY_RUN", "false")
             or "false").lower() in {"1", "true", "yes", "y"}
SENDER: Optional[str] = (getenv("CITYNET_SMS_SENDER", "")
                         or "").strip() or None  # опционально (альфа-имя)
TIMEOUT_SEC: float = float(getenv("CITYNET_SMS_TIMEOUT_SEC", "15"))
# число повторов поверх первого запроса (итого = RETRIES+1)
RETRIES: int = int(getenv("CITYNET_SMS_RETRIES", "2"))

# === Helpers ===
def _normalize_phone(phone: str) -> str:
    """
    E.164 без '+': для Грузии => 995XXXXXXXXX.
    Нормализуем варианты:
      '+995 574 116 554' -> '995574116554'
      '574116554'        -> '995574116554' (локальный мобильный)
      '00995574116554'   -> '995574116554'
      '0XXXXXXXXX'       -> '995XXXXXXXXX'
    """
    digits = re.sub(r"\D", "", phone or "")
    if not digits:
        return digits
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("995"):
        return digits
    if len(digits) == 10 and digits.startswith("0"):
        return "995" + digits[1:]
    if len(digits) == 9 and digits.startswith("5"):
        return "995" + digits
    return digits


def _needs_unicode(text: str) -> bool:
    return any(ord(ch) > 127 for ch in (text or ""))


def build_url_for_debug(num: str, text: str, use_unicode: bool = True) -> str:
    """Строит URL запроса (пароль скрыт) — удобно для логов/диагностики."""
    from urllib.parse import urlencode
    params = {
        "username": USER,
        "password": "***",
        "num": num,     # чаще всего ожидается 'num'
        "to": num,      # дублируем альтернативное имя
        "phone": num,   # и ещё одно на всякий случай
        "msg": text,
    }
    if use_unicode or _needs_unicode(text):
        params["utf"] = "1"
    if SENDER:
        # добавляем сразу оба ключа — провайдер проигнорирует лишний
        params["sender"] = SENDER
        params["from"] = SENDER
    return f"{BASE}?{urlencode(params)}"


async def _request(params: Dict[str, str]) -> Tuple[bool, str]:
    """
    Исполняет GET к провайдеру с ретраями.
    Успех — когда первые 4 символа тела ответа == '0000'
    (формат '0000-api_XXXXXXXX.XXXXXXXX').
    """
    last_raw = ""
    async with httpx.AsyncClient(timeout=TIMEOUT_SEC, follow_redirects=False) as c:
        for attempt in range(RETRIES + 1):
            try:
                r = await c.get(BASE, params=params)
                status = r.status_code
                location = r.headers.get("Location", "")
                raw = (r.text or "").strip()
                last_raw = f"status={status} location={location} body={raw[:200]}"
                ok = (raw[:4] == "0000")
                if ok:
                    return True, raw
                logging.warning(
                    "CityNet SMS not OK (attempt %d/%d): %s",
                    attempt + 1, RETRIES + 1, last_raw
                )
            except Exception as e:
                last_raw = f"exception: {e}"
                logging.warning(
                    "CityNet SMS exception (attempt %d/%d): %s", attempt + 1, RETRIES + 1, e)
    return False, last_raw


# === Public API ===
async def send_sms(phone: str, text: str, use_unicode: bool = True) -> Tuple[bool, str]:
    """
    Возвращает (ok, provider_raw).
    DRY_RUN: провайдера не вызываем, сразу True.
    """
    num = _normalize_phone(phone)

    if DRY:
        fake = "0000-api_DRYRUNID.000000"
        logging.info("[SMS DRY-RUN] num=%s text=%s -> %s", num, text, fake)
        return True, fake

    if not (BASE and USER and PASS):
        err = "CITYNET env not set"
        logging.error(err + " (BASE/USER/PASS)")
        return False, err

    params = {
        "username": USER,
        "password": PASS,
        "num": num,
        "msg": text,
    }
    if use_unicode or _needs_unicode(text):
        params["utf"] = "1"
    if SENDER:
        # Некоторые версии API принимают 'sender', некоторые — 'from'
        params["sender"] = SENDER
        params["from"] = SENDER

    ok, raw = await _request(params)
    # Полезный лог (без пароля)
    logging.info(
        "CityNet SMS send -> ok=%s raw=%s url=%s",
        ok, raw, build_url_for_debug(num, text, use_unicode)
    )
    return ok, raw


async def ping() -> Tuple[bool, str]:
    """
    Мини-проверка доступности точки (туннель/домен).
    Не гарантирует авторизацию, но покажет сетевую доступность и HTTP-статус.
    """
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SEC) as c:
            r = await c.get(BASE, params={"ping": "1"})
        return True, f"status={r.status_code}, len={len(r.text)}"
    except Exception as e:
        return False, f"exception: {e}"


# CLI для быстрой ручной проверки:
#   CITYNET_* в env, затем:
#   python -m backend.sms_citynet PHONE "Текст"
if __name__ == "__main__":
    import asyncio as _asyncio
    import sys as _sys

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    if len(_sys.argv) < 3:
        print("Usage: python -m backend.sms_citynet <phone> <text>")
        _sys.exit(1)

    p = _sys.argv[1]
    t = " ".join(_sys.argv[2:])
    print("BASE:", BASE)
    print("URL:", build_url_for_debug(_normalize_phone(p), t))

    ok_, raw_ = _asyncio.run(send_sms(p, t, use_unicode=True))
    print("OK:", ok_, "RAW:", raw_)
