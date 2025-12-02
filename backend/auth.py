from __future__ import annotations
from typing import Optional
from sqlalchemy import func
from models import UserRole
from schemas import ForgotPasswordRequest, ChangePasswordRequest
try:
    from email_utils import send_email, _ensure_env_loaded
except Exception:
    from email_utils import send_email
    # Фолбэк: простая загрузка .env из текущей/родительской папки

    def _ensure_env_loaded():  # type: ignore
        import pathlib
        env_paths = [
            pathlib.Path(__file__).resolve().parent / ".env",
            pathlib.Path(__file__).resolve().parent.parent / ".env",
        ]
        for p in env_paths:
            if p.exists():
                try:
                    for line in p.read_text().splitlines():
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        os.environ.setdefault(k, v)
                except Exception:
                    pass
from models import EmailVerification
from verification_service import (
    now, gen_code, hash_code, expired,
    EXPIRES_MIN, COOLDOWN_SEC, MAX_ATTEMPTS
)
from schemas import EmailVerifyRequest, EmailResendRequest
from sqlalchemy import or_
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from schemas import UserRegister, UserProfile, EmployeeRegister, UserUpdate
from models import User
from services.presence_tracker import record_user_activity
from database import SessionLocal, get_db
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from passlib.hash import pbkdf2_sha256
import bcrypt
from fastapi import APIRouter, HTTPException, Depends, status, Cookie, Request, Header, WebSocket, Body, Query, Response
import os
from pydantic import BaseModel, EmailStr
import uuid

from app.services.sms_citynet import send_sms
from models import PhoneVerification
# схемы
from app.schemas.phone_verify import SendPhoneCodeIn, VerifyPhoneCodeIn
import secrets

from datetime import timedelta, datetime, timezone
import re

TERMS_VERSION = "2025-09-17-ru-v1"

SECRET_KEY = os.getenv("SECRET_KEY", "Fatsanta1211")
ALGORITHM = "HS256"
# Лучше согласовать с max-age куки (30 минут по твоему коду логина)

_ensure_env_loaded()  # подхватить /opt/transinfo/backend/.env
PHONE_CODE_CHANNELS = {"sms", "whatsapp", "viber"}


# === Feature flag: полностью выключить email‑верификацию (не отправлять коды) ===
# Поддерживаем оба имени переменной: EMAIL_VERIFICATION_ENABLED и (на всякий случай) SEND_EMAIL_VERIFICATION.
EMAIL_VERIFICATION_ENABLED = (
    os.getenv("EMAIL_VERIFICATION_ENABLED",
              os.getenv("SEND_EMAIL_VERIFICATION", "1"))
    .strip().lower() in ("1", "true", "yes", "on")
)

# === Feature flag: требовать ли подтверждение e-mail при входе ===
# 0/false/off — вход не блокируется, но верификация при регистрации продолжает работать.
# 1/true/on  — вход заблокирован до подтверждения.
REQUIRE_EMAIL_VERIFIED_FOR_LOGIN = (
    os.getenv("REQUIRE_EMAIL_VERIFIED_FOR_LOGIN", "0")
    .strip().lower() in ("1", "true", "yes", "on")
)

ACCESS_TOKEN_EXPIRE_MINUTES = 30
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 90

# bcrypt учитывает только первые 72 байта пароля.
# 1) отключаем жёсткую ошибку truncate_error
# 2) добавим безопасное усечения по байтам для verify/hash
# Контекст можно оставить (не мешает), но проверять/хешировать будем напрямую через bcrypt
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12,
    bcrypt__truncate_error=False,
    bcrypt__ident="2b",
)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

router = APIRouter()


def _sms_text(lang: str, code: str) -> str:
    lang = (lang or "ru").lower()
    if lang == "ka":
        return f"[Transinfo] თქვენი კოდი: {code}"
    if lang == "en":
        return f"[Transinfo] Your code: {code}"
    return f"[Transinfo] Ваш код: {code}"
async def _send_phone_code(channel: str, phone: str, code: str) -> tuple[bool, str]:
    """Отправка кода выбранным каналом.

    Для WhatsApp и Viber временно используем SMS-гейт, чтобы UX был единым;
    как только появится интеграция мессенджеров, её можно подключить здесь.
    """

    channel = (channel or "sms").lower()
    if channel != "sms" and channel in PHONE_CODE_CHANNELS:
        return await send_sms(phone, code, use_unicode=False)

    # ВАЖНО: для OTP-URL msg должен быть ТОЛЬКО цифры; unicode не нужен
    return await send_sms(phone, code, use_unicode=False)



