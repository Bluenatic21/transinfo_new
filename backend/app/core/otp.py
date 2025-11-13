import random
import datetime as dt
from itsdangerous import Signer
from os import getenv

SECRET = getenv("OTP_HASH_SECRET", "change_me")
signer = Signer(SECRET)


def gen_code() -> str:
    return f"{random.randint(100000, 999999)}"


def hash_code(code: str) -> str:
    # HMAC-сигнатура + сам код -> простая валидация без хранения в чистом виде
    return signer.sign(code.encode()).decode()


def verify_code(code: str, signed: str) -> bool:
    try:
        raw = signer.unsign(signed.encode()).decode()
        return raw == code
    except Exception:
        return False


def expires_at(minutes: int) -> dt.datetime:
    return dt.datetime.utcnow() + dt.timedelta(minutes=minutes)
