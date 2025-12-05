# password_reset.py
import os, time, secrets
from typing import Optional, Dict
from fastapi import APIRouter, Request
from pydantic import BaseModel, EmailStr, constr
import jwt
from jwt import InvalidTokenError, ExpiredSignatureError

from email_utils import send_email  # ваш SMTP-хелпер

JWT_SECRET = os.getenv("JWT_SECRET", "change-me")
SITE_URL = os.getenv("SITE_URL", "https://transinfo.ge").rstrip("/")
RESET_PATH = os.getenv("PASSWORD_RESET_URL_PATH", "/auth/reset")
RESET_TTL_MIN = int(os.getenv("PASSWORD_RESET_EXPIRES_MIN", "30"))
RESET_COOLDOWN_SEC = int(os.getenv("PASSWORD_RESET_COOLDOWN_SEC", "60"))

_last_request_at: Dict[str, int] = {}

TEXTS = {
    "ru": {"subject": "Восстановление пароля на Transinfo", "hello": "Здравствуйте!",
           "body": "Вы запросили ссылку для сброса пароля. Если это были не вы — просто игнорируйте письмо.",
           "btn": "Сбросить пароль", "alt": "Если кнопка не нажимается, скопируйте ссылку в браузер:",
           "bye": "Ссылка действительна {min} минут."},
    "ka": {"subject": "პაროლის აღდგენა Transinfo-ზე", "hello": "გამარჯობა!",
           "body": "თქვენ მოითხოვეთ პაროლის აღდგენის ბმული. თუ ეს თქვენ არ იყავით — გამოტოვეთ ეს წერილი.",
           "btn": "პაროლის აღდგენა", "alt": "თუ ღილაკი არ მუშაობს, დააკოპირეთ ეს ბმული ბრაუზერში:",
           "bye": "ბმული მოქმედია {min} წუთი."},
    "en": {"subject": "Reset your Transinfo password", "hello": "Hello!",
           "body": "You requested a password reset link. If it wasn’t you, just ignore this email.",
           "btn": "Reset password", "alt": "If the button doesn’t work, copy this link into your browser:",
           "bye": "The link is valid for {min} minutes."},
    "tr": {"subject": "Transinfo şifre sıfırlama", "hello": "Merhaba!",
           "body": "Şifre sıfırlama bağlantısı istediniz. Bu isteği siz yapmadıysanız, bu e‑postayı yok sayın.",
           "btn": "Şifreyi sıfırla", "alt": "Buton çalışmıyorsa, bağlantıyı tarayıcıya yapıştırın:",
           "bye": "Bağlantı {min} dakika geçerlidir."},
    "az": {"subject": "Transinfo parolun bərpası", "hello": "Salam!",
           "body": "Parolu bərpa etmək üçün keçид istədiniz. Siz deyilsinizsə, məktubu ignor edin.",
           "btn": "Parolu bərпа et", "alt": "Düymə işləmirsə, linki brauzerə köçürün:",
           "bye": "Keçid {min} dəqiqə keçərlidir."},
    "hy": {"subject": "Գաղտնաբառի վերականգնում Transinfo-ում", "hello": "Բարև!",
           "body": "Դուք խնդրել եք գաղտնաբառի վերականգնման հղում։ Եթե դա դուք չեք՝ անտեսեք նամակը։",
           "btn": "Վերականգնել գաղտնաբառը", "alt": "Եթե կոճակը չի աշխատում՝ պատճենեք հղումը բրաուզերում.",
           "bye": "Հղումը գործում է {min} րոպե։"},
}
ALIAS = {"am": "hy"}
DEFAULT_LANG = "ka"

def _now() -> int:
    return int(time.time())

def _pick_lang(req: Request, explicit: Optional[str]) -> str:
    if explicit:
        code = ALIAS.get(explicit, explicit)
        if code in TEXTS:
            return code
    # Приоритет заголовку X-Lang
    hdr = (req.headers.get("x-lang") or req.headers.get("accept-language") or "").strip()
    if hdr:
        code = hdr.split(",")[0].split("-")[0].lower()
        code = ALIAS.get(code, code)
        if code in TEXTS:
            return code
    return DEFAULT_LANG