def _send_verification_code(db: Session, user: User):
    """Создать/обновить код подтверждения и отправить письмо."""
    # анти-спам: проверим cooldown по последней отправке (всегда UTC-aware)
    ev = db.query(EmailVerification).filter(
        EmailVerification.user_id == user.id).first()
    now_ = _to_utc(now())
    if ev and (now_ - _to_utc(ev.sent_at)).total_seconds() < COOLDOWN_SEC:
        # слишком часто — просто молчим (или бросаем 429)
        return
    code = gen_code()
    code_h = hash_code(code)
    expires = now_ + timedelta(minutes=EXPIRES_MIN)
    if ev:
        ev.code_hash = code_h
        ev.expires_at = expires
        ev.sent_at = now_
        ev.attempts = 0
    else:
        ev = EmailVerification(
            user_id=user.id,
            code_hash=code_h,
            expires_at=expires,
            sent_at=now_,
            attempts=0,
        )
        db.add(ev)
    db.commit()
    # Письмо
    subject = "Код подтверждения e-mail"
    html_body = f"<p>Ваш код подтверждения: <b>{code}</b>.</p><p>Действителен {EXPIRES_MIN} мин.</p>"
    try:
        send_email(user.email, subject, html_body)
    except Exception as e:
        # На всякий случай, если где-то ещё бросается ошибка — не ломаем /register
        print(f"[EMAIL][warning] send failed (ignored): {e}")


def create_password_reset_token(email: str):
    expire = datetime.utcnow() + timedelta(minutes=PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": email,
        "exp": expire,
        "purpose": "password_reset"
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


@router.post("/forgot-password")
def forgot_password(request: ForgotPasswordRequest, db: Session = Depends(get_db)):
    email_norm = (request.email or "").strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email_norm).first()
    if not user:
        return {"ok": True}
    token = create_password_reset_token(user.email)
    # Централизуем построение ссылки на фронт:
    # 1) APP_BASE_URL (из .env), 2) FRONTEND_ORIGIN (из .env), 3) дефолт https://transinfo.ge
    front_base = os.getenv("APP_BASE_URL") or os.getenv(
        "FRONTEND_ORIGIN", "https://transinfo.ge")
    reset_url = f"{front_base.rstrip('/')}/reset-password?token={token}"
    subject = "Восстановление пароля на TransInfo"
    html_body = f"""
    <p>Вы запросили восстановление пароля.</p>
    <p>Перейдите по <a href="{reset_url}">ссылке для сброса пароля</a>.<br>
    Если вы не запрашивали восстановление — просто проигнорируйте это письмо.</p>
    """
    send_email(user.email, subject, html_body)
    return {"ok": True}


@router.get("/users/search")
def search_users(query: str, db: Session = Depends(get_db)):
    q = query.strip()
    users_query = db.query(User)

    # Поиск по id, email, organization, contact_person, phone
    filters = [
        User.email.ilike(f"%{q}%"),
        User.organization.ilike(f"%{q}%"),
        User.contact_person.ilike(f"%{q}%"),
        User.phone.ilike(f"%{q}%")
    ]
    if q.isdigit():
        filters.append(User.id == int(q))

    users = users_query.filter(or_(*filters)).limit(15).all()

    # Формируем список для фронта (можно расширить!)
    result = []
    for u in users:
        result.append({
            "id": u.id,
            "email": u.email,
            "organization": u.organization,
            "name": u.contact_person,
            "avatar": u.avatar,
            "role": u.role.value if hasattr(u.role, "value") else u.role,
            "phone": u.phone
        })
    return result


def _to_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


# --- Email deliverability checks (без отправки писем) ---
def _domain_from_email(email: str) -> str:
    try:
        return (email or "").split("@", 1)[1].strip().lower()
    except Exception:
        return ""


def _is_disposable_domain(domain: str) -> bool:
    disposable = {
        "mailinator.com", "10minutemail.com", "guerrillamail.com", "tempmail.com",
        "temp-mail.org", "yopmail.com", "getnada.com", "trashmail.com", "sharklasers.com",
        "moakt.com", "maildrop.cc", "dispostable.com", "tempmailaddress.com", "throwawaymail.com"
    }
    return domain in disposable


def _domain_has_mx_or_a(domain: str) -> bool:
    # Сначала пробуем MX через dnspython (если установлен)
    try:
        import dns.resolver  # type: ignore
        try:
            answers = dns.resolver.resolve(domain, "MX", lifetime=1.5)
            if answers and len(list(answers)) > 0:
                return True
        except Exception:
            pass
    except Exception:
        # dnspython не установлен — идём дальше
        pass
    # Фолбэк: любой A/AAAA-запись домена
    try:
        import socket
        # getaddrinfo резолвит A/AAAA, если домен существует
        socket.getaddrinfo(domain, None)
        return True
    except Exception:
        return False


def _email_domain_looks_deliverable(email: str) -> tuple[bool, str | None]:
    d = _domain_from_email(email)
    if not d:
        return False, "empty_domain"
    if _is_disposable_domain(d):
        return False, "disposable"
    if not _domain_has_mx_or_a(d):
        return False, "no_mx"
    return True, None


def _normalize_phone_e164_digits(raw: str) -> str:
    """
    Приводим номер к цифрам в формате E.164 без '+':
      '+995 574 116 554' -> '995574116554'
      '574116554'        -> '995574116554' (локальный мобильный)
      '00995574116554'   -> '995574116554'
    Никакие пробелы/скобки/дефисы не допускаются.
    """
    s = re.sub(r"\D", "", raw or "")
    if not s:
        return s
    if s.startswith("00"):      # 00 -> международный префикс
        s = s[2:]
    if s.startswith("995"):
        return s
    # Грузинские мобильные начинаются на 5 и имеют 9 цифр
    if len(s) == 9 and s.startswith("5"):
        return "995" + s
    return s


