import os
import secrets
import hashlib
import hmac
from datetime import datetime, timedelta, timezone

EXPIRES_MIN = int(os.getenv("EMAIL_VERIFICATION_EXPIRES_MIN", "10"))
COOLDOWN_SEC = int(os.getenv("EMAIL_VERIFICATION_COOLDOWN_SEC", "60"))
MAX_ATTEMPTS = int(os.getenv("EMAIL_VERIFICATION_MAX_ATTEMPTS", "5"))
PEPPER = os.getenv("VERIFICATION_PEPPER", "CHANGE_ME")


def now():
    return datetime.now(timezone.utc)


def gen_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_code(code: str) -> str:
    return hmac.new(PEPPER.encode(), code.encode(), hashlib.sha256).hexdigest()


def expired(dt: datetime) -> bool:
    return dt < now()
