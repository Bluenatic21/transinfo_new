# -*- coding: utf-8 -*-
import os
from datetime import datetime, timedelta, timezone
from urllib.parse import quote
from typing import Optional

from fastapi import APIRouter, Request, Depends, HTTPException
from pydantic import BaseModel, EmailStr, constr
from jose import jwt, JWTError

from sqlalchemy.orm import Session
from sqlalchemy import text as sql_text
from database import get_db, engine
from models import User as UserModel

router = APIRouter()

# ===== Настройки =====
JWT_SECRET = os.getenv("JWT_SECRET", "change-me")
JWT_ALG    = "HS256"

# База фронта для построения ссылки (можно переопределить телом запроса: origin)
PUBLIC_URL = (os.getenv("PUBLIC_APP_URL") or os.getenv("SITE_URL") or "https://transinfo.ge").rstrip("/")

# Путь на фронте, где форма смены пароля принимает token из query
RESET_PATH = "/auth/reset"

# TTL ссылки (минуты)
RESET_TTL  = int(os.getenv("PASSWORD_RESET_TTL_MIN", "20"))

# ===== Инициализация схемы одноразовых токенов =====
def _ensure_schema():
    ddl = """
    CREATE TABLE IF NOT EXISTS password_resets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      jti VARCHAR(64) UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP NULL
    );
    CREATE INDEX IF NOT EXISTS ix_password_resets_user ON password_resets(user_id);
    """
    with engine.begin() as conn:
        for stmt in filter(None, [s.strip() for s in ddl.split(";")]):
            conn.execute(sql_text(stmt))
    try:
        _ensure_schema()
    except Exception as e:
        # В лог напишем, но приложение не уроним
        print("[PASSWORD-RESET] Ошибка инициализации схемы password_resets:", e)

# ===== Локализации писем =====
DEFAULT_LANG = "ka"
_TEXTS = {
    # subject, line1 (инструкция), line2 (если не вы), btn, bye (с {min})
    "ka": ("პაროლის აღდგენა",
           "პაროლის აღსადგენად დააჭირეთ ღილაკს:",
           "თუ ეს თქვენ არ იყავით — დააიგნორეთ ეს წერილი.",
           "აღდგენა",
           "ბმული მოქმედებს {min} წუთი."),
    "ru": ("Восстановление пароля",
           "Чтобы восстановить пароль, перейдите по кнопке:",
           "Если это были не вы — просто проигнорируйте письмо.",
           "Сбросить пароль",
           "Ссылка действует {min} минут."),
    "en": ("Password reset",
           "To reset your password, click the button:",
           "If this wasn't you, just ignore this email.",
           "Reset",
           "Link expires in {min} minutes."),
    "tr": ("Şifre sıfırlama",
           "Şifrenizi sıfırlamak için butona tıklayın:",
           "Eğer siz değilseniz, bu e-postayı yok sayın.",
           "Sıfırla",
           "Bağlantı {min} dakika geçerlidir."),
    "az": ("Şifrənin bərpası",
           "Şifrəni bərpa etmək üçün düyməni basın:",
           "Əgər bu siz deyilsinizsə — məktubu nəzərə almayın.",
           "Sıfırla",
           "Keçid {min} dəqiqə qüvvədədir."),
    "hy": ("Գաղտնաբառի վերականգնում",
           "Գաղտնաբառը վերականգնելու համար սեղմեք կոճակին.",
           "Եթե դա դուք չէիք՝ պարզապես անտեսեք այս նամակը.",
           "Վերականգնել",
           "Հղումը վավեր է {min} րոպե:"),
}
# Совместимость: принимаем старый код 'am' как 'hy'
_ALIASES = {"am": "hy", "ge": "ka"}  # 'GE' → грузинский

def _choose_lang(req: Request, explicit: Optional[str]) -> str:
    raw = (explicit or req.headers.get("X-Lang") or req.headers.get("Accept-Language") or DEFAULT_LANG)
    code = raw.split(",")[0].split("-")[0].strip().lower()
    code = _ALIASES.get(code, code)
    return code if code in _TEXTS else DEFAULT_LANG