@router.post("/phone/send-code")
async def phone_send_code(payload: SendPhoneCodeIn, db: Session = Depends(get_db)):
    # нормализуем номер до цифр E.164 без '+'
    phone = _normalize_phone_e164_digits(payload.phone.strip())
    if not phone:
        raise HTTPException(status_code=422, detail="phone_required")
    channel = (payload.channel or "sms").lower()
    if channel not in PHONE_CODE_CHANNELS:
        raise HTTPException(status_code=422, detail="channel_not_supported")


    EXPIRES_MIN = int(os.getenv("PHONE_VERIFY_EXPIRES_MIN", "10"))
    COOLDOWN_SEC = int(os.getenv("PHONE_VERIFY_COOLDOWN_SEC", "60"))

    # Всегда работаем в UTC-aware
    now_ = _to_utc(now())
    pv = db.query(PhoneVerification).filter(
        PhoneVerification.phone == phone).first()
    # cooldown считаем в UTC-aware, т.к. pv.sent_at мог быть сохранён как naive
    if pv and (now_ - _to_utc(pv.sent_at)).total_seconds() < COOLDOWN_SEC:
        raise HTTPException(status_code=429, detail="cooldown")

    code = gen_code()                      # генерим цифры (4–8)
    ok, raw = await _send_phone_code(channel, phone, code)
    if not ok:
        raise HTTPException(status_code=502, detail=f"{channel}_failed:{raw}")

    if not pv:
        pv = PhoneVerification(
            phone=phone,
            code_hash=hash_code(code),
            expires_at=now_ + timedelta(minutes=EXPIRES_MIN),
            sent_at=now_,
            attempts=0,
            verified_at=None,
        )
        db.add(pv)
    else:
        pv.code_hash = hash_code(code)
        pv.expires_at = now_ + timedelta(minutes=EXPIRES_MIN)
        pv.sent_at = now_
        pv.attempts = 0
        pv.verified_at = None
    db.commit()
    return {"sent": True, "channel": channel}


@router.post("/phone/verify")
async def phone_verify(payload: VerifyPhoneCodeIn, db: Session = Depends(get_db)):
    # Нормализуем так же, как при отправке кода
    phone = _normalize_phone_e164_digits((payload.phone or "").strip())
    code = (payload.code or "").strip()
    pv = db.query(PhoneVerification).filter(
        PhoneVerification.phone == phone).first()
    if not pv:
        raise HTTPException(status_code=400, detail="code_not_requested")
    # TTL проверяем в UTC-aware (на случай старых записей с naive датами)
    if expired(_to_utc(pv.expires_at)):
        raise HTTPException(status_code=400, detail="code_expired")
    MAX_ATTEMPTS = int(os.getenv("PHONE_VERIFY_MAX_ATTEMPTS", "10"))
    if pv.attempts >= MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="too_many_attempts")
    pv.attempts += 1
    if pv.code_hash != hash_code(code):
        db.commit()
        raise HTTPException(status_code=400, detail="code_invalid")
    # Фиксируем момент верификации в UTC-aware
    pv.verified_at = _to_utc(now())
    db.commit()
    return {"verified": True}