def _make_token(uid: int, email: str) -> str:
    payload = {
        "typ": "pwd_reset",
        "sub": str(uid),
        "email": email,
        "jti": secrets.token_urlsafe(10),
        "iat": _now(),
        "exp": _now() + RESET_TTL_MIN * 60,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def _html(lang: str, link: str):
    t = TEXTS[lang]
    subject = t["subject"]
    html = f"""
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a2436">
      <p>{t['hello']}</p>
      <p>{t['body']}</p>
      <p style="margin:24px 0">
        <a href="{link}" style="background:#0ea5e9;color:#fff;text-decoration:none;
           padding:10px 16px;border-radius:8px;display:inline-block">{t['btn']}</a>
      </p>
      <p>{t['alt']}<br><a href="{link}">{link}</a></p>
      <p style="color:#59708f">{t['bye'].format(min=RESET_TTL_MIN)}</p>
    </div>"""
    text = f"""{t['hello']}

{t['body']}

{t['btn']}: {link}

{t['alt']}
{link}

{t['bye'].format(min=RESET_TTL_MIN)}"""
    return subject, html, text

class ForgotIn(BaseModel):
    email: EmailStr
    lang: Optional[str] = None

class ResetIn(BaseModel):
    token: constr(min_length=10, max_length=8192)
    new_password: constr(min_length=8, max_length=128)

router = APIRouter(prefix="/password", tags=["password"])

@router.post("/forgot")
async def forgot(req: Request, body: ForgotIn):
    # антиспам по email+IP
    key = f"{body.email.lower()}|{req.client.host}"
    if _now() - _last_request_at.get(key, 0) < RESET_COOLDOWN_SEC:
        return {"ok": True}
    _last_request_at[key] = _now()

    # ищем пользователя (подставьте ваш доступ к БД)
    user_id = None
    try:
        from db import db
        row = db.execute("SELECT id FROM users WHERE lower(email)=lower(:e) LIMIT 1", {"e": body.email}).fetchone()
        if row: user_id = int(row[0])
    except Exception:  # если другой доступ к БД — просто проглотаем
        pass

    if user_id:
        token = _make_token(user_id, body.email)
        link = f"{SITE_URL}{RESET_PATH}?token={token}"
        lang = _pick_lang(req, body.lang)
        subject, html, text = _html(lang, link)
        try:
            send_email(to=body.email, subject=subject, text=text, html=html)
            print(f"[EMAIL][reset] sent to {body.email}")
        except Exception as e:
            print(f"[EMAIL][reset] send failed: {e}")

    # всегда true — не раскрываем наличие почты
    return {"ok": True}

@router.post("/reset")
async def reset(body: ResetIn):
    try:
        payload = jwt.decode(body.token, JWT_SECRET, algorithms=["HS256"])
        if payload.get("typ") != "pwd_reset":
            return {"ok": False, "error": "invalid_token"}
        uid = int(payload["sub"])
    except ExpiredSignatureError:
        return {"ok": False, "error": "expired"}
    except InvalidTokenError:
        return {"ok": False, "error": "invalid_token"}

    # одноразовость (если БД есть): сохраняем jti
    try:
        jti = payload.get("jti")
        from db import db
        db.execute("CREATE TABLE IF NOT EXISTS used_reset_jti (jti text primary key, used_at timestamptz default now())")
        ins = db.execute("INSERT INTO used_reset_jti (jti) VALUES (:jti) ON CONFLICT DO NOTHING", {"jti": jti})
        if ins.rowcount == 0:
            return {"ok": False, "error": "already_used"}
    except Exception:
        pass

    # хеш пароля: используйте вашу функцию/алгоритм; fallback — bcrypt
    try:
        from auth import hash_password as _hash  # если у вас есть
    except Exception:
        from passlib.hash import bcrypt
        _hash = lambda p: bcrypt.hash(p)

    pwd_hash = _hash(body.new_password)

    # обновляем пароль (подставьте имя столбца)
    try:
        from db import db
        n = db.execute("UPDATE users SET password_hash=:h, updated_at=now() WHERE id=:uid",
                       {"h": pwd_hash, "uid": uid}).rowcount
        return {"ok": True} if n == 1 else {"ok": False, "error": "not_found"}
    except Exception as e:
        print(f"[RESET] DB error: {e}")
        return {"ok": False, "error": "db_error"}