def _email_bodies(lang: str, url: str):
    subj, l1, l2, btn, bye = _TEXTS.get(lang, _TEXTS["en"])
    html = f"""
      <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:16px;color:#1f2937">
        <p>{l1}</p>
        <p><a href="{url}" style="background:#0ea5e9;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">{btn}</a></p>
        <p style="color:#6b7280;font-size:13px">{l2}</p>
        <p style="color:#6b7280;font-size:12px">{bye.format(min=RESET_TTL)}</p>
      </div>
    """
    plain = f"{l1}\n{url}\n\n{l2}\n{bye.format(min=RESET_TTL)}"
    return subj, html, plain

# ===== Отправка писем (поддержка разных сигнатур email_utils) =====
def _send_mail(to: str, subject: str, html: str, plain: str):
    # 1) расширенный хелпер: send_mail_html(to, subject, html, text)
    try:
        from email_utils import send_mail_html as send_mail_html  # type: ignore
        try:
            send_mail_html(to, subject, html, plain)
            return
        except TypeError:
            send_mail_html(to=to, subject=subject, html=html, text=plain)
            return
    except Exception:
        pass
    # 2) базовый: send_email(to, subject, html_body)
    try:
        from email_utils import send_email as send_email_simple
        send_email_simple(to, subject, html)
        return
    except Exception:
        # 3) консольный fallback (не падаем)
        print("[EMAIL] Fallback console:\nTO:", to, "\nSUBJ:", subject, "\n", plain)

# ===== Модели входа =====
class ForgotIn(BaseModel):
    email: EmailStr
    lang: Optional[str] = None
    origin: Optional[str] = None  # опционально: переопределить базовый фронтовый origin

class ResetIn(BaseModel):
    token: constr(min_length=10, max_length=8192)
    new_password: constr(min_length=8, max_length=128)

# ===== Генерация одноразового токена =====
def _make_token(uid: int):
    from uuid import uuid4
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=RESET_TTL)
    jti = uuid4().hex
    payload = {
        "sub": str(uid),
        "jti": jti,
        "purpose": "pwd_reset",
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp())
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG), jti, exp

# ===== Эндпоинты =====
@router.post("/password/forgot")
def password_forgot(payload: ForgotIn, req: Request, db: Session = Depends(get_db)):
    ok = {"sent": True}  # не раскрываем наличие email

    user = db.query(UserModel).filter(UserModel.email == payload.email.lower()).first()
    if not user:
        return ok

    token, jti, exp = _make_token(user.id)
    db.execute(
        sql_text("INSERT INTO password_resets (user_id, jti, expires_at) VALUES (:uid,:jti,:exp)"),
        {"uid": user.id, "jti": jti, "exp": exp.replace(tzinfo=None)}
    )
    db.commit()

    base = (payload.origin or PUBLIC_URL).rstrip("/")
    url  = f"{base}{RESET_PATH}?token={quote(token)}"
    lang = _choose_lang(req, payload.lang)
    subj, html, plain = _email_bodies(lang, url)
    _send_mail(user.email, subj, html, plain)
    print(f"[PASSWORD-RESET] email={user.email} lang={lang} jti={jti} exp={exp.isoformat()} url={url}")
    return ok

@router.post("/password/reset")
def password_reset(payload: ResetIn, db: Session = Depends(get_db)):
    try:
        data = jwt.decode(payload.token, JWT_SECRET, algorithms=[JWT_ALG])
        if data.get("purpose") != "pwd_reset":
            raise JWTError("wrong-purpose")
        jti = data["jti"]
    except JWTError:
        raise HTTPException(status_code=400, detail="error.auth.resetTokenInvalid")

    row = db.execute(
        sql_text("SELECT user_id, expires_at, used_at FROM password_resets WHERE jti=:jti"),
        {"jti": jti}
    ).fetchone()

    if not row or row.used_at is not None or row.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="error.auth.resetTokenExpired")

    # Хеширование пароля (используем ваш хешер из auth)
    try:
        from auth import get_password_hash as _hash_pwd
    except Exception:
        from auth import hash_password as _hash_pwd

    pwd_hash = _hash_pwd(payload.new_password)

    # В вашей модели колонка называется 'hashed_password'
    db.execute(sql_text("UPDATE users SET hashed_password=:ph WHERE id=:uid"),
               {"ph": pwd_hash, "uid": row.user_id})
    db.execute(sql_text("UPDATE password_resets SET used_at=now() WHERE jti=:jti"), {"jti": jti})
    db.commit()
    return {"ok": True}