@router.get("/users/{user_id}", response_model=UserProfile)
def get_user_profile(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _truncate72_bytes(s: str) -> bytes:
    """bcrypt учитывает только первые 72 БАЙТА. Возвращаем bytes[:72]."""
    b = (s or "").encode("utf-8")
    return b[:72] if len(b) > 72 else b


def _truncate72_bytes(s: str) -> bytes:
    b = (s or "").encode("utf-8")
    return b[:72] if len(b) > 72 else b


def verify_password(plain_password, hashed_password):
    # Поддерживаем старые хэши ($pbkdf2-sha256$), затем bcrypt
    if isinstance(hashed_password, str) and hashed_password.startswith("$pbkdf2-sha256$"):
        try:
            return pbkdf2_sha256.verify(plain_password, hashed_password)
        except Exception:
            return False
    hp = hashed_password if isinstance(hashed_password, (bytes, bytearray)) else (
        hashed_password or "").encode("utf-8")
    try:
        return bcrypt.checkpw(_truncate72_bytes(plain_password), hp)
    except Exception:
        return False
    hp = hashed_password if isinstance(hashed_password, (bytes, bytearray)) else (
        hashed_password or "").encode("utf-8")
    try:
        return bcrypt.checkpw(_truncate72_bytes(plain_password), hp)
    except Exception:
        return False
    hp = hashed_password if isinstance(hashed_password, (bytes, bytearray)) else (
        hashed_password or "").encode("utf-8")
    try:
        return bcrypt.checkpw(_truncate72_bytes(plain_password), hp)
    except Exception:
        return False


def get_password_hash(password):
    return bcrypt.hashpw(_truncate72_bytes(password), bcrypt.gensalt(rounds=12)).decode("utf-8")


def authenticate_user(db, email, password):
    normalized_email = email.strip().lower()
    user = db.query(User).filter(func.lower(
        User.email) == normalized_email).first()
    if not user:
        return None
    ok = verify_password(password, user.hashed_password)
    if not ok:
        return None
    if isinstance(user.hashed_password, str) and user.hashed_password.startswith("$pbkdf2-sha256$"):
        try:
            user.hashed_password = get_password_hash(password)
            db.add(user)
            db.commit()
        except Exception:
            pass
    return user


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


# Единая установка auth-куки
def set_auth_cookies(response: JSONResponse, access_token: str, refresh_token: str | None = None, request: Request | None = None):
    # Авто-режим: secure=True только на HTTPS (учитываем и прямое HTTPS, и прокси).
    # Env-переменная COOKIE_SECURE имеет приоритет: "1" — всегда secure, "0" — всегда не secure.
    scheme_https = bool(request and getattr(
        getattr(request, "url", None), "scheme", "") == "https")
    fwd_proto = (request.headers.get("x-forwarded-proto")
                 if (request and hasattr(request, "headers")) else None)
    auto_secure = scheme_https or (fwd_proto == "https")
    env_val = os.getenv("COOKIE_SECURE")
    SECURE_COOKIE = (env_val if env_val in ("0", "1")
                     else ("1" if auto_secure else "0")) == "1"
    # домен для куки (чтобы работало на поддоменах)
    COOKIE_DOMAIN = (os.getenv("COOKIE_DOMAIN", ".transinfo.ge") or "").strip()
    # если secure=true -> SameSite=None (нужно для cross-site запросов из www → api)
    samesite_val = "none" if SECURE_COOKIE else "lax"

    response.set_cookie(
        key="token",
        value=access_token,
        httponly=True,
        samesite=samesite_val,
        secure=SECURE_COOKIE,
        max_age=60 * 30,  # 30 минут
        path="/",
        domain=COOKIE_DOMAIN if COOKIE_DOMAIN else None,
    )
    if refresh_token:
        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            samesite=samesite_val,
            secure=SECURE_COOKIE,
            max_age=60 * 60 * 24 * 30,  # 30 дней
            path="/",
            domain=COOKIE_DOMAIN if COOKIE_DOMAIN else None,
        )
    return response
# ---------- Эндпоинт РЕГИСТРАЦИИ ----------


@router.post("/register")
def register(user: UserRegister, request: Request, db: Session = Depends(get_db)):
    if str(user.role).upper() == "ADMIN":
        raise HTTPException(
            status_code=403,
            detail={"code": "error.register.adminForbidden",
                    "message": "Регистрация администратора запрещена"}
        )
    errors = []
    normalized_email = (user.email or "").strip().lower()
    phone_norm = _normalize_phone_e164_digits((user.phone or "").strip())
    # дублирующийся email -> в список ошибок (422 detail)
    if db.query(User).filter(func.lower(User.email) == normalized_email).first():
        errors.append({
            "loc": ["body", "email"],
            "msg": "error.register.emailExists",
            "msg_ru": "Email уже зарегистрирован",
            "type": "value_error"
        })
    if phone_norm:
        # Ищем совпадение по телефону, очищая все номера от нецифровых символов
        phone_exists = db.query(User).filter(
            func.regexp_replace(func.coalesce(User.phone, ""), "[^0-9]", "", "g") == phone_norm
        ).first()
        if phone_exists:
            errors.append({
                "loc": ["body", "phone"],
                "msg": "error.register.phoneExists",
                "msg_ru": "Телефон уже зарегистрирован",
                "type": "value_error",
            })
            
        
    # Простейшие проверки на пустоту — чтобы вернуть список полей
    def _empty(v): return (v is None) or (isinstance(v, str) and not v.strip())
    if _empty(user.organization):
        errors.append({"loc": ["body", "organization"], "msg": "error.register.organizationRequired",
                      "msg_ru": "Укажите организацию", "type": "value_error"})
    if _empty(user.contact_person):
        errors.append({"loc": ["body", "contact_person"], "msg": "error.register.contactRequired",
                      "msg_ru": "Укажите контактное лицо", "type": "value_error"})
    if _empty(user.country):
        errors.append({"loc": ["body", "country"], "msg": "error.register.countryRequired",
                      "msg_ru": "Укажите страну", "type": "value_error"})
    if _empty(user.city):
        errors.append({"loc": ["body", "city"], "msg": "error.register.cityRequired",
                      "msg_ru": "Укажите город", "type": "value_error"})
    if _empty(user.phone):
        errors.append({"loc": ["body", "phone"], "msg": "error.register.phoneRequired",
                      "msg_ru": "Укажите телефон", "type": "value_error"})
    # person_type обязателен для TRANSPORT/OWNER
    role_str = str(user.role)
    if role_str in ("TRANSPORT", "OWNER") and _empty(user.person_type):
        errors.append({"loc": ["body", "person_type"], "msg": "error.register.personTypeRequired",
                      "msg_ru": "Выберите юридический статус (ЮЛ/ИП/ФЛ)", "type": "value_error"})
    # Terms consent validation в виде ошибок формы
    if not user.accepted_terms:
        errors.append({"loc": ["body", "accepted_terms"], "msg": "error.register.termsRequired",
                      "msg_ru": "Необходимо согласие с пользовательским соглашением", "type": "value_error"})
    elif (user.terms_version or "").strip() != TERMS_VERSION:
        errors.append({"loc": ["body", "terms_version"], "msg": "error.register.termsVersionOutdated",
                      "msg_ru": "Версия соглашения устарела. Обновите страницу и подтвердите согласие.", "type": "value_error"})
    if errors:
        # здесь пока НИЧЕГО не бросаем — сначала добавим возможную ошибку домена
        pass
    # Доп. проверка на доставляемость e‑mail, если верификация отключена (без отправки писем)
    if not EMAIL_VERIFICATION_ENABLED:
        ok_email, reason = _email_domain_looks_deliverable(normalized_email)
        if not ok_email:
            msg_ru = (
                "Домен e‑mail не принимает почту (нет MX‑записи)" if reason == "no_mx"
                else "Одноразовые почтовые домены запрещены" if reason == "disposable"
                else "Некорректный домен e‑mail"
            )
            errors.append({
                "loc": ["body", "email"],
                "msg": "error.register.emailDomainInvalid",
                "msg_ru": msg_ru,
                "type": "value_error",
            })
    if errors:
        # Отдаём 422 с detail: [...] — FastAPI сам сформирует JSON
        raise RequestValidationError(errors)

    # --- Требуем подтверждение телефона кодом до регистрации
    # Совпадаем с форматом, который сохраняем в PhoneVerification
   
    pv = db.query(PhoneVerification).filter(
        PhoneVerification.phone == phone_norm).first()
    if (not pv) or (not pv.verified_at) or expired(pv.expires_at):
        # Возвращаем ошибку формы на поле phone
        raise RequestValidationError([{
            "loc": ["body", "phone"],
            "msg": "error.register.phoneNotVerified",
            "msg_ru": "Подтвердите номер телефона кодом из SMS",
            "type": "value_error"
        }])
    hashed_password = get_password_hash(user.password)
    client_ip = getattr(getattr(request, 'client', None), 'host', None)
    now_ = datetime.utcnow()
    new_user = User(
        email=normalized_email,
        hashed_password=hashed_password,
        role=user.role,
        organization=user.organization,
        phone=user.phone,
        country=user.country,
        city=user.city,
        contact_person=user.contact_person,
        person_type=user.person_type,
        fleet=user.fleet,
        whatsapp=user.whatsapp or user.phone,
        viber=user.viber or user.phone,
        telegram=user.telegram,
        is_active=True,
        is_verified=False,
        email_verified=False,
        phone_verified=True,  # номер подтверждён выше
        docs_verified=False,
        avatar=None,
        created_at=datetime.utcnow(),
        final_rating=10.0,  # стартовые 10/10 звёзд
        accepted_terms=True,
        terms_version=user.terms_version,
        terms_accepted_at=now_,
        terms_accepted_ip=client_ip,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    if EMAIL_VERIFICATION_ENABLED:
        _send_verification_code(db, new_user)
        return {"status": "verification_sent"}
    else:
        # Временное отключение email-верификации: помечаем как подтверждённый
        new_user.email_verified = True
        new_user.email_verified_at = _to_utc(now())
        db.add(new_user)
        db.commit()
        return {"status": "ok"}


# ---------- Эндпоинт ЛОГИНА ----------


class Token(BaseModel):
    access_token: str
    token_type: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


@router.post("/verify-email")
def verify_email(payload: EmailVerifyRequest, db: Session = Depends(get_db)):
    email = (payload.email or "").strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="error.user.notFound")
    ev = db.query(EmailVerification).filter(
        EmailVerification.user_id == user.id).first()
    if not ev:
        raise HTTPException(status_code=400, detail="error.verify.noCode")
    # сравнение времени с учётом tz (на случай разных старых/новых записей)
    if expired(_to_utc(ev.expires_at)):
        raise HTTPException(status_code=400, detail="error.verify.codeExpired")
    # увеличим счётчик попыток
    if ev.attempts >= MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429, detail="error.verify.tooManyAttempts")
    ev.attempts += 1
    db.add(ev)
    db.commit()
    if hash_code(payload.code) != ev.code_hash:
        raise HTTPException(status_code=400, detail="error.verify.codeInvalid")
    # успех: отмечаем пользователя подтверждённым
    user.email_verified = True
    user.email_verified_at = _to_utc(now())
    db.delete(ev)
    db.add(user)
    db.commit()
    return {"ok": True}


@router.post("/verify-email/resend")
def resend_verify_email(payload: EmailResendRequest, db: Session = Depends(get_db)):
    email = (payload.email or "").strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user:
        return {"ok": True}  # не раскрываем наличие аккаунта
    # Если уже подтверждён ИЛИ верификация почты вообще выключена — просто возвращаем ok
    if user.email_verified or not EMAIL_VERIFICATION_ENABLED:
        return {"ok": True}
    _send_verification_code(db, user)
    return {"ok": True}


@router.post("/login")
def login(user: LoginRequest, request: Request, db: Session = Depends(get_db)):
    db_user = authenticate_user(db, user.email.strip().lower(), user.password)
    if not db_user:
        raise HTTPException(
            status_code=401, detail="error.auth.invalidCredentials")
    # Блокируем вход из-за неподтверждённой почты ТОЛЬКО если включён флаг
    if REQUIRE_EMAIL_VERIFIED_FOR_LOGIN and not getattr(db_user, "email_verified", False):
        raise HTTPException(
            status_code=403, detail="error.auth.emailNotVerified")
    # --- Single-session: создаём новый SID и сохраняем на пользователе
    new_sid = str(uuid.uuid4())
    db_user.session_uuid = new_sid
    db_user.session_updated_at = datetime.utcnow()
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    payload = {
        "sub": db_user.email,
        "role": str(db_user.role.value) if hasattr(db_user.role, "value") else str(db_user.role),
        "user_id": db_user.id,
        "sid": new_sid,
    }
    access_token = create_access_token(payload)
    refresh_token = create_refresh_token(payload)

    resp = JSONResponse(content={
        "access_token": access_token,
        "token_type": "bearer",
        "email": db_user.email,
        "role": str(db_user.role.value) if hasattr(db_user.role, "value") else str(db_user.role)
    })
    return set_auth_cookies(resp, access_token, refresh_token, request)

# ---------- Эндпоинт ПРОФИЛЯ ----------


@router.get("/me")
def get_profile(
    db: Session = Depends(get_db),
    authorization: str = Header(default=None),
    cookie_token: str = Cookie(default=None, alias="token"),
):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
    )
    # Достаём токен: приоритет — Authorization, затем cookie
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[len("Bearer "):]
    if not token:
        token = cookie_token
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    normalized_email = (email or "").strip().lower()
    user = db.query(User).filter(func.lower(
        User.email) == normalized_email).first()
    if not user:
        raise HTTPException(status_code=404, detail="error.user.notFound")
    return UserProfile(
        id=user.id,
        email=user.email,
        role=_role_str(user),
        organization=user.organization,
        country=user.country,
        city=user.city,
        contact_person=user.contact_person,
        phone=user.phone,
        whatsapp=user.whatsapp,     # ← добавить
        viber=user.viber,           # ← добавить
        telegram=user.telegram,     # ← добавить
        person_type=user.person_type,
        fleet=user.fleet,
        is_active=user.is_active,
        is_verified=user.is_verified,
        email_verified=user.email_verified,
        phone_verified=user.phone_verified,
        docs_verified=user.docs_verified,
        avatar=user.avatar,
        created_at=user.created_at,
        profile_data=getattr(user, "profile_data", None),
        docs_files=user.docs_files if hasattr(user, "docs_files") else None,
        final_rating=user.final_rating if hasattr(
            user, "final_rating") else 0.0,
        verification_status=user.verification_status if hasattr(
            user, "verification_status") else None,
    )


# REPLACE the whole function in auth.py with this sync version

def get_token_from_header_or_cookie(
    request: Request = None,
    websocket: WebSocket = None,
):
    """
    Возвращает access-токен из:
      1) WebSocket subprotocol: "bearer, <JWT>"
      2) Authorization: Bearer <JWT>
      3) query (?token=... / ?access_token=...)
      4) cookies ("token" / "access_token")
    """
    token = None

    # HTTP
    if request:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:]
        if not token:
            token = request.cookies.get(
                "token") or request.cookies.get("access_token")

    # WebSocket
    if websocket and not token:
        # 1) subprotocol: "bearer, <token>"
        proto = websocket.headers.get("sec-websocket-protocol")
        if proto:
            parts = [p.strip() for p in proto.split(",")]
            for i, p in enumerate(parts):
                if p.lower() == "bearer" and i + 1 < len(parts):
                    token = parts[i + 1]
                    break
        # 2) Authorization
        if not token:
            auth_header = websocket.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header[7:]
        # 3) query
        if not token:
            token = websocket.query_params.get(
                "token") or websocket.query_params.get("access_token")
        # 4) cookies
        if not token:
            try:
                token = websocket.cookies.get(
                    "token") or websocket.cookies.get("access_token")
            except Exception:
                token = None

    return token or None


def create_refresh_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


class RefreshTokenRequest(BaseModel):
    refresh_token: str = None


@router.post("/refresh-token")
def refresh_token(
    request: Request,
    body: RefreshTokenRequest = None,
    db: Session = Depends(get_db)
):
    # Можно принимать refresh_token либо из cookie, либо из body
    refresh_token = None
    if request.cookies.get("refresh_token"):
        refresh_token = request.cookies.get("refresh_token")
    elif body and body.refresh_token:
        refresh_token = body.refresh_token

    if not refresh_token:
        raise HTTPException(status_code=401, detail={
                            "code": "error.auth.refreshMissing", "message": "Не передан refresh-токен"})
    try:
        payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail={
                                "code": "error.auth.refreshInvalid", "message": "Неверный refresh-токен"})
        user_id = payload.get("user_id")
        user = db.query(User).filter(User.id == int(user_id)).first()
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        # --- Single-session: refresh тоже должен совпадать по SID
        sid = payload.get("sid")
        if getattr(user, "session_uuid", None) and sid != user.session_uuid:
            raise HTTPException(status_code=401, detail={
                "code": "error.auth.sessionRevoked",
                "message": "Сессия недействительна (обнаружен вход с другого устройства)."
            })
        # Создаём новый access token (по текущему юзеру)
        new_access = create_access_token({
            "sub": user.email,
            "role": str((getattr(getattr(user, "role", None), "value", None) or getattr(user, "role_name", None) or getattr(user, "user_role", None) or getattr(user, "role", None) or "OWNER")),
            "user_id": user.id,
            "sid": user.session_uuid,
        })
        resp = JSONResponse(
            content={"access_token": new_access, "token_type": "bearer"})
        # Продлеваем refresh_token (ротируем по желанию — оставим как есть)
        return set_auth_cookies(resp, new_access, refresh_token, request)
    except JWTError:
        raise HTTPException(status_code=401, detail={
                            "code": "error.user.notFound", "message": "Пользователь не найден"})


def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(get_token_from_header_or_cookie),
    request: Request = None,
):
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
    )
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        if not user_id:
            raise credentials_exception
        user = db.query(User).filter(User.id == int(user_id)).first()
        if user is None:
            raise credentials_exception
        # --- Single-session: проверяем SID в токене против актуального на пользователе
        sid = payload.get("sid")
        if getattr(user, "session_uuid", None) and sid != user.session_uuid:
            raise HTTPException(status_code=401, detail={
                "code": "error.auth.sessionRevoked",
                "message": "Сессия этого устройства недействительна (вход с другого устройства)."
            })
        # Блокируем неактивные учётки
        if getattr(user, "is_active", True) is False:
            raise HTTPException(
                status_code=403, detail="error.account.blocked")
            # Track presence for every authenticated request
        try:
            record_user_activity(db, user, request)
        except Exception:
            pass
        return user
    except Exception as e:
        print("[Auth Error]:", e)
        raise credentials_exception


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Смена пароля текущего пользователя.
    Требует действительный токен. Проверяет старый пароль и ставит новый.
    """
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=400, detail="error.password.currentWrong")

    if len(payload.new_password or "") < 8:
        raise HTTPException(status_code=422, detail="error.password.tooShort8")

    current_user.hashed_password = get_password_hash(payload.new_password)
    db.add(current_user)
    db.commit()
    return {"ok": True}


@router.post("/logout")
def logout(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Логаут: сбрасываем cookies и моментально инвалидируем все старые токены,
    установив новый случайный session_uuid.
    """
    try:
        current_user.session_uuid = str(uuid.uuid4())
        current_user.session_updated_at = datetime.utcnow()
        db.add(current_user)
        db.commit()
    except Exception:
        pass
    resp = JSONResponse(content={"status": "ok"})
    resp.delete_cookie("token", path="/")
    resp.delete_cookie("refresh_token", path="/")
    return resp


@router.post("/employees")
def create_employee(user: EmployeeRegister, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.MANAGER:
        raise HTTPException(status_code=403, detail={
                            "code": "error.employee.createOnlyManager", "message": "Только MANAGER может добавлять сотрудников"})
    normalized_email = (user.email or "").strip().lower()
    email_norm = (user.email or "").strip().lower()
    if db.query(User).filter(func.lower(User.email) == email_norm).first():
        raise HTTPException(status_code=400, detail={
                            "code": "error.register.emailExists", "message": "Email уже зарегистрирован"})
    hashed_password = get_password_hash(user.password)
    new_user = User(
        email=email_norm,
        hashed_password=hashed_password,
        role=UserRole.EMPLOYEE,
        manager_id=current_user.id,
        organization=current_user.organization,
        country=user.country,
        city=user.city,
        contact_person=user.contact_person,
        phone=user.phone,
        person_type=user.person_type,
        fleet=user.fleet,
        whatsapp=user.whatsapp or user.phone,
        viber=user.viber or user.phone,
        telegram=user.telegram,
        is_active=True,
        is_verified=False,
        email_verified=False,
        phone_verified=False,
        docs_verified=False,
        avatar=None,
        created_at=datetime.utcnow(),
        final_rating=10.0,  # стартовые 10/10 звёзд
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    # Pydantic v2: используем model_validate (как в /employees/invite)
    return {"status": "ok", "user": UserProfile.model_validate(new_user, from_attributes=True)}


@router.get("/employees")
def get_employees(
    limit: int = Query(30, ge=1, le=200),
    offset: int = Query(0, ge=0),
    response: Response = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.MANAGER:
        raise HTTPException(
            status_code=403, detail="error.employee.onlyManagerView")

    base_q = db.query(User).filter(User.manager_id == current_user.id)

    total = base_q.count()

    # Безопасная сортировка: берём только существующие колонки.
    # Порядок приоритета: organization, contact_person, first_name, last_name, email, username, id.
    order_names = ("organization", "contact_person", "first_name",
                   "last_name", "email", "username", "id")
    orders = []
    for name in order_names:
        col = getattr(User, name, None)
        if col is not None:
            try:
                # Для Postgres/современного SQLAlchemy
                orders.append(col.asc().nulls_last())
            except Exception:
                # Для SQLite/старых версий — без nulls_last()
                orders.append(col.asc())

    q = base_q.order_by(*orders) if orders else base_q
    rows = (
        q.offset(offset)
        .limit(limit)
        .all()
    )

    if response is not None:
        try:
            response.headers["X-Total-Count"] = str(total)
            response.headers["X-Limit"] = str(limit)
            response.headers["X-Offset"] = str(offset)
        except Exception:
            pass

    return [UserProfile.from_orm(emp) for emp in rows]


@router.delete("/employees/{employee_id}")
def delete_employee(employee_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != UserRole.MANAGER:
        raise HTTPException(
            status_code=403, detail="error.employee.onlyManagerDelete")
    employee = db.query(User).filter(User.id == employee_id,
                                     User.manager_id == current_user.id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="error.employee.notFound")
    db.delete(employee)
    db.commit()
    return {"status": "deleted"}


class InviteExistingRequest(BaseModel):
    email: EmailStr


@router.post("/employees/invite")
def invite_existing_employee(
    req: InviteExistingRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != UserRole.MANAGER:
        raise HTTPException(
            status_code=403, detail="Только MANAGER может добавлять сотрудников")
    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        raise HTTPException(
            status_code=404, detail="Пользователь с таким email не найден")
    if user.id == current_user.id:
        raise HTTPException(
            status_code=400, detail="Нельзя пригласить самого себя")
    if user.manager_id and user.manager_id != current_user.id:
        raise HTTPException(
            status_code=409, detail="Пользователь уже привязан к другому менеджеру")
    # Присваиваем менеджера и роль EMPLOYEE (если была другая «пользовательская» роль)
    user.manager_id = current_user.id
    if user.role not in [UserRole.MANAGER, UserRole.ADMIN]:
        user.role = UserRole.EMPLOYEE
    db.commit()
    db.refresh(user)
    return UserProfile.model_validate(user, from_attributes=True)


@router.put("/employees/{employee_id}")
@router.patch("/employees/{employee_id}")
def update_employee(
    employee_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Только менеджер может редактировать своих сотрудников
    if current_user.role != UserRole.MANAGER:
        raise HTTPException(
            status_code=403, detail="Только MANAGER может редактировать сотрудников")

    emp = db.query(User).filter(
        User.id == employee_id,
        User.manager_id == current_user.id
    ).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    data = payload.dict(exclude_unset=True)

    # Поля, которые через этот эндпоинт менять нельзя
    for forbidden in [
        "role", "manager_id", "organization",
        "is_active", "is_verified", "email_verified",
        "phone_verified", "docs_verified", "final_rating",
        "profile_data", "docs_files", "verification_status"
    ]:
        data.pop(forbidden, None)

    # Смена email — с проверкой уникальности
    if "email" in data:
        email_norm = (data["email"] or "").strip().lower()
        if email_norm != (emp.email or "").lower():
            if db.query(User).filter(func.lower(User.email) == email_norm).first():
                raise HTTPException(
                    status_code=400, detail="Email уже зарегистрирован")
            emp.email = email_norm
        data.pop("email", None)

    for attr, value in data.items():
        setattr(emp, attr, value)
    db.commit()
    db.refresh(emp)
    return UserProfile.model_validate(emp, from_attributes=True)


# --- [ADD AT EOF] Опциональный юзер: вместо 401 вернём None ---


def get_optional_current_user(
    Authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Как get_current_user, но если токена нет/битый — возвращает None.
    НИКАКИХ raise HTTPException здесь.
    """
    try:
        if not Authorization:
            return None
        token = Authorization.replace("Bearer ", "")
        # та же логика, что в get_current_user
        user = decode_jwt_and_load_user(db, token)
        return user
    except Exception:
        return None

# --- compat helper: role -> str (Enum/str/alt-attr/missing) ---


def _role_str(user):
    """
    Возвращает строковое значение роли пользователя, устойчиво к
    Enum/str, альтернативным именам и отсутствию поля.
    """
    r = getattr(user, "role", None)
    if hasattr(r, "value"):
        return str(r.value)
    if r is not None:
        return str(r)
    r2 = getattr(user, "user_role", None) or getattr(
        user, "type", None) or getattr(user, "role_name", None)
    if hasattr(r2, "value"):
        return str(r2.value)
    if r2 is not None:
        return str(r2)
    return "USER"  # безопасный дефолт
