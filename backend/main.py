from database import get_db
from models import Match, Order, Transport, TrackingSession, TrackingShare, TrackingPoint, User as UserModel, Order as OrderModel, Transport as TransportModel  # get_db убран отсюда
from models import Notification, NotificationType
from notifications import router as notifications_router
import models
from notifications import find_matching_orders_for_transport
from math import radians, cos, sin, asin, sqrt
import asyncio
from notifications import create_notification, find_and_notify_auto_match_for_order, find_and_notify_auto_match_for_transport, find_matching_orders
from notification_rest import router as notification_router
from order_comments import router as order_comments_router
from chat_rest import router as chat_rest_router
from chat_upload import router as chat_upload_router
from schemas import SavedToggleResponse
from schemas import (
    UserRegister, ChatMessageOut, UserProfile, UserOut, UserUpdate, RatingCreate, Rating as RatingSchema,
    Token, TransportCreate, Transport, OrderCreate, Order, RatingOut, BidOut, BidCreate, OrderOut
)
from models import (
    Transport as TransportModel,
    Order as OrderModel,
    User as UserModel,
    Rating as RatingModel,
    Rating, Chat, ChatMessage, ChatParticipant, ChatFile, Bid, BidStatus, Order,
    NotificationType, OrderMatchView, TransportMatchView, InternalComment,
    SavedOrder, SavedTransport,
    OrderDailyView, TransportDailyView
)
from database import engine, Base
from auth import router as auth_router, authenticate_user, create_access_token, get_current_user, SECRET_KEY, ALGORITHM
import sys
import threading
import schemas
from uuid import uuid4
import subprocess
import requests
import redis
import contextlib
import logging
import uuid
from collections import defaultdict
from pydantic import BaseModel
from typing import List, Optional, Dict
from password_reset_rest import router as password_reset_router
from ws_chat import ws_router as ws_chat_router
from starlette.websockets import WebSocketDisconnect, WebSocketState
from jose import jwt, JWTError
from models import UserBlock as UB
from sqlalchemy.types import String
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import or_, func, text, cast, ARRAY, String, and_
from sqlalchemy.exc import IntegrityError
from schemas import OrderShort
from database import SessionLocal, get_db
from fastapi.exceptions import RequestValidationError
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.websockets import WebSocketState
from starlette.responses import Response
from fastapi import FastAPI, WebSocket, Query, Path as ApiPath, Response, Depends, HTTPException, status, Body, UploadFile, File, APIRouter, Request, Header, Response, Request
from notifications import user_notification_connections, push_notification, find_matching_orders
from order_reminders import start_scheduler
from fastapi import Query, Depends, Response
from typing import Optional, List
from billing_tasks import start_billing_scheduler
# TEMP: billing выключен, чтобы поднять API; вернём после фикса импорта в billing_rest
# from billing_rest import router as billing_router
from fastapi import Query, Depends
import mimetypes
import base64
import re
from models import User as UserModel, Order as OrderModel, UserRole
# <-- уже есть ниже, дубли не страшны
from models import TrackingRequest, TrackingRequestStatus
from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi.responses import RedirectResponse
from admin_rest import router as admin_router
from places_rest import router as places_router
from geo_rest import router as geo_router
from typing import List        # уже используется в файле
from fastapi import Request
from datetime import datetime
from jose import jwt
from auth import SECRET_KEY, ALGORITHM, get_token_from_header_or_cookie
from models import Subscription, SubscriptionStatus
# вверху файла уже есть импорт datetime — если нет, добавь
from datetime import datetime
# ВАЖНО: регистрируем раньше auth_router
from block_rest import router as block_router
from ws_events import active_connections, ws_emit_to_chat  # <-- общий стор и эмиттер
from fastapi.responses import FileResponse, StreamingResponse
from fastapi import Request, HTTPException
from pathlib import Path
from starlette.responses import Response, FileResponse
from fastapi import Request, HTTPException, APIRouter
from contact_rest import router as contacts_router
from models import TrackingRequest, TrackingRequestStatus
import support_models  # регистрирует модели support_* в SQLAlchemy metadata
from support_rest import router as support_router
# Роуты отзывов
from routers.reviews import router as reviews_router
from pathlib import Path as FilePath
from fastapi.responses import FileResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response as StarletteResponse
import hashlib
import json
import time
from typing import Dict, Tuple
from typing import Any, Optional
from models import UserRole
from schemas import Transport as TransportSchema
from schemas import Order as OrderSchema
from schemas import OrderOut
# (или где у тебя эта функция)
from notifications import find_matching_transports
from schemas import Order      # Импортируй Pydantic-модель!
from typing import List
from auth import get_current_user, get_token_from_header_or_cookie
from schemas import InternalCommentCreate, InternalCommentOut
from models import UserRole as DbUserRole
from typing import Optional
import secrets
from schemas import BidOut, Order
from datetime import datetime, timedelta, date
import os
DEBUG_SQL = os.getenv('DEBUG_SQL', '0') == '1'


# Импорты своих модулей


# --- Unified admin guard

# --- load .env.local / .env for backend (robust) ---
try:
    from dotenv import load_dotenv  # опционально
except ImportError:
    load_dotenv = None

# --- Paywall helpers -------------------------------------------------

try:
    import resource  # Unix only
except ModuleNotFoundError:
    resource = None


# --- Paywall helpers -------------------------------------------------

try:
    # Unix‑only; на Windows модуля нет.
    import resource
except ModuleNotFoundError:
    resource = None


def dbg_mem(tag: str) -> None:
    """
    Логируем использование памяти процесса в mem.log (рядом с main.py)
    и дублируем в stdout.

    На платформах без модуля `resource` (Windows) выходим сразу.
    """
    if resource is None:
        return

    try:
        # Пиковый RSS с начала жизни процесса
        usage = resource.getrusage(resource.RUSAGE_SELF)
        peak_mb = usage.ru_maxrss / 1024.0  # ru_maxrss в Кб → МБ

        current_mb = None
        try:
            # /proc/self/statm: total, resident, shared, ...
            with open("/proc/self/statm", "r") as f:
                parts = f.read().split()
            if len(parts) >= 2:
                rss_pages = int(parts[1])
                page_size = os.sysconf("SC_PAGE_SIZE")  # байт
                current_mb = rss_pages * page_size / (1024.0 * 1024.0)
        except Exception:
            current_mb = None

        if current_mb is not None:
            line = (
                f"[MEM] {tag}: rss={current_mb:.1f} MB, "
                f"peak={peak_mb:.1f} MB (pid={os.getpid()})"
            )
        else:
            # fallback, если /proc/self/statm по какой‑то причине не прочитался
            line = (
                f"[MEM] {tag}: rss≈{peak_mb:.1f} MB (peak only, "
                f"pid={os.getpid()})"
            )
    except Exception as e:
        line = f"[MEM] {tag}: error: {e}"

    # Пишем в файл рядом с main.py
    try:
        base_dir = os.path.dirname(__file__)
        path = os.path.join(base_dir, "mem.log")
        with open(path, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        # Логирование не должно ломать работу API
        pass

    print(line)


# Временный флажок: можно полностью отключить тяжёлые пересчёты счётчиков совпадений.
DISABLE_MATCH_COUNTERS = os.getenv("DISABLE_MATCH_COUNTERS", "0") == "1"

# Путь до скрипта воркера авто‑матча
AUTO_MATCH_WORKER_PATH = Path(__file__).with_name("auto_match_worker.py")


def enqueue_auto_match(kind: str, object_id):
    """
    Стартует отдельный процесс auto_match_worker.py, чтобы подобрать совпадения.
    kind: "order" или "transport"
    object_id: id заявки или транспорта
    """
    try:
        cmd = [
            sys.executable,                      # тот же python, что и у uvicorn
            str(AUTO_MATCH_WORKER_PATH),
            "--kind", kind,
            "--id", str(object_id),
        ]
        # Запускаем процесс в фоне, не блокируя запрос
        subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
        )
        print(f"[AUTO_MATCH] spawned worker: {' '.join(cmd)}")
    except Exception as e:
        # В случае ошибки просто логируем, но не валим API
        print("[AUTO_MATCH] failed to spawn worker:", e)


def get_optional_current_user(
    request: Request, db: Session = Depends(get_db)
) -> Optional[UserModel]:
    """
    Опционально получает текущего пользователя.
    Если токен есть и он валиден — возвращает пользователя.
    Если токена нет или он невалиден — возвращает None (не вызывает ошибку).
    """
    token = get_token_from_header_or_cookie(request)
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
    except JWTError:
        return None

    user = db.query(UserModel).filter(UserModel.email == email).first()
    # Проверяем, не заблокирован ли пользователь глобально
    if user and getattr(user, "is_globally_blocked", False):
        # Можно логировать попытку входа заблокированного пользователя
        return None

    return user


def _has_full_access(db, user: UserModel) -> bool:
    if not user:
        return False
    if user.role in (UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPPORT):
        return True
    account_id = _billing_account_id(user)
    if not account_id:
        return False
    sub = (
        db.query(Subscription)
        .filter(Subscription.account_id == account_id)
        .filter(Subscription.status == SubscriptionStatus.ACTIVE)
        .first()
    )
    if not sub:
        return False
    if sub.next_renewal_at and sub.next_renewal_at < datetime.utcnow():
        return False
    return True


def _sanitize_order_for_limited(o: OrderModel) -> dict:
    """
    Возвращаем минимальный безопасный набор полей.
    Важно: title обязателен в pydantic-схеме — подставляем нейтральный плейсхолдер.
    """
    return {
        "id": o.id,
        "title": "•••",  # скрываем реальный заголовок
        "from_locations": o.from_locations or [],
        "to_locations": o.to_locations or [],
        "from_place_ids": getattr(o, "from_place_ids", []) or [],
        "to_place_ids": getattr(o, "to_place_ids", []) or [],
        "load_date": getattr(o, "load_date", "") or "",
        "truck_type": getattr(o, "truck_type", None),
        "created_at": o.created_at,
        "owner_id": None,  # не светим владельца
        "views": int(getattr(o, "views", 0) or 0),
        # Остальное pydantic заполнит дефолтами
    }


def _parse_env_file(path: str) -> bool:
    """Простейший .env-парсер (на случай отсутствия python-dotenv)."""
    if not os.path.exists(path):
        return False
    try:
        with open(path, "r", encoding="utf-8") as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip("'").strip('"')
                # не перезаписываем уже заданные переменные окружения
                os.environ.setdefault(k, v)
        return True
    except Exception:
        return False


def _load_env_file(path: str) -> bool:
    if os.path.exists(path):
        if load_dotenv:
            # не перезаписывать уже существующие переменные
            return bool(load_dotenv(path, override=False))
        return _parse_env_file(path)
    return False


ENV_FILE_USED = None
BASE_DIR = os.path.dirname(__file__)
ROOT_DIR = os.path.abspath(os.path.join(BASE_DIR, ".."))

# Порядок поиска: backend/.env.local → backend/.env → repo/.env.local → repo/.env
for candidate in (
    os.path.join(BASE_DIR, ".env.local"),
    os.path.join(BASE_DIR, ".env"),
    os.path.join(ROOT_DIR, ".env.local"),
    os.path.join(ROOT_DIR, ".env"),
):
    if _load_env_file(candidate):
        ENV_FILE_USED = candidate
        break


def _mask(v: str) -> str:
    if not v:
        return "—"
    v = v.strip()
    return (v[:4] + "…" + v[-4:]) if len(v) > 8 else "set"


print("[ENV] loaded from:", (ENV_FILE_USED or "—"))
print("[TBC env] APIKEY:", _mask(os.getenv("TBC_API_KEY")))
print("[TBC env] CLIENT_ID:", _mask(os.getenv("TBC_CLIENT_ID")))
print("[TBC env] CLIENT_SECRET:", _mask(os.getenv("TBC_CLIENT_SECRET")))


def admin_required(current_user: UserModel = Depends(get_current_user)):
    role_val = getattr(current_user.role, "value", current_user.role)
    if str(role_val).upper() != "ADMIN":
        raise HTTPException(
            status_code=403,
            detail={"code": "error.admin.only", "message": "Только для админа"}
        )
    return current_user


app = FastAPI()

dbg_mem("startup")


@app.get("/healthz")
def healthz():
    return {"ok": True}

# --- Lightweight health endpoint for LB/monitors (returns 204, no body) ---


@app.get("/health", status_code=204)
def health() -> StarletteResponse:
    return StarletteResponse(status_code=204)


# ==== РОУТЕР ДЛЯ chat_files (Range-отдача) ====
chat_files_router = APIRouter()

# Путь к каталогу с файлами чата (подстрой под свой проект)
CHAT_FILES_DIR = os.path.join(
    os.path.dirname(__file__), "static", "chat_files")
# Строго ли соблюдать RFC по 416. По умолчанию — нет (более дружелюбно к плеерам).
STRICT_RANGE = os.getenv("CHAT_FILES_STRICT_RANGE", "0") == "1"


def _range_file_response(request: Request, file_path: str, content_type: str):
    size = os.path.getsize(file_path)
    rng = request.headers.get("range")
    if not rng:
        return FileResponse(file_path, media_type=content_type, headers={"Accept-Ranges": "bytes"})
    # если файл пустой — сразу отдаём 200 без Range, чтобы не плодить 416
    if size == 0:
        return Response(content=b"", status_code=200, media_type=content_type,
                        headers={"Accept-Ranges": "bytes", "Content-Length": "0"})
    m = re.match(r"bytes=(\d+)-(\d*)", rng)
    if not m:
        if STRICT_RANGE:
            return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
        # fallback: отдаём весь файл
        return FileResponse(file_path, media_type=content_type, headers={"Accept-Ranges": "bytes"})
    start = int(m.group(1))
    end = int(m.group(2)) if m.group(2) else size - 1
    if start >= size or start > end:
        if STRICT_RANGE:
            return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
        # fallback: отдаём весь файл вместо 416 — браузеры/плееры не зациклятся
        return FileResponse(file_path, media_type=content_type, headers={"Accept-Ranges": "bytes"})
    end = min(end, size - 1)
    length = end - start + 1
    with open(file_path, "rb") as f:
        f.seek(start)
        data = f.read(length)
    headers = {
        "Content-Range": f"bytes {start}-{end}/{size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
    }
    return Response(content=data, status_code=206, media_type=content_type, headers=headers)


# === Общий список заявок (гость видит санитизированные данные) ===


@chat_files_router.get("/static/chat_files/{filename:path}")
def serve_chat_file(filename: str, request: Request):
    # Нормализуем путь и не даём выйти из каталога
    full = os.path.normpath(os.path.join(CHAT_FILES_DIR, filename))
    base = os.path.abspath(CHAT_FILES_DIR)
    if not full.startswith(base):
        raise HTTPException(status_code=404)
    if not os.path.exists(full):
        raise HTTPException(status_code=404)
    ctype, _ = mimetypes.guess_type(full)
    return _range_file_response(request, full, ctype or "application/octet-stream")


# ==== RANGE для /static/media | /static/sounds | /static/voice ====
media_range_router = APIRouter()
MEDIA_ROOT = Path(__file__).parent / "static"
_AUDIO_MIME = {
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
    ".webm": "audio/webm", ".m4a": "audio/mp4", ".aac": "audio/aac"
}


def _guess_audio_mime(p: Path) -> str:
    return _AUDIO_MIME.get(p.suffix.lower(), "application/octet-stream")


@media_range_router.get("/static/media/{filename:path}")
def static_media(filename: str, request: Request):
    path = (MEDIA_ROOT / "media" / filename).resolve()
    if not str(path).startswith(str(MEDIA_ROOT.resolve())) or not path.exists():
        raise HTTPException(status_code=404)
    return ranged_file_response(request, path, _guess_audio_mime(path))


@media_range_router.get("/static/sounds/{filename:path}")
def static_sounds(filename: str, request: Request):
    path = (MEDIA_ROOT / "sounds" / filename).resolve()
    if not str(path).startswith(str(MEDIA_ROOT.resolve())) or not path.exists():
        raise HTTPException(status_code=404)
    return ranged_file_response(request, path, _guess_audio_mime(path))


@media_range_router.get("/static/voice/{filename:path}")
def static_voice(filename: str, request: Request):
    path = (MEDIA_ROOT / "voice" / filename).resolve()
    if not str(path).startswith(str(MEDIA_ROOT.resolve())) or not path.exists():
        raise HTTPException(status_code=404)
    return ranged_file_response(request, path, _guess_audio_mime(path))


AUTO_CREATE_DB = os.getenv("AUTO_CREATE_DB") == "1"
if AUTO_CREATE_DB:
    import support_models  # регистрируем маппинги только в dev-режиме
    Base.metadata.create_all(bind=engine)


ws_router = APIRouter()

# Разрешить токен в query только в DEV по явному флагу (по умолчанию — запрещено)
ALLOW_WS_TOKEN_QUERY = os.getenv("ALLOW_WS_TOKEN_QUERY", "1") == "1"

# Разрешать ли токен в query (?token=...) — только для DEV. В проде держим "0".
ALLOW_WS_TOKEN_QUERY = os.getenv("ALLOW_WS_TOKEN_QUERY", "1") == "1"

active_websockets = defaultdict(set)

transport_live_watchers = defaultdict(set)

# session_id -> set[WebSocket] (публичные зрители по share-ссылке)
link_watchers = defaultdict(set)
# session_id -> bool (кеш последнего live-состояния)
last_live_flag = {}


def haversine(lat1, lon1, lat2, lon2):
    # Радиус Земли в км
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(float, [lat1, lon1, lat2, lon2])
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * \
        cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return R * c


async def notify_user(user_id, message):
    key = str(user_id)
    ws_set = active_websockets.get(key)
    if not ws_set:
        return

    for ws in ws_set.copy():
        try:
            await ws.send_json(message)
        except Exception:
            try:
                ws_set.discard(ws)
            except Exception:
                pass

    if not ws_set:
        active_websockets.pop(key, None)

# Логирование
logging.basicConfig(
    filename="backend_debug.log",
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s"
)
# локальный логгер для вызовов logger.warning(...)
logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_client = redis.Redis.from_url(REDIS_URL)

router = APIRouter()
global_ws_connections = {}

# === CORS: единая корректная обработка preflight и заголовков ===

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "https://transinfo.ge")

# ключ: "<auth-идентификатор>:<path>?<query>" -> (ts, body, headers, status, etag)
_HTTP_CACHE: Dict[str, Tuple[float, bytes, dict, int, str]] = {}


def _get_env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


# Возможность мгновенно отключить HTTP-кэш без деплоя.
DISABLE_HTTP_CACHE = _get_env_bool("DISABLE_HTTP_CACHE", False)

# Максимальное число записей в памяти.
# 0 или отрицательное значение полностью выключает кэширование.
HTTP_CACHE_MAX_ITEMS = int(os.getenv("HTTP_CACHE_MAX_ITEMS", "0") or "0")

# TTL записей (в секундах). После его истечения элементы удаляются.
HTTP_CACHE_TTL = float(os.getenv("HTTP_CACHE_TTL", "5") or "5")

# За один проход чистки удаляем не более указанного количества записей.
HTTP_CACHE_CLEANUP_BUDGET = int(
    os.getenv("HTTP_CACHE_CLEANUP_BUDGET", "100") or "100")


# Порог, при котором мы считаем, что кэш раздулся и надо перезапустить сервис.
# 0 или отрицательное значение = автоперезапуск выключен.
HTTP_CACHE_RESTART_AT = int(os.getenv("HTTP_CACHE_RESTART_AT", "0") or "0")

# Минимальный интервал (в секундах) между перезапусками по кэшу.
HTTP_CACHE_RESTART_COOLDOWN = int(
    os.getenv("HTTP_CACHE_RESTART_COOLDOWN", "300") or "300")

if DISABLE_HTTP_CACHE:
    HTTP_CACHE_MAX_ITEMS = 0


_last_cache_restart_ts: float = 0.0

print(f"[HTTP_CACHE] max items = {HTTP_CACHE_MAX_ITEMS}")
print(
    f"[HTTP_CACHE] ttl = {HTTP_CACHE_TTL}s, cleanup_budget = {HTTP_CACHE_CLEANUP_BUDGET}")
print(
    f"[HTTP_CACHE] restart_at = {HTTP_CACHE_RESTART_AT}, cooldown = {HTTP_CACHE_RESTART_COOLDOWN}s")


def _http_cache_enabled() -> bool:
    return HTTP_CACHE_MAX_ITEMS > 0 and HTTP_CACHE_TTL > 0 and not DISABLE_HTTP_CACHE


def _http_cache_cleanup(now: Optional[float] = None) -> None:
    """Удаляет протухшие записи из кэша, чтобы не накапливать память."""

    if not _HTTP_CACHE:
        return

    now = now or time.time()
    removed = 0
    for key, value in list(_HTTP_CACHE.items()):
        ts = value[0]
        if now - ts >= HTTP_CACHE_TTL:
            _HTTP_CACHE.pop(key, None)
            removed += 1
            if removed >= HTTP_CACHE_CLEANUP_BUDGET:
                break


def _restart_backend_service(reason: str) -> None:
    """
    Автоперезапуск сервиса, когда кэш разрастается.

    Управляется переменными окружения:
      - HTTP_CACHE_RESTART_AT — порог по числу записей (0 = выкл)
      - HTTP_CACHE_RESTART_COOLDOWN — минимальный интервал между рестартами.
    """
    global _last_cache_restart_ts

    if HTTP_CACHE_RESTART_AT <= 0:
        # Автоперезапуск отключен
        return

    now = time.time()
    # Защита от частых рестартов
    if _last_cache_restart_ts and now - _last_cache_restart_ts < HTTP_CACHE_RESTART_COOLDOWN:
        return

    _last_cache_restart_ts = now
    try:
        size = len(_HTTP_CACHE)
        print(
            f"[HTTP_CACHE] size={size}, reason={reason} → restarting transinfo-backend.service")

        # Перезапуск сервиса
        subprocess.run(
            ["sudo", "systemctl", "restart", "transinfo-backend.service"],
            check=False,
        )
        # Логируем статус (вывод попадёт в journalctl)
        subprocess.run(
            ["sudo", "systemctl", "status", "transinfo-backend.service"],
            check=False,
        )
    except Exception as e:
        print(f"[HTTP_CACHE] restart failed: {e}")


def _http_cache_put(key: str, entry: Tuple[float, bytes, dict, int, str]):
    """
    Кладём запись в _HTTP_CACHE с ограничением по количеству.
    entry: (ts, body, headers, status_code, etag)
    """
    if not _http_cache_enabled():
        # Кэш полностью выключен
        return

    try:
        # Перед добавлением вычищаем протухшие записи.
        _http_cache_cleanup(now=entry[0])

        current_size = len(_HTTP_CACHE)

        # Если кэш разросся — пробуем аккуратно перезапустить backend
        if HTTP_CACHE_RESTART_AT > 0 and current_size >= HTTP_CACHE_RESTART_AT:
            _restart_backend_service("HTTP cache size limit reached")

        if current_size >= HTTP_CACHE_MAX_ITEMS:
            # выкидываем ~10% самых старых ключей (по ts)
            to_drop = sorted(
                _HTTP_CACHE.items(), key=lambda kv: kv[1][0]
            )[: max(1, HTTP_CACHE_MAX_ITEMS // 10)]
            for k, _ in to_drop:
                _HTTP_CACHE.pop(k, None)

        _HTTP_CACHE[key] = entry
    except Exception:
        # На всякий случай, чтобы из-за возможной ошибки не рухнул весь запрос
        _HTTP_CACHE.clear()


class ChatCacheMiddleware(BaseHTTPMiddleware):
    """
    Дебаунс/кэш для частых запросов к:
      - /my-chats
      - /my-chats/unread_count

    TTL ~1.5с на пользователя и конкретный путь+query.
    Отдаём 304, если If-None-Match совпал с ETag.

    При выключенном _http_cache_enabled() кэширование полностью отключено.
    """

    def __init__(self, app, ttl: float = 1.5):
        super().__init__(app)
        self.ttl = ttl

    async def dispatch(self, request, call_next):
        # если кэш глобально выключен — просто пропускаем дальше
        if request.method != "GET" or not _http_cache_enabled():
            return await call_next(request)

        path = request.url.path
        if path not in ("/my-chats", "/my-chats/unread_count"):
            return await call_next(request)

        # Простая идентификация пользователя для ключа кэша:
        auth_id = (
            request.headers.get("authorization")
            or request.cookies.get("access_token")
            or request.cookies.get("token")
            or ""
        )
        cache_key = f"{auth_id}:{path}?{request.url.query}"
        now = time.time()

        cached = None
        if request.query_params.get("nocache") not in ("1", "true"):
            cached = _HTTP_CACHE.get(cache_key)

        if cached and (now - cached[0]) >= self.ttl:
            _HTTP_CACHE.pop(cache_key, None)
            cached = None

        if cached:
            _, body, headers, status_code, etag = cached
            inm = request.headers.get("if-none-match")
            if inm and etag and inm == etag:
                # Клиент уже получил такую же версию
                return Response(status_code=304)
            # Отдаём кэш как есть
            out_headers = dict(headers)
            if etag:
                out_headers["ETag"] = etag
            out_headers.setdefault(
                "Cache-Control", "private, max-age=1, stale-while-revalidate=5"
            )
            return Response(
                content=body,
                status_code=status_code,
                headers=out_headers,
                media_type=headers.get("content-type"),
            )

        # Нет кэша или протух — выполняем реальный handler
        response = await call_next(request)

        # Считываем тело ответа (превращаем в обычный Response)
        body = b""
        async for chunk in response.body_iterator:
            body += chunk

        headers = dict(response.headers)
        headers.setdefault("Vary", "Authorization, Cookie")

        # Кэшируем только успешный JSON
        ctype = headers.get("content-type", "")
        etag = None
        if response.status_code == 200 and ("application/json" in ctype):
            try:
                etag = 'W/"%s"' % hashlib.md5(body).hexdigest()
            except Exception:
                etag = ""
            if etag:
                headers["ETag"] = etag
            headers.setdefault(
                "Cache-Control", "private, max-age=1, stale-while-revalidate=5"
            )
            _http_cache_put(
                cache_key, (now, body, headers, response.status_code, etag)
            )

        # Возвращаем «пересобранный» ответ
        return Response(
            content=body,
            status_code=response.status_code,
            headers=headers,
            media_type=response.media_type,
        )


class ListCacheMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, ttl: float = 2.0):
        super().__init__(app)
        self.ttl = ttl

    async def dispatch(self, request, call_next):
        # глобальный выключатель кэша
        if request.method != "GET" or not _http_cache_enabled():
            return await call_next(request)

        path = request.url.path
        if path not in _CACHEABLE_LIST_PATHS:
            return await call_next(request)

        auth_id = (
            request.headers.get("authorization")
            or request.cookies.get("access_token")
            or request.cookies.get("token")
            or ""
        )
        cache_key = f"{auth_id}:{path}?{request.url.query}"
        now = time.time()

        cached = _HTTP_CACHE.get(cache_key)
        if cached and (now - cached[0]) >= self.ttl:
            _HTTP_CACHE.pop(cache_key, None)
            cached = None

        if cached:
            _, body, headers, status_code, etag = cached
            inm = request.headers.get("if-none-match")
            if inm and etag and inm == etag:
                return Response(status_code=304)
            out_headers = dict(headers)
            if etag:
                out_headers["ETag"] = etag
            out_headers.setdefault(
                "Cache-Control", "private, max-age=2, stale-while-revalidate=5"
            )
            out_headers.setdefault("X-Poll-Interval", "2000")
            return Response(
                content=body,
                status_code=status_code,
                headers=out_headers,
                media_type=headers.get("content-type"),
            )

        response = await call_next(request)

        body = b""
        async for chunk in response.body_iterator:
            body += chunk

        headers = dict(response.headers)
        headers.setdefault("Vary", "Authorization, Cookie")

        ctype = headers.get("content-type", "")
        if response.status_code == 200 and ("application/json" in ctype):
            try:
                etag = 'W/"%s"' % hashlib.md5(body).hexdigest()
            except Exception:
                etag = ""
            if etag:
                headers["ETag"] = etag
            headers.setdefault(
                "Cache-Control", "private, max-age=1, stale-while-revalidate=5"
            )
            headers.setdefault("X-Poll-Interval", "1500")
            _http_cache_put(
                cache_key, (now, body, headers, response.status_code, etag)
            )

        return Response(
            content=body,
            status_code=response.status_code,
            headers=headers,
            media_type=response.media_type,
        )


def _cache_get(bucket: dict, key: int):
    ent = bucket.get(key)
    if not ent:
        return None
    ts, data, etag = ent
    if (time.time() - ts) <= _CHAT_CACHE_TTL:
        return data, etag
    return None


def _cache_set(bucket: dict, key: int, data):
    try:
        payload = json.dumps(data, ensure_ascii=False,
                             sort_keys=True, default=str)
    except Exception:
        payload = json.dumps({"_": "fallback"}, sort_keys=True)
    etag = 'W/"%s"' % hashlib.md5(payload.encode("utf-8")).hexdigest()
    bucket[key] = (time.time(), data, etag)
    return etag


def _can_save(kind: str, current_user: UserModel) -> bool:
    """
    kind: "order" | "transport"
    OWNER     -> можно сохранять транспорты
    TRANSPORT -> можно сохранять заказы
    MANAGER/EMPLOYEE/ADMIN -> можно всё
    """
    role_val = (getattr(current_user.role, "value",
                current_user.role) or "").upper()
    if role_val in ("ADMIN", "MANAGER", "EMPLOYEE"):
        return True
    if role_val == "OWNER" and kind == "transport":
        return True
    if role_val == "TRANSPORT" and kind == "order":
        return True
    return False


@app.get("/auth/whoami")
def whoami(current_user: UserModel = Depends(get_current_user)):
    role_val = getattr(current_user.role, "value", current_user.role)
    return {
        "id": getattr(current_user, "id", None),
        "email": getattr(current_user, "email", None),
        "role": str(role_val).upper()
    }


app.include_router(notifications_router)


start_scheduler()


# --- BILLING ---
# app.include_router(billing_router)

start_billing_scheduler()

# Sanity log — видно, подхватились ли ключи TBC
print("[TBC env] APIKEY:", bool(os.getenv("TBC_API_KEY")),
      "CLIENT_ID:", bool(os.getenv("TBC_CLIENT_ID")),
      "CLIENT_SECRET:", bool(os.getenv("TBC_CLIENT_SECRET")))

# Гибкий CORS: читаем список из ENV (CSV) или используем дефолты


def _split_csv(v: str) -> list[str]:
    return [x.strip() for x in (v or "").split(",") if x.strip()]


CORS_ORIGINS = _split_csv(os.getenv("ALLOWED_ORIGINS", "")) or [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://transinfo.ge",
    "https://www.transinfo.ge",
]
# Гарантируем, что текущий origin фронта тоже разрешён (значение берётся из ENV)
if FRONTEND_ORIGIN and FRONTEND_ORIGIN not in CORS_ORIGINS:
    CORS_ORIGINS.append(FRONTEND_ORIGIN)
# Разрешаем ЛЮБОЙ порт для локальных подсетей: 127.0.0.1, localhost, 192.168.x.x, 10.x.x.x
CORS_ORIGIN_REGEX = (
    r"^https?://("
    r"(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)"
    r"|([a-z0-9-]+\.)?transinfo\.ge"
    r")(?:[:]\d+)?$"
)

RANGE_CHUNK_SIZE = 1024 * 1024  # 1 MB


def ranged_file_response(request: Request, path: Path, content_type: str):
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404)

    file_size = path.stat().st_size
    range_header = request.headers.get("Range")

    # Полная отдача файла (без Range)
    if not range_header:
        headers = {"Accept-Ranges": "bytes", "Content-Length": str(file_size)}
        return FileResponse(path, media_type=content_type, headers=headers)

    m = re.match(r"bytes=(\d+)-(\d*)", range_header)
    if not m:
        raise HTTPException(
            status_code=416, detail="error.range.invalidHeader")

    start = int(m.group(1))
    end = int(m.group(2)) if m.group(2) else file_size - 1
    if start >= file_size:
        # Важно: корректный 416, иначе Chromium будет падать с ERR_REQUEST_RANGE_NOT_SATISFIABLE
        raise HTTPException(
            status_code=416, detail="error.range.notSatisfiable")

    def file_iterator():
        with open(path, "rb") as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = f.read(min(RANGE_CHUNK_SIZE, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(end - start + 1),
    }
    return StreamingResponse(file_iterator(), status_code=206, headers=headers, media_type=content_type)


app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    # важно: ЯВНО разрешаем клиентский trace-header
    allow_headers=["*", "X-Client-Trace-Id"],
    # и разрешаем читать trace-header из ответа
    expose_headers=["ETag", "X-Total-Count", "X-Page", "X-Page-Size",
                    "X-Trace-Id", "X-View-Mode", "X-Has-Full-Access"],
    max_age=86400,
)

# Catch-all OPTIONS для устойчивого preflight на локальных адресах


@app.options("/{rest_of_path:path}")
def _cors_ok(rest_of_path: str):
    # норм для preflight; в DevTools будет "Failed to load response data" — это ОК
    return Response(status_code=204)


# Подключаем роутеры с Range ДО монтирования общей статики
app.include_router(chat_files_router)
app.include_router(media_range_router)

# Раздаём статику из папки рядом с main.py (работает независимо от текущей рабочей директории)
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# --- Password reset (forgot/reset via email) ---
app.include_router(password_reset_router)


app.include_router(block_router)
app.include_router(contacts_router)

app.include_router(auth_router)
app.include_router(chat_upload_router)
app.include_router(chat_rest_router)
app.include_router(order_comments_router)
app.include_router(notification_router)
app.include_router(ws_chat_router)
app.include_router(support_router)
app.include_router(reviews_router)

app.include_router(geo_router)
app.include_router(places_router)

# === GPS Tracking Routes ===
tracking_router = APIRouter()


def _same_manager_account(db: Session, uid1: int, uid2: int) -> bool:
    u1 = db.query(UserModel).filter(UserModel.id == uid1).first()
    u2 = db.query(UserModel).filter(UserModel.id == uid2).first()
    if not u1 or not u2:
        return False

    def root_id(u):
        role = (getattr(u.role, "value", u.role) or "").upper()
        if role == "MANAGER":
            return u.id
        if role == "EMPLOYEE":
            return u.manager_id
        return None

    r1, r2 = root_id(u1), root_id(u2)
    return (r1 and r2 and r1 == r2)


def _can_request_gps_for_order(db: Session, user: UserModel, ord: OrderModel) -> bool:
    role = (getattr(user.role, "value", user.role) or "").upper()
    if role == "ADMIN":
        return True
    # Право запросить — все, кто может публиковать заявку груза:
    # MANAGER/EMPLOYEE — в рамках одного менеджер-аккаунта владельца заказа,
    # OWNER — только по своим заявкам.
    if role in ("MANAGER", "EMPLOYEE"):
        return _same_manager_account(db, user.id, ord.owner_id)
    if role == "OWNER":
        return user.id == ord.owner_id
    return False


def _can_share_from_session(db: Session, user, sess: TrackingSession) -> bool:
    # Разрешаем TRANSPORT / MANAGER / EMPLOYEE инициировать «адресный» шаринг,
    # если они владелец/создатель/драйвер или менеджер/админ.
    role = getattr(user.role, "name", None) if getattr(
        user, "role", None) else None
    if role not in ("TRANSPORT", "MANAGER", "EMPLOYEE", "ADMIN"):
        return False
    if user.id in (sess.created_by, sess.driver_id):
        return True
    # владелец транспорта
    if sess.transport_id:
        tr = db.query(TransportModel).filter(
            TransportModel.id == sess.transport_id).first()
        if tr and tr.owner_id == user.id:
            return True
    # владелец заказа
    if sess.order_id:
        ord = db.query(OrderModel).filter(
            OrderModel.id == sess.order_id).first()
        if ord and ord.owner_id == user.id:
            return True
    if role == "ADMIN":
        return True
    return False


def _can_view_tracking(db: Session, user, session):
    # private: creator, driver, transport owner, order owner
    if session.visibility == "link":
        return True
    uid = int(user.id)
    if session.created_by == uid or (session.driver_id and session.driver_id == uid):
        return True
    # transport owner
    if session.transport_id:
        tr = db.query(TransportModel).filter(
            TransportModel.id == session.transport_id).first()
        if tr and tr.owner_id == uid:
            return True
    # order owner
    if session.order_id:
        ord = db.query(OrderModel).filter(
            OrderModel.id == session.order_id).first()
        if ord and ord.owner_id == uid:
            return True
    return False


def _live_flag(db: Session, sess_id: str) -> bool:
    shares_cnt = db.query(TrackingShare).filter(
        TrackingShare.session_id == sess_id,
        TrackingShare.active == True
    ).count()
    link_cnt = len(link_watchers.get(str(sess_id), set()))
    return (shares_cnt > 0) or (link_cnt > 0)


async def _recalc_and_emit_live(db: Session, sess: TrackingSession):
    new = _live_flag(db, sess.id)
    prev = last_live_flag.get(str(sess.id))
    if new != prev:
        last_live_flag[str(sess.id)] = new
        kind = "live_start" if new else "live_end"
        if sess.transport_id:
            await _emit_transport_live_event(str(sess.transport_id), kind, str(sess.id))


@tracking_router.post("/track/sessions/{session_id}/share_link")
def create_public_share_link(
    session_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Создаёт (или возвращает существующую) публичную ссылку на live-просмотр.
    Использует встроенный share_token у TrackingSession и переводит видимость в 'link'.
    """
    sess = db.query(TrackingSession).filter(
        TrackingSession.id == session_id,
        TrackingSession.is_active == True
    ).first()
    if not sess:
        raise HTTPException(status_code=404, detail={
                            "code": "error.track.sessionNotFoundOrInactive", "message": "Сессия не найдена или неактивна"})
    if not _can_share_from_session(db, user, sess):
        raise HTTPException(status_code=403, detail={
                            "code": "error.forbidden", "message": "Доступ запрещён"})

    # Если токена ещё нет — создаём. Гарантируем visibility='link'
    if not getattr(sess, "share_token", None):
        sess.share_token = secrets.token_urlsafe(10)
    if getattr(sess, "visibility", None) != "link":
        sess.visibility = "link"
    db.commit()
    db.refresh(sess)

    return {
        "token": sess.share_token,
        # Фронт может открыть эту страницу и сам подключиться к WS:
        # ws: /ws/track/watch?session_id=<...>&share=<token>
        "url": f"{FRONTEND_ORIGIN}/track/link/{sess.share_token}",
        "expires_at": None,
        "revoked": False
    }


@tracking_router.get("/track/share_link/{token}")
def resolve_public_share_link(
    token: str,
    db: Session = Depends(get_db),
):
    """
    Резолвит публичную ссылку: даёт session_id и сам share-токен.
    Авторизация не требуется — достаточно валидного токена и активной сессии.
    """
    sess = db.query(TrackingSession).filter(
        TrackingSession.share_token == token,
        TrackingSession.is_active == True
    ).first()
    if not sess:
        # Можно вернуть 410, если хочешь различать "истёкло" и "не найдено"
        raise HTTPException(
            status_code=404,
            detail={"code": "error.track.linkInvalidOrEnded",
                    "message": "Неверная ссылка или сессия завершена"}
        )
    return {
        "session_id": str(sess.id),
        "transport_id": str(sess.transport_id) if sess.transport_id else None,
        # Подключение к WS без логина:
        #   /ws/track/watch?session_id=<...>&share=<token>
        "share": token
    }


@tracking_router.post("/track/sessions/{session_id}/revoke_share")
async def revoke_public_share_link(
    session_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Отзывает публичную ссылку: удаляет share_token, переводит видимость в 'private',
    разрывает все активные link-зрители и пересчитывает LIVE.
    """
    sess = db.query(TrackingSession).filter(
        TrackingSession.id == session_id).first()
    if not sess:
        raise HTTPException(status_code=404, detail={
                            "code": "error.track.sessionNotFound", "message": "Сессия не найдена"})
    # Разрешаем отзывать только тем, кто мог бы делиться из этой сессии
    if not _can_share_from_session(db, user, sess):
        raise HTTPException(status_code=403, detail={
                            "code": "error.forbidden", "message": "Доступ запрещён"})
    # Сбрасываем публичную ссылку
    sess.share_token = None
    if sess.visibility == "link":
        sess.visibility = "private"
    db.commit()
    # Закрываем всех текущих зрителей публичной ссылки
    for ws in list(link_watchers.get(str(sess.id), set())):
        try:
            await ws.close(code=4401)
        except:
            pass
    link_watchers[str(sess.id)].clear()
    link_watchers.pop(str(sess.id), None)
    # Пересчитать live и, при необходимости, отправить live_end
    await _recalc_and_emit_live(db, sess)
    return {"ok": True}


@tracking_router.post("/track/sessions", response_model=schemas.TrackingSessionOut)
def create_tracking_session(
    payload: schemas.TrackingSessionCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    driver_id = None
    if payload.transport_id:
        tr = db.query(TransportModel).filter(
            TransportModel.id == payload.transport_id).first()
        if not tr:
            raise HTTPException(status_code=404, detail={
                                "code": "error.transport.notFound", "message": "Транспорт не найден"})
        if tr.owner_id != user.id and (getattr(user.role, "value", user.role) or "").upper() not in ("MANAGER", "ADMIN"):
            raise HTTPException(status_code=403, detail={"code": "error.track.onlyOwnerOrManagerTransport",
                                "message": "Только владелец или менеджер может запустить мониторинг для транспорта"})
        driver_id = tr.owner_id
    if payload.order_id:
        ord = db.query(OrderModel).filter(
            OrderModel.id == payload.order_id).first()
        if not ord:
            raise HTTPException(status_code=404, detail={
                                "code": "error.order.notFound", "message": "Заявка не найдена"})
        if ord.owner_id != user.id and (getattr(user.role, "value", user.role) or "").upper() not in ("MANAGER", "ADMIN"):
            raise HTTPException(status_code=403, detail={"code": "error.track.onlyOwnerOrManagerOrder",
                                "message": "Только владелец или менеджер может запустить мониторинг для заявки"})

    share_token = None
    if (payload.visibility or "private") == "link":
        share_token = secrets.token_urlsafe(10)

    sess = TrackingSession(
        order_id=payload.order_id,
        transport_id=payload.transport_id,
        created_by=user.id,
        driver_id=driver_id or user.id,
        visibility=payload.visibility or "private",
        share_token=share_token,
        is_active=True,
    )
    db.add(sess)
    db.commit()
    db.refresh(sess)
    # оповестим карточки транспорта

    return sess


@tracking_router.post("/track/sessions/{session_id}/end")
def end_tracking_session(
    session_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    sess = db.query(TrackingSession).filter(
        TrackingSession.id == session_id).first()
    if not sess:
        raise HTTPException(status_code=404, detail={
                            "code": "error.track.sessionNotFound", "message": "Сессия не найдена"})
    if sess.created_by != user.id and user.role.name not in ("MANAGER", "ADMIN"):
        raise HTTPException(403, "Only creator or manager can end session")
    sess.is_active = False
    sess.ended_at = datetime.utcnow()
    # мягко выключим все адресные шаринги этой сессии
    for sh in db.query(TrackingShare).filter(TrackingShare.session_id == session_id, TrackingShare.active == True):
        sh.active = False
        sh.stopped_at = datetime.utcnow()
    db.commit()
    # уведомим подписчиков сессии и карточки транспорта + персональные unshare
    try:
        import asyncio
        asyncio.create_task(_emit_share_event(sess, "end"))
        # персональные входящие/исходящие unshare всем получателям этой сессии
        r_users = db.query(UserModel).join(
            TrackingShare, TrackingShare.recipient_user_id == UserModel.id
        ).filter(TrackingShare.session_id == session_id).all()
        for r in r_users:
            asyncio.create_task(_emit_share_event(sess, "incoming_unshare", r))
            asyncio.create_task(_emit_share_event(sess, "outgoing_unshare", r))
        if sess.transport_id:
            asyncio.create_task(_emit_transport_live_event(
                str(sess.transport_id), "live_end", str(sess.id)))
    except Exception:
        pass
    return {"ok": True}


@tracking_router.get("/track/sessions/{session_id}/shares", response_model=List[schemas.TrackingShareRecipientOut])
def get_session_shares(
    session_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    sess = db.query(TrackingSession).filter(TrackingSession.id ==
                                            session_id, TrackingSession.is_active == True).first()
    if not sess:
        raise HTTPException(status_code=404, detail={
                            "code": "error.track.sessionNotFoundOrInactive", "message": "Сессия не найдена или неактивна"})
    # смотреть список получателей может автор/драйвер/владельцы объекта/менеджер/админ
    if not _can_share_from_session(db, user, sess):
        raise HTTPException(status_code=403, detail={
                            "code": "error.forbidden", "message": "Доступ запрещён"})
    rows = db.query(TrackingShare, UserModel)\
        .join(UserModel, UserModel.id == TrackingShare.recipient_user_id)\
        .filter(TrackingShare.session_id == session_id, TrackingShare.active == True)\
        .order_by(TrackingShare.created_at.asc()).all()
    out = []
    for sh, u in rows:
        out.append({
            "user_id": u.id,
            "user_name": getattr(u, "name", None) or getattr(u, "email", None),
            "created_at": sh.created_at
        })
    return out


@tracking_router.get("/track/sessions/{session_id}", response_model=schemas.TrackingSessionOut)
def get_session(session_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    sess = db.query(TrackingSession).filter(
        TrackingSession.id == session_id).first()
    if not sess:
        raise HTTPException(404, "Not found")
    if not _can_view_tracking(db, user, sess):
        raise HTTPException(status_code=403, detail={
                            "code": "error.forbidden", "message": "Доступ запрещён"})
    return sess


@tracking_router.get("/track/for_order/{order_id}", response_model=Optional[schemas.TrackingSessionOut])
def get_session_for_order(order_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    sess = db.query(TrackingSession).filter(
        TrackingSession.order_id == order_id,
        TrackingSession.is_active == True
    ).order_by(TrackingSession.started_at.desc()).first()
    if not sess:
        return None
    if not _can_view_tracking(db, user, sess):
        raise HTTPException(status_code=403, detail={
                            "code": "error.forbidden", "message": "Доступ запрещён"})
    return sess


@tracking_router.get("/track/for_transport/{transport_id}", response_model=Optional[schemas.TrackingSessionOut])
def get_session_for_transport(transport_id: str, db: Session = Depends(get_db), user=Depends(get_current_user)):
    sess = db.query(TrackingSession).filter(
        TrackingSession.transport_id == transport_id,
        TrackingSession.is_active == True
    ).order_by(TrackingSession.started_at.desc()).first()
    if not sess:
        return None
    if not _can_view_tracking(db, user, sess):
        raise HTTPException(status_code=403, detail={
                            "code": "error.forbidden", "message": "Доступ запрещён"})
    return sess


@tracking_router.get("/track/sessions/{session_id}/points", response_model=List[schemas.TrackingPointOut])
def get_points(
    session_id: str,
    since: Optional[datetime] = None,
    limit: int = 500,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    sess = db.query(TrackingSession).filter(
        TrackingSession.id == session_id).first()
    if not sess:
        raise HTTPException(status_code=404, detail={
                            "code": "error.track.sessionNotFound", "message": "Сессия не найдена"})
    if not _can_view_tracking(db, user, sess):
        raise HTTPException(status_code=403, detail={
                            "code": "error.forbidden", "message": "Доступ запрещён"})
    q = db.query(TrackingPoint).filter(TrackingPoint.session_id == session_id)
    if since:
        q = q.filter(TrackingPoint.ts >= since)
    pts = q.order_by(TrackingPoint.ts.asc()).limit(min(limit, 5000)).all()
    return [
        {
            "lat": p.lat, "lng": p.lng, "ts": p.ts,
            "speed": p.speed, "heading": p.heading, "accuracy": p.accuracy, "battery": p.battery
        }
        for p in pts
    ]


@ws_router.websocket("/ws/track/transport_live")
async def ws_transport_live(
    websocket: WebSocket,
    transport_id: str = Query(...),
    token: str = Query(...)
):
    db = SessionLocal()
    try:
        await websocket.accept()
        # простая аутентификация (этот канал не раскрывает приватных координат)
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        uid = int(payload.get("user_id") or payload.get("sub"))
        user = db.query(UserModel).filter(UserModel.id == uid).first()
        if not user:
            await websocket.close(code=4401)
            return

        # подписываем
        transport_live_watchers[str(transport_id)].add(websocket)

        # моментальный снапшот: есть ли активная сессия для транспорта
        sess = db.query(TrackingSession).filter(
            TrackingSession.transport_id == transport_id,
            TrackingSession.is_active == True
        ).order_by(TrackingSession.started_at.desc()).first()

        shares_cnt = 0
        link_cnt = 0
        if sess:
            shares_cnt = db.query(TrackingShare).filter(
                TrackingShare.session_id == sess.id,
                TrackingShare.active == True
            ).count()
            link_cnt = len(link_watchers.get(str(sess.id), set()))
        # Первая отправка снапшота: тихо выходим, если клиент уже закрылся
        try:
            await websocket.send_json({
                "type": "snapshot",
                "live": bool(sess and (shares_cnt > 0 or link_cnt > 0)),
                "session_id": str(sess.id) if sess else None
            })
        except WebSocketDisconnect:
            return
        except Exception as e:
            logger.warning("ws_transport_live snapshot send failed: %r", e)
            return

        # держим соединение (входящие не ждём)
        while True:
            try:
                _ = await websocket.receive_text()
            except Exception:
                break
    finally:
        try:
            key = str(transport_id)
            bucket = transport_live_watchers.get(key)
            if bucket is not None:
                bucket.discard(websocket)
                if not bucket:
                    transport_live_watchers.pop(key, None)
        except Exception:
            pass
        db.close()


async def _emit_transport_live_event(transport_id: str, kind: str, session_id: str):
    # kind: 'live_start' | 'live_end'
    payload = {"type": kind, "transport_id": str(
        transport_id), "session_id": str(session_id)}
    key = str(transport_id)
    dead = []
    for ws in list(transport_live_watchers.get(key, set())):
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    if dead:
        bucket = transport_live_watchers.get(key)
        if bucket is not None:
            for ws in dead:
                bucket.discard(ws)
            if not bucket:
                transport_live_watchers.pop(key, None)

# Кто смотрит список получателей по сессии
share_session_watchers = defaultdict(set)   # session_id -> set[WebSocket]
# Персональные подписчики (id пользователя)
share_user_watchers = defaultdict(set)      # user_id    -> set[WebSocket]


@ws_router.websocket("/ws/track/shares_session")
async def ws_shares_session(
    websocket: WebSocket,
    session_id: str = Query(...),
    token: str = Query(...)
):
    db = SessionLocal()
    try:
        await websocket.accept()
        # аутентификация
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        uid = int(payload.get("user_id") or payload.get("sub"))
        user = db.query(UserModel).filter(UserModel.id == uid).first()

        sess = db.query(TrackingSession).filter(
            TrackingSession.id == session_id,
            TrackingSession.is_active == True
        ).first()
        if not user or not sess or not _can_share_from_session(db, user, sess):
            await websocket.close(code=4403)
            return

        # добавить в пул
        share_session_watchers[str(session_id)].add(websocket)

        # отправить снимок текущих получателей
        rows = db.query(TrackingShare, UserModel)\
            .join(UserModel, UserModel.id == TrackingShare.recipient_user_id)\
            .filter(TrackingShare.session_id == session_id, TrackingShare.active == True)\
            .order_by(TrackingShare.created_at.asc())\
            .all()
        try:
            await websocket.send_json({
                "type": "snapshot",
                "session_id": str(session_id),
                "recipients": [
                    {
                        "user_id": u.id,
                        "user_name": getattr(u, "name", None) or getattr(u, "email", None),
                        "created_at": sh.created_at.isoformat()
                    } for sh, u in rows
                ]
            })
        except WebSocketDisconnect:
            return
        except Exception as e:
            logger.warning("ws_shares_session snapshot send failed: %r", e)
            return

        # держим соединение
        while True:
            try:
                _ = await websocket.receive_text()  # не ожидаем входящих
            except Exception:
                break
    finally:
        try:
            share_session_watchers[str(session_id)].discard(websocket)
        except:
            pass
        db.close()


@ws_router.websocket("/ws/track/shares_user")
async def ws_shares_user(
    websocket: WebSocket,
    token: str = Query(...)
):
    db = SessionLocal()
    try:
        await websocket.accept()
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        uid = int(payload.get("user_id") or payload.get("sub"))
        user = db.query(UserModel).filter(UserModel.id == uid).first()
        if not user:
            await websocket.close(code=4401)
            return

        share_user_watchers[uid].add(websocket)
        # По желанию можно послать привет или снапшот, но REST-инициализация уже есть
        await websocket.send_json({"type": "hello", "user_id": uid})

        while True:
            try:
                _ = await websocket.receive_text()
            except Exception:
                break
    finally:
        try:
            share_user_watchers[uid].discard(websocket)
        except:
            pass
        db.close()


async def _emit_share_event(session: TrackingSession, kind: str, recipient: UserModel = None):
    """
    kind: 'share' | 'unshare' | 'end' (для session watchers)
          'incoming_share' | 'incoming_unshare'
          'outgoing_share' | 'outgoing_unshare'
    """
    sender_id = int(getattr(session, "created_by", 0) or 0)
    data_base = {
        "type": kind,
        "session": {
            "id": str(session.id),
            "order_id": session.order_id,
            "transport_id": str(session.transport_id) if session.transport_id else None,
            "is_active": bool(session.is_active),
            "last_point_at": session.last_point_at.isoformat() if session.last_point_at else None
        },
        # важно для фронта, чтобы корректно удалять карточки
        **({"from_user_id": sender_id} if sender_id else {})
    }

    # Рассылка подписчикам сессии
    if kind in ("share", "unshare", "end"):
        key = str(session.id)
        dead = []
        for ws in list(share_session_watchers.get(key, set())):
            try:
                payload = dict(data_base)
                if recipient is not None:
                    payload.update({
                        "recipient_user_id": recipient.id,
                        "recipient_user_name": getattr(recipient, "name", None) or getattr(recipient, "email", None)
                    })
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        if dead:
            bucket = share_session_watchers.get(key)
            if bucket is not None:
                for ws in dead:
                    bucket.discard(ws)
                if not bucket:
                    share_session_watchers.pop(key, None)

    # Персональные рассылки
    # входящая сторона (получатель)
    if kind in ("incoming_share", "incoming_unshare") and recipient is not None:
        key = int(recipient.id)
        dead = []
        for ws in list(share_user_watchers.get(key, set())):
            try:
                payload = dict(data_base)
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        if dead:
            bucket = share_user_watchers.get(key)
            if bucket is not None:
                for ws in dead:
                    bucket.discard(ws)
                if not bucket:
                    share_user_watchers.pop(key, None)

    # исходящая сторона (создатель сессии)
    if kind in ("outgoing_share", "outgoing_unshare"):
        creator_id = session.created_by
        if creator_id:
            key = int(creator_id)
            dead = []
            for ws in list(share_user_watchers.get(key, set())):
                try:
                    payload = dict(data_base)
                    await ws.send_json(payload)
                except Exception:
                    dead.append(ws)
            if dead:
                bucket = share_user_watchers.get(key)
                if bucket is not None:
                    for ws in dead:
                        bucket.discard(ws)
                    if not bucket:
                        share_user_watchers.pop(key, None)

# === WebSockets for tracking ===
track_watchers = defaultdict(set)  # session_id -> set[WebSocket]


@ws_router.websocket("/ws/track/watch")
async def track_watch(
    websocket: WebSocket,
    session_id: str = Query(...),
    token: Optional[str] = Query(None),
    share: Optional[str] = Query(None),
):
    db = SessionLocal()
    try:
        await websocket.accept()
        sess = db.query(TrackingSession).filter(
            TrackingSession.id == session_id).first()
        if not sess:
            await websocket.close(code=4404)
            return

        if share:
            if not (sess.share_token and secrets.compare_digest(sess.share_token, share)):
                await websocket.close(code=4403)
                return
        else:
            if not token:
                await websocket.close(code=4401)
                return
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("user_id") or payload.get("sub")
            user = db.query(UserModel).filter(
                UserModel.id == int(user_id)).first()
            if not user or not _can_view_tracking(db, user, sess):
                await websocket.close(code=4403)
                return

        track_watchers[str(session_id)].add(websocket)

        # Если подключились по публичной ссылке — учитываем как live-зрителя
        if share:
            link_watchers[str(session_id)].add(websocket)
            # Кто-то открыл ссылку — пересчитываем и, если надо, шлём live_start
            await _recalc_and_emit_live(db, sess)

        pts = db.query(TrackingPoint).filter(TrackingPoint.session_id == session_id)\
            .order_by(TrackingPoint.ts.asc()).limit(1000).all()
        try:
            await websocket.send_json({
                "type": "batch",
                "session_id": str(session_id),
                "points": [
                    {"lat": p.lat, "lng": p.lng, "ts": p.ts.isoformat(),
                     "speed": p.speed, "heading": p.heading, "accuracy": p.accuracy}
                    for p in pts
                ]
            })
        except WebSocketDisconnect:
            return
        except Exception as e:
            logger.warning("track_watch batch send failed: %r", e)
            return

        while True:
            try:
                _ = await websocket.receive_text()  # игнорим входящие от watcher
            except Exception:
                break
    finally:
        try:
            track_watchers[str(session_id)].discard(websocket)
        except:
            pass
        try:
            if share:
                # Зритель закрыл ссылку — вычтем и пересчитаем live (возможен live_end)
                link_watchers[str(session_id)].discard(websocket)
                await _recalc_and_emit_live(db, sess)
        finally:
            db.close()


@ws_router.websocket("/ws/track/publish")
async def track_publish(
    websocket: WebSocket,
    session_id: str = Query(...),
    token: str = Query(...),
):
    db = SessionLocal()
    try:
        await websocket.accept()
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id") or payload.get("sub")
        user = db.query(UserModel).filter(UserModel.id == int(user_id)).first()
        sess = db.query(TrackingSession).filter(
            TrackingSession.id == session_id, TrackingSession.is_active == True).first()
        if not user or not sess:
            await websocket.close(code=4401)
            return
        if user.id not in [sess.driver_id, sess.created_by] and user.role.name not in ("MANAGER", "ADMIN"):
            await websocket.close(code=4403)
            return

        while True:
            msg = await websocket.receive_json()
            if msg.get("type") in ("ping", "init"):
                continue
            if msg.get("type") == "point":
                p = TrackingPoint(
                    session_id=session_id,
                    ts=datetime.fromisoformat(msg.get("ts").replace(
                        "Z", "")) if msg.get("ts") else datetime.utcnow(),
                    lat=float(msg["lat"]),
                    lng=float(msg["lng"]),
                    speed=float(msg.get("speed")) if msg.get(
                        "speed") is not None else None,
                    heading=float(msg.get("heading")) if msg.get(
                        "heading") is not None else None,
                    accuracy=float(msg.get("accuracy")) if msg.get(
                        "accuracy") is not None else None,
                    source="device",
                )
                db.add(p)
                sess.last_point_at = p.ts
                db.commit()

                dead = []
                key = str(session_id)
                dead = []
                for ws in list(track_watchers.get(key, set())):
                    try:
                        await ws.send_json({
                            "type": "point",
                            "session_id": key,
                            "point": {
                                "lat": p.lat,
                                "lng": p.lng,
                                "ts": p.ts.isoformat(),
                                "speed": p.speed,
                                "heading": p.heading,
                                "accuracy": p.accuracy,
                            },
                        })
                    except Exception:
                        dead.append(ws)
                if dead:
                    bucket = track_watchers.get(key)
                    if bucket is not None:
                        for ws in dead:
                            bucket.discard(ws)
                        if not bucket:
                            track_watchers.pop(key, None)
    finally:
        db.close()

app.include_router(ws_router)


@tracking_router.post("/track/sessions/{session_id}/share", response_model=List[schemas.TrackingShareOut])
async def share_tracking_session(
    session_id: str,
    payload: schemas.TrackingShareCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    sess = db.query(TrackingSession).filter(TrackingSession.id ==
                                            session_id, TrackingSession.is_active == True).first()
    if not sess:
        raise HTTPException(status_code=404, detail={
                            "code": "error.track.sessionNotFoundOrInactive", "message": "Сессия не найдена или неактивна"})
    if not _can_share_from_session(db, user, sess):
        raise HTTPException(status_code=403, detail={
                            "code": "error.forbidden", "message": "Доступ запрещён"})

    if not payload.recipient_ids:
        raise HTTPException(status_code=400, detail={
                            "code": "error.track.emptyRecipients", "message": "Список получателей пуст"})

        # было ли до этого 0 активных получателей?
    before_cnt = db.query(TrackingShare).filter(
        TrackingShare.session_id == session_id,
        TrackingShare.active == True
    ).count()
    created = []
    for rid in payload.recipient_ids:
        if int(rid) == int(user.id):
            continue
        r = db.query(UserModel).filter(UserModel.id == rid).first()
        if not r:
            continue
        r_role = getattr(r.role, "name", None) if getattr(
            r, "role", None) else None
        # запрещаем принимать TRANSPORT
        if r_role == "TRANSPORT":
            continue

        # если уже есть активная запись — пропустим
        existing = db.query(TrackingShare).filter(
            TrackingShare.session_id == session_id,
            TrackingShare.recipient_user_id == rid,
            TrackingShare.active == True
        ).first()
        if existing:
            continue

        sh = TrackingShare(
            session_id=session_id, recipient_user_id=rid, created_by=user.id, active=True)
        db.add(sh)
        db.flush()
        created.append(sh)

    db.commit()

    # WS-события (этот хендлер async — шлём напрямую)
    for s in created:
        r = db.query(UserModel).filter(
            UserModel.id == s.recipient_user_id).first()
        await _emit_share_event(sess, "share", r)
        await _emit_share_event(sess, "incoming_share", r)
        await _emit_share_event(sess, "outgoing_share", r)
    # Пересчитать и, при необходимости, разослать live_start
    await _recalc_and_emit_live(db, sess)

    # Системные уведомления получателям: кто поделился
    try:
        from notifications import create_notification, NotificationType, push_notification
        import json
        who = (getattr(user, "name", None) or getattr(user, "email", None))
        ru_title = (f"С вами поделились GPS по грузу №{sess.order_id}" if sess.order_id
                    else "С вами поделились GPS-мониторингом")
        params = json.dumps(
            {"orderId": sess.order_id, "by": who}, ensure_ascii=False)
        msg = f"notif.gps.sharedToYou|{params}|{ru_title} (от {who})"
        for s in created:
            create_notification(
                db,
                s.recipient_user_id,
                NotificationType.SYSTEM,
                msg,
                related_id=str(sess.order_id or sess.id)
            )
            # необязательно, но приятно — пушим персональный сигнал
            await push_notification(s.recipient_user_id, {
                "type": "GPS_SHARED_TO_YOU",
                "payload": {
                    "session_id": str(sess.id),
                    "order_id": sess.order_id,
                    "from_user_id": user.id,
                    "from_user_name": who
                }
            })
    except Exception:
        pass

    return [{
        "id": s.id,
        "session_id": s.session_id,
        "recipient_user_id": s.recipient_user_id,
        "active": s.active,
        "created_at": s.created_at,
    } for s in created]


@tracking_router.post("/track/sessions/{session_id}/unshare")
async def unshare_tracking_session(
    session_id: str,
    recipient_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    sess = db.query(TrackingSession).filter(
        TrackingSession.id == session_id).first()
    if not sess:
        raise HTTPException(status_code=404, detail={
                            "code": "error.track.sessionNotFound", "message": "Сессия не найдена"})
    # Allow two cases:
    # 1) Creator/owner/manager/etc. can unshare for any recipients (existing behaviour)
    # 2) The recipient themselves may stop receiving this session for themselves only
    can_control = _can_share_from_session(db, user, sess)
    if not can_control:
        # Check if current user is an active recipient of this session
        is_recipient = db.query(TrackingShare).filter(
            TrackingShare.session_id == session_id,
            TrackingShare.recipient_user_id == int(user.id),
            TrackingShare.active == True
        ).first() is not None
        if not is_recipient:
            raise HTTPException(status_code=403, detail={
                                "code": "error.forbidden", "message": "Доступ запрещён"})
        # Force scope to current user only; ignore arbitrary recipient_id
        recipient_id = int(user.id)

    q = db.query(TrackingShare).filter(TrackingShare.session_id ==
                                       session_id, TrackingShare.active == True)
    if recipient_id:
        q = q.filter(TrackingShare.recipient_user_id == int(recipient_id))
    cnt = 0
    for s in q.all():
        s.active = False
        s.stopped_at = datetime.utcnow()
        cnt += 1
    db.commit()

    # WS-события (для всех снятых)
    recips = db.query(TrackingShare.recipient_user_id).filter(
        TrackingShare.session_id == session_id,
        TrackingShare.stopped_at != None
    ).all()
    r_users = db.query(UserModel).filter(
        UserModel.id.in_([r[0] for r in recips])).all()
    for r in r_users:
        await _emit_share_event(sess, "unshare", r)
        await _emit_share_event(sess, "incoming_unshare", r)
        await _emit_share_event(sess, "outgoing_unshare", r)
    # Пересчёт и рассылка live_end, если никого не осталось
    await _recalc_and_emit_live(db, sess)

    return {"ok": True, "count": cnt}


@tracking_router.get("/track/transport_live_state/{transport_id}")
def transport_live_state(
    transport_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    sess = db.query(TrackingSession).filter(
        TrackingSession.transport_id == transport_id,
        TrackingSession.is_active == True
    ).order_by(TrackingSession.started_at.desc()).first()
    if not sess:
        return {"live": False, "session_id": None}
    if not _can_view_tracking(db, user, sess):
        raise HTTPException(status_code=403, detail={
                            "code": "error.forbidden", "message": "Доступ запрещён"})
    cnt = db.query(TrackingShare).filter(
        TrackingShare.session_id == sess.id,
        TrackingShare.active == True
    ).count()
    return {"live": cnt > 0, "session_id": str(sess.id)}


@tracking_router.get("/track/incoming", response_model=List[schemas.IncomingShareItem])
def incoming_shares(db: Session = Depends(get_db), user=Depends(get_current_user)):
    shares = db.query(TrackingShare, TrackingSession).join(
        TrackingSession, TrackingSession.id == TrackingShare.session_id
    ).filter(
        TrackingShare.recipient_user_id == user.id,
        TrackingShare.active == True,
        TrackingSession.is_active == True
    ).order_by(TrackingShare.created_at.desc()).all()

    out = []
    for sh, sess in shares:
        u = db.query(UserModel).filter(UserModel.id == (
            sess.created_by or sh.created_by)).first()
        out.append({
            "session": sess,
            "from_user_id": (sess.created_by or sh.created_by),
            "from_user_name": getattr(u, "name", None) or getattr(u, "email", None),
            "transport_id": sess.transport_id,
            "order_id": sess.order_id,
            "last_point_at": sess.last_point_at,
        })
    return out


@tracking_router.get("/track/outgoing", response_model=List[schemas.OutgoingShareItem])
def outgoing_shares(db: Session = Depends(get_db), user=Depends(get_current_user)):
    # Активные шаринги только по тем сессиям, где текущий пользователь — владелец
    uid = int(user.id)

    rows = db.query(TrackingShare, TrackingSession, UserModel) \
        .join(TrackingSession, TrackingSession.id == TrackingShare.session_id) \
        .join(UserModel, UserModel.id == TrackingShare.recipient_user_id) \
        .outerjoin(TransportModel, TransportModel.id == TrackingSession.transport_id) \
        .outerjoin(OrderModel,     OrderModel.id == TrackingSession.order_id) \
        .filter(
            TrackingShare.active == True,
            TrackingSession.is_active == True,
            or_(
                and_(TrackingSession.transport_id != None,
                     TransportModel.owner_id == uid),
                and_(TrackingSession.order_id != None,
                     OrderModel.owner_id == uid),
            )
    ) \
        .order_by(TrackingShare.created_at.desc()) \
        .all()

    out = []
    for sh, sess, u in rows:
        out.append({
            "session": sess,
            "to_user_id": u.id,
            "to_user_name": getattr(u, "name", None) or getattr(u, "email", None),
            "transport_id": sess.transport_id,
            "order_id": sess.order_id,
            "last_point_at": sess.last_point_at,
        })
    return out


# --- маршруты трекинга (sessions/shares/requests) объявлены ниже ---
@tracking_router.post("/track/requests", response_model=List[schemas.TrackingRequestOut])
def create_tracking_requests(
    payload: schemas.TrackingRequestCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    ord = None
    if payload.order_id:
        ord = db.query(OrderModel).filter(
            OrderModel.id == payload.order_id).first()
        if not ord:
            raise HTTPException(status_code=404, detail={
                                "code": "error.order.notFound", "message": "Заявка не найдена"})
        if not _can_request_gps_for_order(db, user, ord):
            raise HTTPException(status_code=403, detail={
                                "code": "error.forbidden", "message": "Доступ запрещён"})
    if not payload.target_ids:
        raise HTTPException(400, "Empty target_ids")

    created = []
    for tid in payload.target_ids:
        tu = db.query(UserModel).filter(UserModel.id == tid).first()
        if not tu or tu.id == user.id:
            continue  # не отправляем себе и несуществующим
        req = TrackingRequest(
            order_id=(ord.id if ord else None),
            requester_user_id=user.id,
            target_user_id=tu.id,
            status=TrackingRequestStatus.PENDING,
            message=(payload.message or None),
        )
        db.add(req)
        db.commit()
        db.refresh(req)

        # Уведомление адресату
        try:
            from notifications import create_notification, NotificationType, push_notification
            import json
            who = (getattr(user, "name", None) or getattr(user, "email", None))
            ru_title = (
                f"Запрос GPS по грузу №{ord.id}" if ord else "Запрос GPS-мониторинга")
            params = json.dumps(
                {"orderId": (ord.id if ord else None), "by": who}, ensure_ascii=False)
            msg = f"notif.gps.requestCreated|{params}|{ru_title} от {who}"
            create_notification(
                db, tu.id, NotificationType.SYSTEM, msg, related_id=str(req.id))
            import asyncio
            asyncio.create_task(push_notification(tu.id, {
                "type": "GPS_REQUEST_CREATED",
                "payload": {
                    "id": req.id,
                    "order_id": (ord.id if ord else None),
                    "from_user_id": user.id,
                    "from_user_name": getattr(user, "name", None) or getattr(user, "email", None),
                    "message": req.message,
                    "created_at": req.created_at.isoformat() if getattr(req, "created_at", None) else None
                }
            }))
        except Exception:
            pass

        created.append(req)

    return created


def _cleanup_tracking_requests_limit_100(db: Session, *, user_id: int) -> None:
    """
    Держим не больше 100 последних запросов на пользователя.
    - по исходящим: requester_user_id = user_id
    - по входящим:  target_user_id   = user_id
    Удаляем всё, что выходит за пределы топ-100 по created_at DESC.
    """
    # Исходящие
    sub_out = db.query(TrackingRequest.id)\
        .filter(TrackingRequest.requester_user_id == user_id)\
        .order_by(TrackingRequest.created_at.desc())\
        .offset(100).subquery()
    db.query(TrackingRequest).filter(TrackingRequest.id.in_(
        sub_out)).delete(synchronize_session=False)
    # Входящие
    sub_in = db.query(TrackingRequest.id)\
        .filter(TrackingRequest.target_user_id == user_id)\
        .order_by(TrackingRequest.created_at.desc())\
        .offset(100).subquery()
    db.query(TrackingRequest).filter(TrackingRequest.id.in_(
        sub_in)).delete(synchronize_session=False)
    db.commit()


@tracking_router.get("/track/requests/incoming", response_model=List[schemas.IncomingRequestItem])
def list_incoming_requests(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    _cleanup_tracking_requests_limit_100(db, user_id=user.id)
    q = db.query(TrackingRequest).filter(
        TrackingRequest.target_user_id == user.id,
        TrackingRequest.status == TrackingRequestStatus.PENDING
    ).order_by(TrackingRequest.created_at.desc())
    rows = q.limit(size).offset((page - 1) * size).all()
    out = []
    for r in rows:
        from_u = db.query(UserModel).filter(
            UserModel.id == r.requester_user_id).first()
        out.append({
            "request": r,
            "from_user_name": getattr(from_u, "name", None) or getattr(from_u, "email", None),
            "from_user_id": getattr(from_u, "id", None),
        })
    return out


@tracking_router.get("/track/requests/outgoing", response_model=List[schemas.OutgoingRequestItem])
def list_outgoing_requests(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    _cleanup_tracking_requests_limit_100(db, user_id=user.id)
    q = db.query(TrackingRequest).filter(
        TrackingRequest.requester_user_id == user.id
    ).order_by(TrackingRequest.created_at.desc())
    rows = q.limit(size).offset((page - 1) * size).all()

    out = []
    for r in rows:
        to_u = db.query(UserModel).filter(
            UserModel.id == r.target_user_id).first()
        out.append({"request": r, "to_user_name": getattr(
            to_u, "name", None) or getattr(to_u, "email", None)})
    return out


@tracking_router.post("/track/requests/{request_id}/respond", response_model=schemas.TrackingRequestOut)
def respond_request(
    request_id: int,
    payload: schemas.TrackingRequestRespond,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    req = db.query(TrackingRequest).filter(
        TrackingRequest.id == request_id).first()
    if not req:
        raise HTTPException(404, "Not found")
    if req.target_user_id != user.id:
        raise HTTPException(status_code=403, detail={
                            "code": "error.forbidden", "message": "Доступ запрещён"})
    if req.status != TrackingRequestStatus.PENDING:
        return req

    if payload.accept:
        # создать (или найти) активную сессию по этому грузу от текущего пользователя
        sess = db.query(TrackingSession).filter(
            TrackingSession.order_id == req.order_id,
            TrackingSession.is_active == True,
            TrackingSession.created_by == user.id
        ).order_by(TrackingSession.started_at.desc()).first()

        if not sess:
            sess = TrackingSession(
                order_id=req.order_id,
                created_by=user.id,
                driver_id=user.id,
                visibility="private",
                is_active=True,
            )
            db.add(sess)
            db.commit()
            db.refresh(sess)

        # выдать доступ инициатору запроса
        already = db.query(TrackingShare).filter(
            TrackingShare.session_id == sess.id,
            TrackingShare.recipient_user_id == req.requester_user_id,
            TrackingShare.active == True
        ).first()
        if not already:
            sh = TrackingShare(
                session_id=sess.id,
                recipient_user_id=req.requester_user_id,
                created_by=user.id,
                active=True,
            )
            db.add(sh)
            db.commit()

        req.status = TrackingRequestStatus.ACCEPTED
        req.session_id = sess.id
    else:
        req.status = TrackingRequestStatus.DECLINED

    req.responded_at = datetime.utcnow()
    db.commit()
    db.refresh(req)

    # Уведомление инициатору
    try:
        from notifications import create_notification, NotificationType, push_notification
        me = (getattr(user, "name", None) or getattr(user, "email", None))
        import json
        if payload.accept:
            ru_title = (f"Ваш запрос GPS по грузу №{req.order_id} принят" if req.order_id
                        else "Ваш запрос GPS-мониторинга принят")
            _params = json.dumps(
                {"orderId": req.order_id, "by": me}, ensure_ascii=False)
            msg = f"notif.gps.accepted|{_params}|{ru_title} пользователем {me}"
            create_notification(db, req.requester_user_id, NotificationType.SYSTEM, msg,
                                related_id=str(req.session_id or req.id))
            import asyncio
            asyncio.create_task(push_notification(req.requester_user_id, {
                "type": "GPS_REQUEST_ACCEPTED",
                "payload": {
                    "id": req.id,
                    "order_id": req.order_id,
                    "session_id": str(req.session_id) if req.session_id else None,
                    "by_user_id": user.id,
                    "by_user_name": me
                }
            }))
        else:
            ru_title = (f"Ваш запрос GPS по грузу №{req.order_id} отклонён" if req.order_id
                        else "Ваш запрос GPS-мониторинга отклонён")
            _params = json.dumps(
                {"orderId": req.order_id, "by": me}, ensure_ascii=False)
            msg = f"notif.gps.declined|{_params}|{ru_title} пользователем {me}"
            create_notification(db, req.requester_user_id, NotificationType.SYSTEM, msg,
                                related_id=str(req.id))
            import asyncio
            asyncio.create_task(push_notification(req.requester_user_id, {
                "type": "GPS_REQUEST_DECLINED",
                "payload": {
                    "id": req.id,
                    "order_id": req.order_id,
                    "by_user_id": user.id,
                    "by_user_name": me
                }
            }))
    except Exception:
        pass

    # уведомление инициатору
    try:
        from notifications import create_notification, NotificationType, push_notification
        import json
        _params = json.dumps(
            {"orderId": req.order_id, "status": req.status.value}, ensure_ascii=False)
        msg = f"notif.gps.responded|{_params}|Ответ на запрос GPS по грузу #{req.order_id}: {req.status.value}"
        create_notification(db, req.requester_user_id,
                            NotificationType.SYSTEM, msg, related_id=str(req.id))
        import asyncio
        asyncio.create_task(push_notification(req.requester_user_id, {
            "type": "GPS_REQUEST_RESPONDED",
            "request_id": req.id,
            "order_id": req.order_id,
            "status": req.status.value,
            "session_id": str(req.session_id) if req.session_id else None
        }))
    except Exception:
        pass

    return req


# ========= Internal Comments (видно только автору и участникам менеджер-аккаунта) =========


def _root_manager_id(u: UserModel) -> Optional[int]:
    role = (getattr(u.role, "value", u.role) or "").upper()
    if role == "MANAGER":
        return u.id
    if role == "EMPLOYEE":
        return u.manager_id
    return None


@app.get("/internal_comments", response_model=List[InternalCommentOut])
def list_internal_comments(
    order_id: Optional[int] = None,
    transport_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    root_id = _root_manager_id(current_user)
    if not root_id:
        raise HTTPException(
            status_code=403,
            detail={"code": "error.internal.viewOnlyManager",
                    "message": "Видно только участникам менеджер-аккаунта"}
        )
    if (order_id and transport_id) or (not order_id and not transport_id):
        raise HTTPException(
            status_code=400, detail="Pass exactly one of order_id or transport_id")
    q = db.query(InternalComment).filter(InternalComment.manager_id == root_id)
    if order_id:
        q = q.filter(InternalComment.order_id == order_id)
    else:
        q = q.filter(InternalComment.transport_id == transport_id)
    items = q.order_by(InternalComment.created_at.desc()).all()
    out: List[InternalCommentOut] = []
    for it in items:
        au = db.query(UserModel).filter(UserModel.id == it.author_id).first()
        out.append(InternalCommentOut(
            id=it.id, manager_id=it.manager_id, author_id=it.author_id,
            order_id=it.order_id, transport_id=it.transport_id,
            content=it.content, created_at=it.created_at,
            author_name=(au.contact_person if au else None),
            author_avatar=(au.avatar if au else None),
        ))
    return out


@app.post("/internal_comments", response_model=InternalCommentOut)
def create_internal_comment(
    payload: InternalCommentCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    root_id = _root_manager_id(current_user)
    if not root_id:
        raise HTTPException(
            status_code=403,
            detail={"code": "error.internal.addOnlyManager",
                    "message": "Только участники менеджер-аккаунта могут добавлять комментарии"}
        )
    if (payload.order_id and payload.transport_id) or (not payload.order_id and not payload.transport_id):
        raise HTTPException(
            status_code=400, detail="Pass exactly one of order_id or transport_id")
    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(status_code=422, detail="Empty content")
    row = InternalComment(
        manager_id=root_id,
        author_id=current_user.id,
        order_id=payload.order_id,
        transport_id=payload.transport_id,
        content=content[:2000],
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    au = db.query(UserModel).filter(UserModel.id == row.author_id).first()
    return InternalCommentOut(
        id=row.id, manager_id=row.manager_id, author_id=row.author_id,
        order_id=row.order_id, transport_id=row.transport_id,
        content=row.content, created_at=row.created_at,
        author_name=(au.contact_person if au else None),
        author_avatar=(au.avatar if au else None),
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


def deactivate_overdue_transports():
    def parse_date_safe(val: Optional[str]) -> Optional[datetime]:
        if not val:
            return None
        for fmt in ("%d/%m/%Y", "%d.%m.%Y", "%Y-%m-%d"):
            try:
                return datetime.strptime(val, fmt)
            except ValueError:
                pass
        return None  # не распарсили — лучше пропустить, чем падать

    def get_ready_end_dt(tr) -> Optional[datetime]:
        # Вариант с типизированными полями (Date + Integer)
        base = getattr(tr, "ready_date", None)
        if base:
            days = getattr(tr, "ready_days", None) or 1
            if isinstance(base, datetime):
                base_dt = base
            else:
                base_dt = datetime.combine(base, datetime.min.time())
            return base_dt + timedelta(days=days - 1)

        # Обратная совместимость со строковыми полями
        date_str = getattr(tr, "ready_date_to", None) or getattr(
            tr, "ready_date_from", None)
        return parse_date_safe(date_str)

    while True:
        db = SessionLocal()
        try:
            now = datetime.utcnow()
            threshold = now - timedelta(days=8)
            transports = db.query(TransportModel).filter(
                TransportModel.is_active == True).all()
            for transport in transports:
                try:
                    ready_end = get_ready_end_dt(transport)
                    if not ready_end:
                        continue  # нет даты — ничего не делаем
                    if ready_end < threshold:
                        transport.is_active = False
                        create_notification(
                            db,
                            transport.owner_id,
                            NotificationType.TRANSPORT_AUTO_DISABLED,
                            "notif.transport.autoDisabled",
                            related_id=str(transport.id),
                        )
                except Exception as e:
                    print("Ошибка обработки даты транспорта:", e)
            db.commit()
        finally:
            db.close()
        time.sleep(3600 * 24)  # раз в сутки


# И запусти поток:
threading.Thread(target=deactivate_overdue_transports, daemon=True).start()


def deactivate_overdue_orders():
    while True:
        db = SessionLocal()
        try:
            now = datetime.utcnow()
            threshold = now - timedelta(days=8)
            orders = db.query(OrderModel).filter(
                OrderModel.is_active == True).all()
            for order in orders:
                try:
                    # Принимаем DD/MM/YYYY, DD.MM.YYYY и YYYY-MM-DD
                    load_date = None
                    for fmt in ("%d/%m/%Y", "%d.%m.%Y", "%Y-%m-%d"):
                        try:
                            load_date = datetime.strptime(
                                (order.load_date or "").strip(), fmt)
                            break
                        except Exception:
                            pass
                    if not load_date:
                        raise ValueError(f"Unparsed date: {order.load_date!r}")
                    if load_date < threshold:
                        order.is_active = False
                        create_notification(
                            db,
                            order.owner_id,
                            NotificationType.ORDER_AUTO_DISABLED,
                            "notif.order.autoDisabled",
                            related_id=str(order.id)
                        )
                except Exception as e:
                    print("Ошибка обработки даты:", e)
            db.commit()
        finally:
            db.close()
        time.sleep(3600 * 24)  # раз в сутки


threading.Thread(target=deactivate_overdue_orders, daemon=True).start()


def run_async_task(coro):
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # Если нет event loop, создаём временный
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(coro)
        loop.close()
        asyncio.set_event_loop(None)
        return
    loop.create_task(coro)


# --- WS/JWT helpers ----------------------------------------------------------


def _parse_cookies(cookie_header: Optional[str]) -> dict[str, str]:
    out = {}
    if not cookie_header:
        return out
    for p in cookie_header.split(";"):
        if "=" in p:
            k, v = p.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def get_token_from_header_or_cookie(
    request: Request | None = None,
    websocket: WebSocket | None = None,
) -> Optional[str]:
    # берём заголовки/куки из того объекта, который нам дали
    headers = {}
    cookies = {}

    if request is not None:
        headers = request.headers
        cookies = request.cookies or {}
    elif websocket is not None:
        headers = websocket.headers
        # у WebSocket может не быть .cookies (в зависимости от версии) – защищаемся
        try:
            cookies = websocket.cookies or {}
        except Exception:
            cookies = {}

    # 1) Authorization: Bearer <token>
    auth = (headers.get("Authorization") or headers.get(
        "authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()

    # 2) кука
    return cookies.get("token") or cookies.get("access_token")

# ---------------------------------------------------------------------------


@router.post("/orders/matches", response_model=List[OrderOut])
def get_matching_orders(
    order_data: OrderCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    ЛЁГКИЙ подбор совпадающих заявок для превью.

    Важно:
    - НЕ вызываем тяжёлую find_matching_orders;
    - только SQL‑фильтры + LIMIT 50;
    - поэтому при выборе адреса память больше не взлетает.
    """
    q = (
        db.query(OrderModel)
        .filter(OrderModel.is_active == True)
        .filter(OrderModel.owner_id != user.id)
    )

    # Берём первую точку "откуда" и "куда" из формы (если есть)
    from_loc = None
    to_loc = None
    try:
        from_loc = (order_data.from_locations or [])[0]
    except Exception:
        pass
    try:
        to_loc = (order_data.to_locations or [])[0]
    except Exception:
        pass

    from sqlalchemy import func, text
    from datetime import datetime, timedelta

    if from_loc:
        q = q.filter(
            text("""
                EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text(orders.from_locations) AS t(val)
                    WHERE lower(t.val) ILIKE lower(:from_loc)
                )
            """)
        ).params(from_loc=f"%{from_loc}%")

    if to_loc:
        q = q.filter(
            text("""
                EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements_text(orders.to_locations) AS t(val)
                    WHERE lower(t.val) ILIKE lower(:to_loc)
                )
            """)
        ).params(to_loc=f"%{to_loc}%")

    # Тип машины, если задан
    if getattr(order_data, "truck_type", None):
        q = q.filter(OrderModel.truck_type == order_data.truck_type)

    # Дата загрузки ± 3 дня, если её можно распарсить
    load_date_raw = getattr(order_data, "load_date", None) or ""
    load_date_raw = load_date_raw.strip()
    if load_date_raw:
        parsed = None
        for fmt in ("%d.%m.%Y", "%d/%m/%Y", "%Y-%m-%d"):
            try:
                parsed = datetime.strptime(load_date_raw, fmt)
                break
            except ValueError:
                continue

        if parsed:
            date_min = (parsed - timedelta(days=3)).strftime("%Y-%m-%d")
            date_max = (parsed + timedelta(days=3)).strftime("%Y-%m-%d")

            load_date_col = func.to_date(
                func.nullif(
                    func.replace(func.coalesce(
                        OrderModel.load_date, ""), ".", "/"),
                    ""
                ),
                "DD/MM/YYYY",
            )

            q = q.filter(
                load_date_col >= func.to_date(date_min, "YYYY-MM-DD"),
                load_date_col <= func.to_date(date_max, "YYYY-MM-DD"),
            )

    # Легко: только свежие, ограничение по количеству
    items = (
        q.order_by(OrderModel.created_at.desc())
        .limit(50)
        .all()
    )

    return [OrderOut.model_validate(o, from_attributes=True) for o in items]


@app.get("/transports/{transport_id}/matches", response_model=List[schemas.OrderOut])
def get_matching_orders_for_transport(
    transport_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    tr = db.query(models.Transport).filter(
        models.Transport.id == transport_id).first()
    if not tr:
        raise HTTPException(status_code=404, detail={
                            "code": "error.transport.notFound", "message": "Транспорт не найден"})
    matches = find_matching_orders_for_transport(
        tr, db, exclude_user_id=current_user.id)
    # помечаем «новые» относительно последнего просмотра
    view = db.query(TransportMatchView).filter_by(
        user_id=current_user.id, transport_id=transport_id).first()
    last_view = view.last_viewed_at if view else datetime(1970, 1, 1)
    enriched = []
    for o in matches:
        try:
            o.is_new = bool(o.created_at and o.created_at > last_view)
        except Exception:
            o.is_new = False
        enriched.append(schemas.OrderOut.model_validate(
            o, from_attributes=True))
    return enriched


@ws_router.websocket("/ws/notifications")
async def notifications_ws(
    websocket: WebSocket,
    user_id: str = Query(...),
    token: str = Query(...)
):
    import traceback
    print(f"[WS DEBUG] ОЖИДАЕМ CONNECT user_id={user_id}")

    # Принять соединение СРАЗУ, чтобы избежать 403 при ошибках до accept()
    await websocket.accept()
    try:
        # Верифицируем токен после accept, чтобы корректно закрывать сокет при ошибках
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            print(f"[WS DEBUG] PAYLOAD AFTER JWT: {payload}")
            token_user_id = str(payload.get("user_id")
                                or payload.get("sub") or "")
        except Exception as e:
            print(f"[WS ERROR] JWT decode failed: {repr(e)}")
            await websocket.close(code=4403)
            return

        if str(token_user_id) != str(user_id):
            print(
                f"[WS ERROR] TOKEN USER_ID != PARAM USER_ID ({token_user_id} != {user_id})")
            await websocket.close(code=4403)
            return

        # Backend не использует i18n-функцию t(); оставляем явный текст для лога.
        print(f"[WS DEBUG] СОЕДИНЕНИЕ ПРИНЯТО user_id={user_id}")
        if str(user_id) not in user_notification_connections:
            user_notification_connections[str(user_id)] = set()
        user_notification_connections[str(user_id)].add(websocket)
        print(
            f"WebSocket подключен: user_id={user_id}, всего: {len(user_notification_connections[str(user_id)])}")

        try:
            while True:
                try:
                    data = await websocket.receive_text()
                    print(
                        f"[WS DEBUG] RECEIVED ON NOTIFICATIONS user_id={user_id}: {data}")

                    # --- keep-alive: отвечаем на {"type":"ping"} так же, как и в
                    # notifications.py, чтобы соединение не считалось «мертвым»
                    try:
                        parsed = json.loads(data)
                        if isinstance(parsed, dict) and parsed.get("type") == "ping":
                            try:
                                await websocket.send_json({"type": "pong"})
                            except Exception:
                                pass
                    except Exception:
                        # Если это не JSON — просто игнорируем
                        pass
                except Exception as e:
                    print(
                        f"[WS DEBUG] notifications_ws receive_text exception: {e}")
                    break
        except Exception as e:
            print(
                f"[WS ERROR] WS ошибка/закрытие user_id={user_id}: {repr(e)}")
            traceback.print_exc()
        finally:
            try:
                key = str(user_id)
                bucket = user_notification_connections.get(key)
                if bucket is not None:
                    bucket.discard(websocket)
                    if not bucket:
                        user_notification_connections.pop(key, None)
                left = len(user_notification_connections.get(key, []))
                print(
                    f"WebSocket отключён: user_id={user_id}, осталось: {left}")
            except Exception as e:
                print(f"[WS ERROR] Error removing notification ws: {e}")
            print(f"[WS DEBUG] FINALLY user_id={user_id}")
            try:
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.close()
            except Exception as close_e:
                print(
                    f"[WS ERROR] Error closing notification WS in finally: {close_e}")
    except Exception as e:
        print(
            f"[WS ERROR] Ошибка инициализации уведомлений user_id={user_id}: {repr(e)}")
        traceback.print_exc()
        try:
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.close()
        except Exception as close_e:
            print(f"[WS ERROR] Error closing WS (notifications): {close_e}")

# Подключи к FastAPI:

UPLOAD_ROOT = FilePath("static/uploads")
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)


def _safe_filename(fname: str) -> str:
    # очень простой “санитайзер”
    return "".join(ch for ch in fname if ch.isalnum() or ch in (" ", ".", "_", "-", "(", ")")).strip()


@router.post("/attachments/upload")
@router.post("/upload")  # алиас под фронт
async def upload_attachment(
    file: UploadFile = File(...),
):
    # сохраняем в /static/uploads/YYYY/MM/uuid.ext
    now = datetime.utcnow()
    subdir = UPLOAD_ROOT / str(now.year) / f"{now.month:02d}"
    subdir.mkdir(parents=True, exist_ok=True)

    original = _safe_filename(file.filename or "file")
    ext = FilePath(original).suffix.lower()
    uid = uuid4().hex
    new_name = f"{uid}{ext}" if ext else uid
    dst = subdir / new_name

    # потоковая запись с лимитом 10 МБ
    MAX_BYTES = 10 * 1024 * 1024
    read = 0
    with dst.open("wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            read += len(chunk)
            if read > MAX_BYTES:
                out.close()
                dst.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="File too large")
            out.write(chunk)

    file_url = f"/static/uploads/{now.year}/{now.month:02d}/{new_name}"
    return {
        "name": original,
        "file_type": file.content_type or "application/octet-stream",
        "file_url": file_url,
    }


def _normalize_attachments(items):
    """
    Принимает список строк или объектов ({file_url|url|href, name|filename, file_type})
    Возвращает список словарей {name, file_type, file_url}
    """
    norm = []
    for it in items or []:
        if not it:
            continue
        if isinstance(it, str):
            norm.append({
                "name": FilePath(it).name,
                "file_type": "",
                "file_url": it,
            })
            continue
        url = it.get("file_url") or it.get("url") or it.get("href") or ""
        name = it.get("name") or it.get("filename") or (
            FilePath(url).name if url else "file")
        ftype = it.get("file_type") or it.get("type") or ""
        norm.append({"name": name, "file_type": ftype, "file_url": url})
    return norm


@app.patch("/transports/{transport_id}", response_model=TransportSchema)
def update_transport(
    transport_id: str,
    transport_update: schemas.TransportCreate = Body(...),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    transport = db.query(TransportModel).filter(
        TransportModel.id == transport_id).first()
    if not transport:
        raise HTTPException(status_code=404, detail={
                            "code": "error.transport.notFound", "message": "Транспорт не найден"})
    if transport.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    data = transport_update.dict(exclude_unset=True)
    # Приведение JSON-строк в массивы (если фронт прислал строки)
    if isinstance(data.get("adr_class"), str):
        try:
            data["adr_class"] = json.loads(data["adr_class"])
        except Exception:
            data["adr_class"] = []
    if isinstance(data.get("load_types"), str):
        try:
            data["load_types"] = json.loads(data["load_types"])
        except Exception:
            data["load_types"] = []
    if isinstance(data.get("special"), str):
        try:
            data["special"] = json.loads(data["special"])
        except Exception:
            data["special"] = []
    for bool_field in ["adr", "gps_monitor"]:
        if isinstance(data.get(bool_field), str):
            data[bool_field] = data[bool_field].lower() == "true"

    coords = data.get("from_location_coords")
    if coords:
        # Если dict
        if isinstance(coords, dict):
            data["from_location_lat"] = coords.get("lat")
            data["from_location_lng"] = coords.get("lng")
        # Если list — берём первый элемент
        elif isinstance(coords, list) and len(coords) > 0:
            first = coords[0]
            data["from_location_lat"] = first.get("lat")
            data["from_location_lng"] = first.get("lng")
        else:
            data["from_location_lat"] = None
            data["from_location_lng"] = None
    else:
        data["from_location_lat"] = None
        data["from_location_lng"] = None

    # to_locations нормализация
    to_locations = data.get("to_locations", [])
    if isinstance(to_locations, list):
        data["to_locations"] = [
            {
                **item,
                "lat": item.get("lat"),
                "lng": item.get("lng"),
            }
            for item in to_locations if item.get("location")
        ]
    else:
        data["to_locations"] = []

    # Обновить только пришедшие поля
    for attr, value in data.items():
        setattr(transport, attr, value)

    db.commit()
    db.refresh(transport)
    return transport


@router.patch("/transports/{transport_id}/attachments", response_model=schemas.Transport)
def set_transport_attachments(
    transport_id: str,
    attachments: List[dict] = Body(...),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    tr = db.query(TransportModel).filter(
        TransportModel.id == transport_id).first()
    if not tr:
        raise HTTPException(status_code=404, detail={
                            "code": "error.transport.notFound", "message": "Транспорт не найден"})
    if tr.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    tr.attachments = _normalize_attachments(attachments)
    db.commit()
    db.refresh(tr)
    return tr


app.include_router(router)

# --- Views counters ----------------------------------------------------------


@app.post("/orders/{order_id}/view")
def inc_order_view(
    order_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Optional[UserModel] = Depends(get_optional_current_user),
):
    row = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="error.order.notFound")
    # --- daily unique per user/ip ---
    ua = (request.headers.get("user-agent") or "").strip()
    ip = (request.client.host if request.client else "") or ""
    if current_user:
        viewer_key = f"u:{current_user.id}"
    else:
        h = hashlib.sha1(f"{ip}|{ua}".encode("utf-8")).hexdigest()[:20]
        viewer_key = f"g:{h}"
    today = datetime.utcnow().date()
    exists = db.query(OrderDailyView).filter(
        OrderDailyView.order_id == order_id,
        OrderDailyView.viewer_key == viewer_key,
        OrderDailyView.day == today
    ).first()
    if not exists:
        db.add(OrderDailyView(order_id=order_id,
               viewer_key=viewer_key, day=today))
        row.views = int(row.views or 0) + 1
        db.commit()
    return {"views": row.views}


@app.post("/transports/{transport_id}/view")
def inc_transport_view(
    transport_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: Optional[UserModel] = Depends(get_optional_current_user),
):
    row = db.query(TransportModel).filter(
        TransportModel.id == transport_id).first()
    if not row:
        raise HTTPException(status_code=404, detail={
                            "code": "error.transport.notFound"})
    ua = (request.headers.get("user-agent") or "").strip()
    ip = (request.client.host if request.client else "") or ""
    if current_user:
        viewer_key = f"u:{current_user.id}"
    else:
        h = hashlib.sha1(f"{ip}|{ua}".encode("utf-8")).hexdigest()[:20]
        viewer_key = f"g:{h}"
    today = datetime.utcnow().date()
    exists = db.query(TransportDailyView).filter(
        TransportDailyView.transport_id == transport_id,
        TransportDailyView.viewer_key == viewer_key,
        TransportDailyView.day == today
    ).first()
    if not exists:
        db.add(TransportDailyView(transport_id=transport_id,
               viewer_key=viewer_key, day=today))
        row.views = int(row.views or 0) + 1
        db.commit()
    return {"views": row.views}


@router.post("/transports/{transport_id}/attachments", response_model=schemas.Transport)
def append_transport_attachments(
    transport_id: str,
    attachments: List[dict] = Body(...),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    tr = db.query(TransportModel).filter(
        TransportModel.id == transport_id).first()
    if not tr:
        raise HTTPException(status_code=404, detail={
                            "code": "error.transport.notFound", "message": "Транспорт не найден"})
    if tr.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    existing = list(tr.attachments or [])
    existing.extend(_normalize_attachments(attachments))
    # удалим дубли по file_url
    seen = set()
    unique = []
    for a in existing:
        key = a.get("file_url")
        if key in seen:
            continue
        seen.add(key)
        unique.append(a)
    tr.attachments = unique
    db.commit()
    db.refresh(tr)
    return tr

# PATCH /transports/{transport_id}/active


@app.patch("/transports/{transport_id}/active")
def set_transport_active(
    transport_id: str,
    is_active: bool = Body(..., embed=True),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    transport = db.query(TransportModel).filter(
        TransportModel.id == transport_id,
        TransportModel.owner_id == current_user.id
    ).first()
    if not transport:
        raise HTTPException(status_code=404, detail={
                            "code": "error.transport.notFound", "message": "Транспорт не найден"})

    # --- Защита от зомби-активации ---
    # ВАЖНО: для "постоянных" транспортов защита просрочки не применяется,
    # чтобы их можно было свободно активировать/деактивировать.
    if (transport.mode or "").strip().lower() in ("постоянно", "postoyanno", "constant"):
        days_overdue = 0
    else:
        date_str = (
            transport.ready_date_to
            or transport.ready_date_from
            or transport.ready_date
            or ""
        )
        try:
            ready_date = datetime.strptime(date_str, "%d/%m/%Y")
            days_overdue = (datetime.now().date() - ready_date.date()).days
        except Exception:
            days_overdue = 0
    if not transport.is_active and days_overdue >= 8:
        raise HTTPException(
            status_code=409, detail="error.order.tooLateToActivate")

    transport.is_active = is_active
    db.commit()
    db.refresh(transport)
    return {"ok": True, "is_active": transport.is_active}


@app.patch("/transports/{transport_id}/toggle_active")
def toggle_transport_active(transport_id: str, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    transport = db.query(TransportModel).filter(
        TransportModel.id == transport_id, TransportModel.owner_id == current_user.id).first()
    if not transport:
        raise HTTPException(status_code=404, detail={
                            "code": "error.transport.notFound", "message": "Транспорт не найден"})
    transport.is_active = not transport.is_active
    db.commit()
    db.refresh(transport)
    return {"id": str(transport.id), "is_active": transport.is_active}


@app.patch("/orders/{order_id}/toggle_active")
def toggle_order_active(order_id: int, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    order = db.query(OrderModel).filter(OrderModel.id == order_id,
                                        OrderModel.owner_id == current_user.id).first()
    if not order:
        raise HTTPException(status_code=404, detail="error.order.notFound")

    # Проверяем просрочку
    try:
        load_date = datetime.strptime(order.load_date, "%d/%m/%Y")
        days_overdue = (datetime.now().date() - load_date.date()).days
    except Exception:
        days_overdue = 0  # если дата невалидная — разрешить

    # Если заявка уже просрочена 8+ дней и пытаются включить is_active
    if not order.is_active and days_overdue >= 8:
        raise HTTPException(
            status_code=409,
            detail="TOO_LATE_TO_ACTIVATE"
        )

    order.is_active = not order.is_active
    db.commit()
    db.refresh(order)
    return {"id": order.id, "is_active": order.is_active}


@app.patch("/orders/{order_id}")
def update_order(order_id: int, order_update: dict, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    order = db.query(OrderModel).filter(OrderModel.id == order_id,
                                        OrderModel.owner_id == current_user.id).first()
    if not order:
        raise HTTPException(status_code=404, detail="error.order.notFound")
    # === НОВОЕ: если пришли attachments — нормализуем, иначе апдейтим как есть
    if "attachments" in order_update:
        order_update = dict(order_update)
        order_update["attachments"] = _normalize_attachments(
            order_update.get("attachments") or [])
    for attr, value in order_update.items():
        setattr(order, attr, value)
    db.commit()
    db.refresh(order)
    return order


@router.patch("/orders/{order_id}/attachments")
def set_order_attachments(
    order_id: int,
    attachments: List[dict] = Body(...),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    od = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if not od:
        raise HTTPException(status_code=404, detail="error.order.notFound")
    if od.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="error.forbidden")

    od.attachments = _normalize_attachments(attachments)
    db.commit()
    db.refresh(od)
    return od

# === НОВОЕ: получить список вложений заявки (удобно фронту) ===


@app.get("/orders/{order_id}/attachments", response_model=List[dict])
def get_order_attachments(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    od = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if not od:
        raise HTTPException(status_code=404, detail="error.order.notFound")
    if od.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="error.forbidden")
    return od.attachments or []

# === НОВОЕ: удалить конкретное вложение заявки по индексу (и файл на диске — опционально) ===


@app.delete("/orders/{order_id}/attachments/{idx}", response_model=List[dict])
def delete_order_attachment(
    order_id: int,
    idx: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    od = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if not od:
        raise HTTPException(status_code=404, detail={
                            "code": "error.order.notFound", "message": "Заявка не найдена"})
    if od.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    arr = list(od.attachments or [])
    if idx < 0 or idx >= len(arr):
        raise HTTPException(status_code=404, detail="Attachment not found")
    removed = arr.pop(idx)
    od.attachments = arr
    db.commit()
    db.refresh(od)
    # если нужно чистить локальный файл — раскомментируй:
    # _delete_local_file_by_url(removed.get("file_url"))
    return od.attachments or []


@router.post("/orders/{order_id}/attachments")
def append_order_attachments(
    order_id: int,
    attachments: List[dict] = Body(...),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    od = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if not od:
        raise HTTPException(status_code=404, detail={
                            "code": "error.order.notFound", "message": "Заявка не найдена"})
    if od.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    existing = list(od.attachments or [])
    existing.extend(_normalize_attachments(attachments))
    # дедеуп по file_url
    seen = set()
    unique = []
    for a in existing:
        key = a.get("file_url")
        if key in seen:
            continue
        seen.add(key)
        unique.append(a)
    od.attachments = unique
    db.commit()
    db.refresh(od)
    return od


@app.get("/saved/orders", response_model=List[OrderOut])
def list_saved_orders(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    # для TRANSPORT — это как раз их закладки по чужим грузам
    q = (
        db.query(OrderModel)
        .join(SavedOrder, SavedOrder.order_id == OrderModel.id)
        .filter(SavedOrder.user_id == current_user.id)
        .order_by(OrderModel.created_at.desc())
    )
    items = q.all()
    # обогащаем как в других списках: matchesCount/isMine/owner_name
    users = db.query(UserModel).filter(
        UserModel.id.in_({o.owner_id for o in items})).all()
    by_id = {u.id: u for u in users}
    out: List[OrderOut] = []
    for od in items:
        o = OrderOut.model_validate(od, from_attributes=True)
        o.matchesCount = 0
        o.isMine = (od.owner_id == current_user.id)
        owner = by_id.get(od.owner_id)
        o.owner_name = (owner.contact_person or owner.email) if owner else ""
        out.append(o)
    return out


@app.get("/saved/transports", response_model=List[TransportSchema])
def list_saved_transports(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    q = (
        db.query(TransportModel)
        .join(SavedTransport, SavedTransport.transport_id == TransportModel.id)
        .filter(SavedTransport.user_id == current_user.id)
        .order_by(TransportModel.created_at.desc())
    )
    return q.all()


def _delete_local_file_by_url(file_url: str):
    if not file_url or not file_url.startswith("/static/"):
        return
    path = FilePath("." + file_url).resolve()
    root = FilePath("static").resolve()
    try:
        if root in path.parents and path.exists():
            path.unlink(missing_ok=True)
    except Exception:
        pass


@app.post("/saved/orders/{order_id}/toggle", response_model=SavedToggleResponse)
def toggle_saved_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    if not _can_save("order", current_user):
        raise HTTPException(status_code=403, detail="error.forbidden")
    exists = db.query(SavedOrder).filter(
        SavedOrder.user_id == current_user.id,
        SavedOrder.order_id == order_id
    ).first()
    if exists:
        db.delete(exists)
        db.commit()
        return SavedToggleResponse(saved=False)
    # верифицируем, что такой заказ есть
    if not db.query(OrderModel).filter(OrderModel.id == order_id).first():
        raise HTTPException(404, "error.order.notFound")
    db.add(SavedOrder(user_id=current_user.id, order_id=order_id))
    db.commit()
    return SavedToggleResponse(saved=True)


@app.post("/saved/transports/{transport_id}/toggle", response_model=SavedToggleResponse)
def toggle_saved_transport(
    transport_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    if not _can_save("transport", current_user):
        raise HTTPException(status_code=403, detail="error.forbidden")
    exists = db.query(SavedTransport).filter(
        SavedTransport.user_id == current_user.id,
        SavedTransport.transport_id == transport_id
    ).first()
    if exists:
        db.delete(exists)
        db.commit()
        return SavedToggleResponse(saved=False)
    # проверим существование транспорта
    if not db.query(TransportModel).filter(TransportModel.id == transport_id).first():
        raise HTTPException(404, "error.transport.notFound")
    db.add(SavedTransport(user_id=current_user.id, transport_id=transport_id))
    db.commit()
    return SavedToggleResponse(saved=True)

# Совместимость с вариантом фронта: явное save/unsave POST/DELETE


@app.post("/saved/orders/{order_id}")
def save_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    if not _can_save("order", current_user):
        raise HTTPException(status_code=403, detail="error.forbidden")
    if not db.query(OrderModel).filter(OrderModel.id == order_id).first():
        raise HTTPException(404, "error.order.notFound")
    try:
        db.add(SavedOrder(user_id=current_user.id, order_id=order_id))
        db.commit()
    except Exception:
        db.rollback()
    return {"ok": True}


@app.delete("/saved/orders/{order_id}")
def unsave_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    db.query(SavedOrder).filter(
        SavedOrder.user_id == current_user.id,
        SavedOrder.order_id == order_id
    ).delete()
    db.commit()
    return {"ok": True}


@app.post("/saved/transports/{transport_id}")
def save_transport(
    transport_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    if not _can_save("transport", current_user):
        raise HTTPException(status_code=403, detail="error.forbidden")
    if not db.query(TransportModel).filter(TransportModel.id == transport_id).first():
        raise HTTPException(404, "error.transport.notFound")
    try:
        db.add(SavedTransport(user_id=current_user.id, transport_id=transport_id))
        db.commit()
    except Exception:
        db.rollback()
    return {"ok": True}


@app.delete("/saved/transports/{transport_id}")
def unsave_transport(
    transport_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    db.query(SavedTransport).filter(
        SavedTransport.user_id == current_user.id,
        SavedTransport.transport_id == transport_id
    ).delete()
    db.commit()
    return {"ok": True}


@app.get("/transports/my", response_model=List[schemas.Transport])
def get_my_transports(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
    ):
    # "Мои" — ВСЕГДА только записи текущего пользователя
    
    my_filters = [TransportModel.owner_id == current_user.id]
    if current_user.email:
        my_filters.append(and_(
            TransportModel.owner_id.is_(None),
            func.lower(TransportModel.email) == func.lower(current_user.email),
        ))
    transports = (
        db.query(TransportModel)
       .filter(or_(*my_filters))
        .order_by(TransportModel.created_at.desc())
        .all()
    )
    result: List[schemas.Transport] = []
    for tr in transports:
        tr_out = schemas.Transport.model_validate(tr, from_attributes=True)
        # Больше НЕ считаем совпадения через find_matching_orders_for_transport
        tr_out.matchesCount = 0
        tr_out.isMine = True
        result.append(tr_out)
    return result


@app.get("/transports/account", response_model=List[schemas.Transport])
def get_account_transports(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    """
    Лёгкий список транспорта аккаунта.

    matchesCount здесь всегда = 0, чтобы не запускать тяжёлый подбор
    при каждом заходе в раздел. Полные совпадения по конкретному
    транспорту смотри через /transports/{id}/matching_orders.
    """
    role_val = getattr(current_user.role, "value", current_user.role)
    role = (role_val or "").upper()

    if role == "MANAGER":
        account_manager_id = current_user.id
    elif role == "EMPLOYEE" and current_user.manager_id:
        account_manager_id = current_user.manager_id
    else:
        account_manager_id = None

    # Не менеджерский аккаунт — просто свои записи
    if not account_manager_id:
        trs_filters = [TransportModel.owner_id == current_user.id]
        if current_user.email:
            trs_filters.append(and_(
                TransportModel.owner_id.is_(None),
                func.lower(TransportModel.email) == func.lower(current_user.email),
            ))
        trs = (
            db.query(TransportModel)
           .filter(or_(*trs_filters))
            .order_by(TransportModel.created_at.desc())
            .all()
        )
        out: List[schemas.Transport] = []
        for tr in trs:
            t = schemas.Transport.model_validate(tr, from_attributes=True)
            t.matchesCount = 0
            t.isMine = True
            t.owner_name = current_user.contact_person or current_user.email
            out.append(t)
        return out

    # Менеджерский аккаунт: менеджер + сотрудники
    employees = db.query(UserModel).filter(
        UserModel.manager_id == account_manager_id
    ).all()
    account_user_ids = [account_manager_id] + [e.id for e in employees]
    account_emails = [u.email for u in ([current_user] + employees) if u.email]

    email_match_filter = None
    if account_emails:
        lower_emails = [email.lower() for email in account_emails]
        email_match_filter = and_(
            TransportModel.owner_id.is_(None),
            func.lower(TransportModel.email).in_(lower_emails),
        )

    account_filters = [TransportModel.owner_id.in_(account_user_ids)]
    if email_match_filter is not None:
        account_filters.append(email_match_filter)

    transports = (
        db.query(TransportModel)
         .filter(or_(*account_filters))
        .order_by(TransportModel.created_at.desc())
        .all()
    )

    users = db.query(UserModel).filter(
        UserModel.id.in_(account_user_ids)
    ).all()
    users_by_id = {u.id: u for u in users}

    result: List[schemas.Transport] = []
    for tr in transports:
        t = schemas.Transport.model_validate(tr, from_attributes=True)
        t.matchesCount = 0
        t.isMine = (tr.owner_id == current_user.id)
        owner = users_by_id.get(tr.owner_id)
        t.owner_name = (owner.contact_person or owner.email) if owner else ""
        result.append(t)

    return result


@app.post("/ratings", response_model=RatingSchema)
def create_rating(
    rating: RatingCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    db_rating = RatingModel(
        user_id=rating.user_id,  # Кого оценивают
        author_id=current_user.id,  # Кто оценивает (автор)
        deal_id=rating.deal_id,
        punctuality=rating.punctuality,
        communication=rating.communication,
        professionalism=rating.professionalism,
        reliability=rating.reliability,
        comment=rating.comment,
    )
    db.add(db_rating)
    try:
        db.commit()
        db.refresh(db_rating)
        return db_rating
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400, detail="Вы уже оставили отзыв этому пользователю")


@app.get("/profile/ratings/{user_id}", response_model=List[RatingSchema])
def get_user_ratings(
    user_id: int,
    db: Session = Depends(get_db)
):
    return db.query(RatingModel).filter(RatingModel.user_id == user_id).order_by(RatingModel.created_at.desc()).all()


@app.get("/users/{user_id}", response_model=UserProfile)
def get_user_profile(user_id: int, db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.get("/users", response_model=List[UserOut])
def get_all_users(db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    # Возвращаем всех пользователей, кроме текущего — доступно всем залогиненным
    users = db.query(UserModel).filter(UserModel.id != current_user.id).all()
    return users


def email_from_token(token):
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    return payload.get("sub")


@app.post("/profile/avatar")
def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = authorization[7:]
    current_user = db.query(UserModel).filter(
        UserModel.email == email_from_token(token)).first()
    if not current_user:
        raise HTTPException(401, "User not found")

    # Только png или jpg!
    ext = os.path.splitext(file.filename)[-1].lower()
    if ext not in [".png", ".jpg", ".jpeg", ".doc", ".docx"]:
        raise HTTPException(400, "Только .png, .jpg, .doc, .docx файлы!")

    # Генерируем уникальное имя файла
    avatar_filename = f"avatars/{uuid4().hex}{ext}"
    save_path = os.path.join("static", avatar_filename)
    os.makedirs(os.path.dirname(save_path), exist_ok=True)

    # Записываем файл правильно!
    contents = file.file.read()
    with open(save_path, "wb") as f:
        f.write(contents)
    if len(contents) < 100:  # На всякий случай, проверь размер
        raise HTTPException(400, "Файл слишком маленький или не картинка!")

    current_user.avatar = f"/static/{avatar_filename}"
    db.commit()
    db.refresh(current_user)
    return {"avatar": current_user.avatar}


@app.patch("/profile", response_model=UserProfile)
def update_profile(
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    authorization: str = Header(None),  # <-- вот так!
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = authorization[7:]
    current_user = db.query(UserModel).filter(
        UserModel.email == email_from_token(token)).first()
    for attr, value in user_update.dict(exclude_unset=True).items():
        setattr(current_user, attr, value)
    db.commit()
    db.refresh(current_user)
    return current_user


@app.post("/profile/documents")
def upload_documents(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    ext = os.path.splitext(file.filename)[-1]
    doc_filename = f"docs/{uuid4().hex}{ext}"
    save_path = os.path.join("static", doc_filename)
    os.makedirs(os.path.dirname(save_path), exist_ok=True)
    with open(save_path, "wb") as f:
        f.write(file.file.read())

    # Сохраняем ссылку на документ в профиле пользователя
    docs = current_user.docs_files or []
    docs.append(f"/static/{doc_filename}")
    current_user.docs_files = docs
    current_user.verification_status = "pending"
    db.commit()
    db.refresh(current_user)
    return {"docs": current_user.docs_files, "verification_status": current_user.verification_status}


@app.post("/admin/verify_user/{user_id}")
def verify_user(
    user_id: int,
    status: str,  # "verified" или "rejected"
    db: Session = Depends(get_db),
    admin: UserModel = Depends(admin_required)
):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if status == "verified":
        user.docs_verified = True
        user.is_verified = True
        user.verification_status = "verified"
    elif status == "rejected":
        user.docs_verified = False
        user.is_verified = False
        user.verification_status = "rejected"
    db.commit()
    db.refresh(user)
    return {"status": user.verification_status}


def haversine(lat1, lon1, lat2, lon2):
    # Радиус Земли в километрах
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(float, [lat1, lon1, lat2, lon2])
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * \
        cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return R * c


@app.get("/transports", response_model=List[TransportSchema])
def get_transports(
    from_location: str = Query(None, alias="from_location"),
    to_location: str = Query(None, alias="to_location"),
    ready_date_from: Optional[str] = Query(None, alias="ready_date_from"),
    ready_date_to: Optional[str] = Query(None, alias="ready_date_to"),
    truck_type: str = Query(None, alias="truck_type"),
    transport_kind: str = Query(None, alias="transport_kind"),
    q: str = Query(None, alias="q"),
    matches_only: Optional[bool] = Query(None, alias="matches_only"),
    gps_monitor: Optional[bool] = Query(None, alias="gps_monitor"),
    adr: Optional[bool] = Query(None, alias="adr"),
    body_length: str = Query(None, alias="body_length"),
    weight: str = Query(None, alias="weight"),
    volume: str = Query(None, alias="volume"),
    load_types: Optional[List[str]] = Query(None, alias="load_types"),
    from_location_lat: float = Query(None, alias="from_location_lat"),
    from_location_lng: float = Query(None, alias="from_location_lng"),
    to_location_lat: float = Query(None, alias="to_location_lat"),
    to_location_lng: float = Query(None, alias="to_location_lng"),
    page: Optional[int] = Query(None, ge=1),
    page_size: Optional[int] = Query(None, ge=1, le=120),
    response: Response = None,
    from_radius: float = Query(None, alias="from_radius"),
    to_radius: float = Query(None, alias="to_radius"),
    db: Session = Depends(get_db),
    current_user: Optional[UserModel] = Depends(get_optional_current_user),
):
    if DEBUG_SQL:
        print('--- /transports QUERY PARAMS ---')
        print('from_location:', repr(from_location))
        print('to_location:', repr(to_location))
        print('ready_date_from:', repr(ready_date_from))
        print('ready_date_to:', repr(ready_date_to))
        print('truck_type:', repr(truck_type))
        print('transport_kind:', repr(transport_kind))
        print('q:', repr(q))
        print('gps_monitor:', repr(gps_monitor))
        print('adr:', repr(adr))
        print('body_length:', repr(body_length))
        print('weight:', repr(weight))
        print('volume:', repr(volume))
        print('load_types:', repr(load_types))
        print('from_location_lat:', repr(from_location_lat))
        print('from_location_lng:', repr(from_location_lng))
        print('from_radius:', repr(from_radius))
        print('---')

     # Исторические записи попадаются с любыми значениями is_active (True/False/NULL),
    # поэтому не фильтруем по этому флагу, иначе легаси-заявки пропадают из общего
    # списка и становятся «невидимыми» на сайте.
    query = db.query(TransportModel)
    # Применяем фильтр блокировок только для авторизованного пользователя.
    if current_user is not None:
        query = query.filter(
            ~db.query(UB.id).filter(
                or_(
                    and_(UB.blocker_id == current_user.id,
                         UB.blocked_id == TransportModel.owner_id),
                    and_(UB.blocker_id == TransportModel.owner_id,
                         UB.blocked_id == current_user.id),
                )
            ).exists()
        )

    # --- ВИДЫ ЗАГРУЗКИ (логика "ИЛИ", пересечение хотя бы одного) ---
    if load_types:
        if len(load_types) == 1 and ',' in load_types[0]:
            load_types = [x.strip() for x in load_types[0].split(',')]
        query = query.filter(
            text("""
                EXISTS (
                    SELECT 1 FROM jsonb_array_elements_text(transports.load_types) AS elem
                    WHERE elem = ANY(ARRAY[:arr]::text[])
                )
            """)
        ).params(arr=load_types)

    if from_location not in [None, ""]:
        query = query.filter(
            TransportModel.from_location.ilike(f"%{from_location}%"))
    if to_location not in [None, ""]:
        query = query.filter(
            text(
                "EXISTS (SELECT 1 FROM jsonb_array_elements(transports.to_locations) AS elem WHERE lower(elem->>'location') ILIKE lower(:to_loc))"
            )
        ).params(to_loc=f"%{to_location}%")
    from sqlalchemy import cast, Date, Integer, func

    def ready_end_date_expr():
        return func.cast(TransportModel.ready_date, Date) + func.coalesce(cast(TransportModel.ready_days, Integer), 0) - 1

    # Включаем «постоянно» в любые дата-фильтры (все локали)
    perm_expr = func.lower(func.coalesce(func.trim(TransportModel.mode), ""))
    permanent_modes = (
        "постоянно",                 # RU
        "მუდმივად",                 # KA
        "always", "always ready",    # EN
        "constant", "permanent",     # EN
        "daimi",                     # AZ / TR
        "sürekli", "surekli",        # TR
        "մշտապես", "մշտական"        # HY
    )
    # (если вверху файла уже импортирован — пропусти)
    from sqlalchemy import func

    rd_from_col = func.to_date(
        func.nullif(
            func.replace(func.coalesce(
                TransportModel.ready_date_from, ""), ".", "/"),
            ""
        ),
        "DD/MM/YYYY"
    )
    rd_to_col = func.to_date(
        func.nullif(
            func.replace(func.coalesce(
                TransportModel.ready_date_to, ""), ".", "/"),
            ""
        ),
        "DD/MM/YYYY"
    )

    def _to_date_iso(s):
        return func.to_date(s, "YYYY-MM-DD")

    if ready_date_from not in [None, ""] and ready_date_to not in [None, ""]:
        query = query.filter(
            or_(
                # пересечение интервалов по датам готовности
                func.and_(rd_from_col <= _to_date_iso(ready_date_to),
                          rd_to_col >= _to_date_iso(ready_date_from)),
                perm_expr.in_(permanent_modes),
            )
        )
    elif ready_date_from not in [None, ""]:
        query = query.filter(
            or_(
                rd_to_col >= _to_date_iso(ready_date_from),
                perm_expr.in_(permanent_modes),
            )
        )
    elif ready_date_to not in [None, ""]:
        query = query.filter(
            or_(
                rd_from_col <= _to_date_iso(ready_date_to),
                perm_expr.in_(permanent_modes),
            )
        )
    if truck_type not in [None, ""]:
        query = query.filter(TransportModel.truck_type == truck_type)
    if transport_kind not in [None, ""]:
        query = query.filter(TransportModel.transport_kind == transport_kind)
    if gps_monitor is True:
        query = query.filter(TransportModel.gps_monitor == True)
    if adr is True:
        query = query.filter(TransportModel.adr == True)
    if body_length not in [None, ""]:
        query = query.filter(TransportModel.body_length == str(body_length))
    if weight not in [None, ""]:
        try:
            query = query.filter(TransportModel.weight >= float(weight))
        except (ValueError, TypeError):
            pass
    if volume not in [None, ""]:
        try:
            query = query.filter(TransportModel.volume >= float(volume))
        except (ValueError, TypeError):
            pass
    if q not in [None, ""]:
        ilike_q = f"%{q}%"
        query = query.filter(
            (TransportModel.truck_type.ilike(ilike_q)) |
            (TransportModel.transport_kind.ilike(ilike_q)) |
            (TransportModel.contact_name.ilike(ilike_q)) |
            (TransportModel.comment.ilike(ilike_q)) |
            (TransportModel.email.ilike(ilike_q))
        )

    # --- ФИЛЬТР «только Соответствия» (лёгкая версия) ---
    if matches_only and current_user is not None:
        from models import Match

        sub = (
            db.query(Match.transport_id)
            .filter(
                Match.user_id == current_user.id,
                Match.transport_id != None,
            )
            .distinct()
            .subquery()
        )
        query = query.filter(TransportModel.id.in_(sub))

    if DEBUG_SQL:
        print('--- SQL QUERY [transports] ---')
        print(str(query.statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={'literal_binds': True}
        )))
        print('---')

    # --- Радиусные фильтры "откуда / куда" на уровне SQL (bbox) ---
    def _bbox(center_lat, center_lng, radius_km):
        try:
            r = float(radius_km or 0)
        except (TypeError, ValueError):
            return None
        if center_lat is None or center_lng is None or r <= 0:
            return None

        # 1 градус широты ≈ 111 км
        lat_delta = r / 111.0
        lat_min = center_lat - lat_delta
        lat_max = center_lat + lat_delta

        # Долгота зависит от широты
        lng_delta = r / (111.0 * max(cos(radians(center_lat)), 0.1))
        lng_min = center_lng - lng_delta
        lng_max = center_lng + lng_delta

        return lat_min, lat_max, lng_min, lng_max

    # 1) FROM‑радиус — по обычным числовым колонкам
    bbox_from = _bbox(from_location_lat, from_location_lng, from_radius)
    if bbox_from:
        lat_min, lat_max, lng_min, lng_max = bbox_from
        query = query.filter(
            TransportModel.from_location_lat >= lat_min,
            TransportModel.from_location_lat <= lat_max,
            TransportModel.from_location_lng >= lng_min,
            TransportModel.from_location_lng <= lng_max,
        )

    # 2) TO‑радиус — по JSON‑массиву to_locations (lat/lng внутри JSON)
    bbox_to = _bbox(to_location_lat, to_location_lng, to_radius)
    if bbox_to:
        t_lat_min, t_lat_max, t_lng_min, t_lng_max = bbox_to
        query = query.filter(
            text("""
                EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(
                        COALESCE(transports.to_locations, '[]'::jsonb)
                    ) AS dest
                    WHERE dest ? 'lat'
                      AND dest ? 'lng'
                      AND dest->>'lat' <> '' AND dest->>'lng' <> ''
                      AND (dest->>'lat')::double precision BETWEEN :to_lat_min AND :to_lat_max
                      AND (dest->>'lng')::double precision BETWEEN :to_lng_min AND :to_lng_max
                )
            """)
        ).params(
            to_lat_min=t_lat_min,
            to_lat_max=t_lat_max,
            to_lng_min=t_lng_min,
            to_lng_max=t_lng_max,
        )

    base_q = query.order_by(TransportModel.created_at.desc())

    # --- БЕЗ РАДИУСА: чистая SQL-пагинация ---
    if page and page_size:
        total = base_q.count()
        items = base_q.offset((page - 1) * page_size).limit(page_size).all()
        if response is not None:
            response.headers["X-Total-Count"] = str(total)
            response.headers["X-Page"] = str(page)
            response.headers["X-Page-Size"] = str(page_size)
        print(f"RESULT COUNT: {len(items)} / TOTAL: {total}")
        return items

    result = base_q.all()
    print(f"RESULT COUNT: {len(result)}")
    return result


@app.post("/transports", response_model=TransportSchema)
def create_transport(
    transport: TransportCreate,
    db: Session = Depends(get_db),
    current_user: Optional[UserModel] = Depends(get_optional_current_user)
):
    # Снимаем срез памяти в начале обработки транспорта
    dbg_mem("create_transport: start")

    data = transport.dict()
    if isinstance(data.get("adr_class"), str):
        try:
            data["adr_class"] = json.loads(data["adr_class"])
        except Exception:
            data["adr_class"] = []
    print("== TRANSPORT DATA BEFORE DB ==", data)
    if isinstance(data.get("load_types"), str):
        try:
            data["load_types"] = json.loads(data["load_types"])
        except Exception:
            data["load_types"] = []
    if isinstance(data.get("special"), str):
        try:
            data["special"] = json.loads(data["special"])
        except Exception:
            data["special"] = []
    for bool_field in ["adr", "gps_monitor"]:
        if isinstance(data.get(bool_field), str):
            data[bool_field] = data[bool_field].lower() == "true"

    # Оставляем from_location_coords в data — не удаляем!
    coords = data.get("from_location_coords")
    if coords:
        if isinstance(coords, dict):
            data["from_location_lat"] = coords.get("lat")
            data["from_location_lng"] = coords.get("lng")
        elif isinstance(coords, list) and len(coords) > 0:
            first = coords[0]
            data["from_location_lat"] = first.get("lat")
            data["from_location_lng"] = first.get("lng")
        else:
            data["from_location_lat"] = None
            data["from_location_lng"] = None
    else:
        data["from_location_lat"] = None
        data["from_location_lng"] = None

    # Гарантируем: to_locations — массив объектов с location, lat, lng
    to_locations = data.get("to_locations", [])
    if isinstance(to_locations, list):
        data["to_locations"] = [
            {
                **item,
                "lat": item.get("lat"),
                "lng": item.get("lng"),
            }
            for item in to_locations if item.get("location")
        ]
    else:
        data["to_locations"] = []

    data["email"] = current_user.email  # <-- email из токена!
    data["owner_id"] = current_user.id  # <-- ОБЯЗАТЕЛЬНО: владелец транспорта

    # 1) Нормализуем даты готовности (принимаем DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD)
    from datetime import datetime
    for k in ("ready_date_from", "ready_date_to"):
        v = data.get(k)
        if isinstance(v, str) and v.strip():
            for fmt in ("%d.%m.%Y", "%d/%m/%Y", "%Y-%m-%d"):
                try:
                    data[k] = datetime.strptime(
                        v.strip(), fmt).strftime("%d.%m.%Y")
                    break
                except ValueError:
                    continue

    # 2) Если пришёл объект координат — разложим в lat/lng для индексов/поиска
    coords = data.get("from_location_coords") or {}
    if isinstance(coords, dict):
        data["from_location_lat"] = coords.get("lat")
        data["from_location_lng"] = coords.get("lng")

    # 3) Оставляем только те поля, которые реально есть у ORM-модели Transport
    allowed = {c.name for c in TransportModel.__table__.columns}
    data = {k: v for k, v in data.items() if k in allowed}

    db_transport = TransportModel(**data, id=uuid.uuid4())
    db.add(db_transport)
    db.commit()
    db.refresh(db_transport)
    try:
        from billing_tasks import touch_usage_snapshot_for_user
        touch_usage_snapshot_for_user(db, current_user.id)
    except Exception as e:
        print("[Billing] snapshot on create_transport failed:", e)

    # Теперь авто‑подбор по транспорту выносим в отдельный процесс‑воркер
    dbg_mem("create_transport: before enqueue_auto_match")
    enqueue_auto_match("transport", db_transport.id)
    dbg_mem("create_transport: after enqueue_auto_match")

    return db_transport


@app.delete("/transports/{transport_id}")
def delete_transport(transport_id: str, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    transport = db.query(TransportModel).filter(
        TransportModel.id == transport_id).first()
    if not transport:
        raise HTTPException(status_code=404, detail="Транспорт не найден")
    if transport.owner_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Нет прав на удаление этого транспорта")
    db.delete(transport)
    db.commit()
    return {"status": "deleted"}


@app.get("/orders", response_model=List[OrderSchema])
def get_orders(
    from_location: str = Query(None, alias="from_location"),
    to_location: str = Query(None, alias="to_location"),
    truck_type: str = Query(None, alias="truck_type"),
    load_date_from: str = Query(None, alias="load_date_from"),
    load_date_to: str = Query(None, alias="load_date_to"),
    price_from: str = Query(None, alias="price_from"),
    price_to: str = Query(None, alias="price_to"),
    with_attachments: int = Query(0, alias="with_attachments"),
    q: str = Query(None, alias="q"),
    # NEW: координаты и радиус
    from_location_lat: float = Query(None, alias="from_location_lat"),
    from_location_lng: float = Query(None, alias="from_location_lng"),
    from_radius: float = Query(None, alias="from_radius"),
    to_location_lat: float = Query(None, alias="to_location_lat"),
    to_location_lng: float = Query(None, alias="to_location_lng"),
    to_radius: float = Query(None, alias="to_radius"),
    matches_only: Optional[bool] = Query(None, alias="matches_only"),
    loading_types: Optional[List[str]] = Query(None, alias="loading_types"),
    db: Session = Depends(get_db),
    page: Optional[int] = Query(None, ge=1),
    page_size: Optional[int] = Query(None, ge=1, le=120),
    response: Response = None,
    current_user: Optional[UserModel] = Depends(get_optional_current_user)
):
    if DEBUG_SQL:
        print('--- /orders QUERY PARAMS ---')
        print('from_location:', repr(from_location))
        print('to_location:', repr(to_location))
        print('truck_type:', repr(truck_type))
        print('load_date_from:', repr(load_date_from))
        print('load_date_to:', repr(load_date_to))
        print('price_from:', repr(price_from))
        print('price_to:', repr(price_to))
        print('with_attachments:', repr(with_attachments))
        print('q:', repr(q))
        print('loading_types:', repr(loading_types))
        print('---')

    query = db.query(OrderModel).filter(OrderModel.is_active == True)
    if current_user is not None:
        query = query.filter(
            ~db.query(UB.id).filter(
                or_(
                    and_(UB.blocker_id == current_user.id,
                         UB.blocked_id == OrderModel.owner_id),
                    and_(UB.blocker_id == OrderModel.owner_id,
                         UB.blocked_id == current_user.id),
                )
            ).exists()
        )

    # --- ВИДЫ ЗАГРУЗКИ ---
    if loading_types:
        # --- ФИКС: если это ['боковая,задняя'], а не ['боковая','задняя'] ---
        if len(loading_types) == 1 and ',' in loading_types[0]:
            loading_types = [x.strip() for x in loading_types[0].split(',')]
        query = query.filter(
            text("""
                EXISTS (
                    SELECT 1 FROM jsonb_array_elements_text(orders.loading_types) AS elem
                    WHERE elem = ANY(ARRAY[:arr]::text[])
                )
            """)
        ).params(arr=loading_types)

    if from_location not in [None, ""]:
        query = query.filter(
            text(
                f"EXISTS (SELECT 1 FROM jsonb_array_elements_text(orders.from_locations) AS t(val) WHERE lower(t.val) ILIKE lower('%{from_location}%'))")
        )
    if to_location not in [None, ""]:
        query = query.filter(
            text(
                f"EXISTS (SELECT 1 FROM jsonb_array_elements_text(orders.to_locations) AS t(val) WHERE lower(t.val) ILIKE lower('%{to_location}%'))")
        )
    if truck_type not in [None, "", "все"]:
        query = query.filter(OrderModel.truck_type == truck_type)
    # (если уже есть импорт — ничего добавлять не нужно)
    from sqlalchemy import func

    # Приводим STRING → DATE: поддерживаем 'дд.мм.гггг' и 'дд/мм/гггг'
    load_date_col = func.to_date(
        func.nullif(
            func.replace(func.coalesce(OrderModel.load_date, ""), ".", "/"),
            ""
        ),
        "DD/MM/YYYY"
    )

    def _to_date_iso(s):
        return func.to_date(s, "YYYY-MM-DD")

    if load_date_from not in [None, ""] and load_date_to not in [None, ""]:
        query = query.filter(
            load_date_col >= _to_date_iso(load_date_from),
            load_date_col <= _to_date_iso(load_date_to),
        )
    elif load_date_from not in [None, ""]:
        query = query.filter(load_date_col >= _to_date_iso(load_date_from))
    elif load_date_to not in [None, ""]:
        query = query.filter(load_date_col <= _to_date_iso(load_date_to))
    if price_from not in [None, ""]:
        query = query.filter(OrderModel.price >= price_from)
    if price_to not in [None, ""]:
        query = query.filter(OrderModel.price <= price_to)
    if with_attachments:
        query = query.filter(OrderModel.attachments != None).filter(
            OrderModel.attachments != [])
    if q not in [None, ""]:
        ilike_q = f"%{q}%"
        query = query.filter(
            (OrderModel.description.ilike(ilike_q)) |
            (OrderModel.truck_type.ilike(ilike_q)) |
            (OrderModel.comment.ilike(ilike_q))
        )

    # --- ФИЛЬТР «только Соответствия» (лёгкая версия) ---
    if matches_only and current_user is not None:
        # Берём id заявок из таблицы Match, которую заполняет auto_match_worker.
        from models import Match

        sub = (
            db.query(Match.order_id)
            .filter(
                Match.user_id == current_user.id,
                Match.order_id != None,
            )
            .distinct()
            .subquery()
        )
        query = query.filter(OrderModel.id.in_(sub))

    if DEBUG_SQL:
        print('--- SQL QUERY [orders] ---')
        print(str(query.statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={'literal_binds': True}
        )))
        print('---')

    # --- Радиусные фильтры по координатам на уровне SQL (bbox по JSON coords) ---
    def _bbox(center_lat, center_lng, radius_km):
        try:
            r = float(radius_km or 0)
        except (TypeError, ValueError):
            return None
        if center_lat is None or center_lng is None or r <= 0:
            return None

        # 1 градус широты ≈ 111 км
        lat_delta = r / 111.0
        lat_min = center_lat - lat_delta
        lat_max = center_lat + lat_delta

        # Долгота зависит от широты
        lng_delta = r / (111.0 * max(cos(radians(center_lat)), 0.1))
        lng_min = center_lng - lng_delta
        lng_max = center_lng + lng_delta

        return lat_min, lat_max, lng_min, lng_max

    # FROM‑радиус: orders.from_locations_coords (jsonb массив координат)
    bbox_from = _bbox(from_location_lat, from_location_lng, from_radius)
    if bbox_from:
        lat_min, lat_max, lng_min, lng_max = bbox_from
        query = query.filter(
            text("""
                EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(
                        COALESCE(orders.from_locations_coords, '[]'::jsonb)
                    ) AS coord
                    WHERE coord ? 'lat'
                      AND coord ? 'lng'
                      AND coord->>'lat' <> '' AND coord->>'lng' <> ''
                      AND (coord->>'lat')::double precision BETWEEN :from_lat_min AND :from_lat_max
                      AND (coord->>'lng')::double precision BETWEEN :from_lng_min AND :from_lng_max
                )
            """)
        ).params(
            from_lat_min=lat_min,
            from_lat_max=lat_max,
            from_lng_min=lng_min,
            from_lng_max=lng_max,
        )

    # TO‑радиус: orders.to_locations_coords
    bbox_to = _bbox(to_location_lat, to_location_lng, to_radius)
    if bbox_to:
        t_lat_min, t_lat_max, t_lng_min, t_lng_max = bbox_to
        query = query.filter(
            text("""
                EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(
                        COALESCE(orders.to_locations_coords, '[]'::jsonb)
                    ) AS coord
                    WHERE coord ? 'lat'
                      AND coord ? 'lng'
                      AND coord->>'lat' <> '' AND coord->>'lng' <> ''
                      AND (coord->>'lat')::double precision BETWEEN :to_lat_min AND :to_lat_max
                      AND (coord->>'lng')::double precision BETWEEN :to_lng_min AND :to_lng_max
                )
            """)
        ).params(
            to_lat_min=t_lat_min,
            to_lat_max=t_lat_max,
            to_lng_min=t_lng_min,
            to_lng_max=t_lng_max,
        )

    base_q = query.order_by(OrderModel.created_at.desc())
    # Режим выдачи: авторизованным — полный, гостям — публичный
    view_full = current_user is not None
    if response is not None:
        try:
            response.headers["X-View-Mode"] = "full" if view_full else "public"
            response.headers["X-Has-Full-Access"] = "1" if view_full else "0"
        except Exception:
            pass

    # иначе — обычная SQL пагинация
    if page and page_size:
        total = base_q.count()
        items = base_q.offset((page - 1) * page_size).limit(page_size).all()
        if response is not None:
            response.headers["X-Total-Count"] = str(total)
            response.headers["X-Page"] = str(page)
            response.headers["X-Page-Size"] = str(page_size)

        if view_full:
            return items
        else:
            return [_sanitize_order_for_limited(o) for o in items]

    items = base_q.all()
    if view_full:
        return items
    else:
        return [_sanitize_order_for_limited(o) for o in items]


@app.get("/orders/my", response_model=List[OrderOut])
def get_my_orders(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    # "Мои" — ВСЕГДА только записи текущего пользователя
    orders = (
        db.query(OrderModel)
        .filter(OrderModel.owner_id == current_user.id)
        .order_by(OrderModel.created_at.desc())
        .all()
    )
    results: List[OrderOut] = []
    for order in orders:
        order_out = OrderOut.from_orm(order)
        # нормализуем attachments на выдачу
        order_out.attachments = _normalize_attachments_read(order.attachments)
        # ВАЖНО: больше не запускаем тяжёлый пересчёт совпадений
        order_out.matchesCount = 0
        order_out.isMine = True
        results.append(order_out)
    return results


@app.get("/orders/account", response_model=List[OrderOut])
def get_account_orders(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    # Определяем роль и корневого менеджера аккаунта
    role_val = getattr(current_user.role, "value", current_user.role)
    role = (role_val or "").upper()

    if role == "MANAGER":
        account_manager_id = current_user.id
    elif role == "EMPLOYEE" and current_user.manager_id:
        account_manager_id = current_user.manager_id
    else:
        # Прочие роли — СВОИ заявки (как было у тебя раньше)
        orders = (
            db.query(OrderModel)
            .filter(OrderModel.owner_id == current_user.id)
            .order_by(OrderModel.created_at.desc())
            .all()
        )
        out: List[OrderOut] = []
        for od in orders:
            o = OrderOut.model_validate(od, from_attributes=True)
            o.matchesCount = 0
            o.isMine = True
            o.owner_name = current_user.contact_person or current_user.email
            out.append(o)
        return out

    # Все сотрудники этого менеджера
    employees = (
        db.query(UserModel)
        .filter(UserModel.manager_id == account_manager_id)
        .all()
    )
    account_user_ids = [account_manager_id] + [e.id for e in employees]

    # Заявки аккаунта
    orders = (
        db.query(OrderModel)
        .filter(OrderModel.owner_id.in_(account_user_ids))
        .order_by(OrderModel.created_at.desc())
        .all()
    )

    # Подгружаем пользователей для подписи владельца
    users = (
        db.query(UserModel)
        .filter(UserModel.id.in_(account_user_ids))
        .all()
    )
    users_by_id = {u.id: u for u in users}

    out: List[OrderOut] = []
    for od in orders:
        o = OrderOut.model_validate(od, from_attributes=True)
        o.matchesCount = 0          # тяжёлые совпадения тут не считаем
        o.isMine = (od.owner_id == current_user.id)
        owner = users_by_id.get(od.owner_id)
        o.owner_name = (owner.contact_person or owner.email) if owner else ""
        out.append(o)

    return out


@app.post("/orders", response_model=OrderSchema)
def create_order(
    order: OrderCreate,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    dbg_mem("create_order: start")

    order_data = order.dict()
    order_data["email"] = current_user.email
    order_data["owner_id"] = current_user.id

    # Гарантируем, что координаты всегда массивы
    order_data["from_locations_coords"] = order_data.get(
        "from_locations_coords") or []
    order_data["to_locations_coords"] = order_data.get(
        "to_locations_coords") or []
    if (
        order_data.get("from_locations")
        and len(order_data["from_locations_coords"]) < len(order_data["from_locations"])
    ):
        diff = len(order_data["from_locations"]) - len(
            order_data["from_locations_coords"]
        )
        order_data["from_locations_coords"].extend([{} for _ in range(diff)])

    db_order = OrderModel(**order_data)
    db.add(db_order)
    db.commit()
    db.refresh(db_order)

    # Вместо тяжёлого inline‑подбора — запускаем отдельный процесс‑воркер
    dbg_mem("create_order: before enqueue_auto_match")
    enqueue_auto_match("order", db_order.id)
    dbg_mem("create_order: after enqueue_auto_match")

    return db_order


@app.delete("/orders/{order_id}")
def delete_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    # --- Новый блок: найти все биды и уведомить их авторов ---
    from models import Bid, NotificationType
    from notifications import create_notification

    bids = db.query(Bid).filter(Bid.order_id == order_id).all()
    notified_users = set()
    for bid in bids:
        if bid.user_id in notified_users:
            continue
        notified_users.add(bid.user_id)
        create_notification(
            db,
            bid.user_id,
            NotificationType.ORDER_REMOVED,
            f"Заявка №{order.id}, на которую вы оставили ставку, была удалена.",
            related_id=str(order.id)
        )

    db.delete(order)
    db.commit()
    return {"status": "deleted"}

# --- Получение всех транспортов по email (для кабинета перевозчика) ---


@app.get("/my-transports/me")
def get_my_own_transports(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    transports = db.query(TransportModel).filter(
        TransportModel.owner_id == current_user.id
    ).order_by(TransportModel.created_at.desc()).all()

    def transport_to_dict(tr):
        return {
            "id": str(tr.id),
            "truck_type": tr.truck_type,
            "brand": getattr(tr, "brand", ""),
            "volume": tr.volume,
            "capacity": tr.weight,
            "plate_number": getattr(tr, "plate_number", ""),
            "owner": tr.contact_name or tr.email,
            "created_at": tr.created_at.strftime("%Y-%m-%d %H:%M"),
            "from_location": getattr(tr, "from_location", None),
            "from_location_lat": getattr(tr, "from_location_lat", None),
            "from_location_lng": getattr(tr, "from_location_lng", None),
        }
    return [transport_to_dict(tr) for tr in transports]


@app.get("/transports/{transport_id}", response_model=TransportSchema)
def get_transport_by_id(
    transport_id: str = ApiPath(..., description="ID транспорта"),
    db: Session = Depends(get_db)
):
    transport = db.query(TransportModel).filter(
        TransportModel.id == transport_id).first()
    if not transport:
        raise HTTPException(status_code=404, detail={
                            "code": "error.transport.notFound", "message": "Транспорт не найден"})
    return transport
# --- Получение всех заказов по email (для кабинета логиста) ---


def get_my_orders(
    email: str = Query(..., description="Email пользователя"),
    db: Session = Depends(get_db)
):
    orders = db.query(OrderModel).filter(OrderModel.email ==
                                         email).order_by(OrderModel.created_at.desc()).all()

    def order_to_dict(order):
        return {
            "id": order.id,
            "title": order.title,
            "from_location": order.from_locations[0] if order.from_locations else order.from_location or "",
            "to_location": order.to_locations[0] if order.to_locations else order.to_location or "",
            "cargo": order.cargo_items[0]['name'] if order.cargo_items else "",
            "weight": order.cargo_items[0]['tons'] if order.cargo_items else "",
            "price": order.price or "",
            "note": order.comment or "",
            "status": "active",  # тут можно реализовать реальный статус
            "created_at": order.created_at.strftime("%Y-%m-%d %H:%M"),
        }
    return [order_to_dict(order) for order in orders]


@app.get("/orders/{order_id}", response_model=OrderSchema)
def get_order_by_id(
    order_id: int = ApiPath(..., description="ID заявки"),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    order = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail={
            "code": "error.order.notFound", "message": "Заявка не найдена"
        })
    # Пэйволл отключён: любые авторизованные пользователи видят полные детали
    return order


# ------------------------------------------------------------
# PUBLIC: Упрощённые списки для карт на главной (без токена)
# ------------------------------------------------------------

@app.get("/public/orders")
def public_orders(
    from_location: str = Query(None, alias="from_location"),
    to_location: str = Query(None, alias="to_location"),
    truck_type: str = Query(None, alias="truck_type"),
    load_date_from: str = Query(None, alias="load_date_from"),
    load_date_to: str = Query(None, alias="load_date_to"),
    loading_types: Optional[List[str]] = Query(None, alias="loading_types"),
    page: Optional[int] = Query(1, ge=1),
    page_size: Optional[int] = Query(30, ge=1, le=120),
    db: Session = Depends(get_db),
):
    q = db.query(OrderModel).filter(OrderModel.is_active == True)

    # те же фильтры, что и в /orders (при необходимости добавьте сюда ваши доп. фильтры)
    if from_location:
        q = q.filter(func.lower(OrderModel.from_location).contains(
            from_location.lower()))
    if to_location:
        q = q.filter(func.lower(OrderModel.to_location).contains(
            to_location.lower()))
    if truck_type:
        q = q.filter(OrderModel.truck_type == truck_type)
    if load_date_from:
        q = q.filter(OrderModel.load_date >= load_date_from)
    if load_date_to:
        q = q.filter(OrderModel.load_date <= load_date_to)
    if loading_types:
        q = q.filter(OrderModel.loading_types.overlap(loading_types))

    q = q.order_by(OrderModel.created_at.desc())
    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()

    # Санитизируем
    return [_sanitize_order_for_limited(o) for o in items]


@app.get("/public/transports_map")
def public_transports_map(
    limit: int = Query(120, ge=1, le=200),
    db: Session = Depends(get_db),
):
    items = (
        db.query(TransportModel)
        .filter(TransportModel.is_active == True)
        .order_by(TransportModel.created_at.desc())
        .limit(limit)
        .all()
    )
    out = []
    for t in items:
        # координаты берём из from_location_coords или из старых полей lat/lng
        coords = None
        if isinstance(t.from_location_coords, dict):
            lat = t.from_location_coords.get("lat")
            lng = t.from_location_coords.get("lng")
            if lat is not None and lng is not None:
                coords = {"lat": float(lat), "lng": float(lng)}
        if coords is None and t.from_location_lat is not None and t.from_location_lng is not None:
            coords = {"lat": float(t.from_location_lat),
                      "lng": float(t.from_location_lng)}
        if not coords:
            continue
        out.append({
            "id": str(t.id),
            "from_location_coords": coords,
            "from_radius": t.from_radius,
            "truck_type": t.truck_type,
            "transport_kind": t.transport_kind,
            "load_types": t.load_types or [],
            "is_active": t.is_active,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })
    return out


@app.get("/public/orders_map")
def public_orders_map(
    limit: int = Query(120, ge=1, le=200),
    db: Session = Depends(get_db),
):
    items = (
        db.query(OrderModel)
        .filter(OrderModel.is_active == True)
        .order_by(OrderModel.created_at.desc())
        .limit(limit)
        .all()
    )
    out = []
    for o in items:
        # берём первую точку из from_locations_coords
        coords = None
        if isinstance(o.from_locations_coords, list) and o.from_locations_coords:
            first = o.from_locations_coords[0]
            if isinstance(first, dict) and "lat" in first and "lng" in first:
                coords = {"lat": float(
                    first["lat"]), "lng": float(first["lng"])}
        if not coords:
            continue
        out.append({
            "id": o.id,
            "from_locations_coords": [coords],  # SimpleMap ожидает массив
            "truck_type": getattr(o, "truck_type", None),
            "loading_types": getattr(o, "loading_types", []) or [],
            "is_active": o.is_active,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        })
    return out


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    try:
        response = await call_next(request)
        process_time = (time.time() - start_time) * 1000
        log_message = (
            f"{request.method} {request.url.path} "
            f"Status {response.status_code} "
            f"Query {dict(request.query_params)} "
            f"Process {process_time:.2f}ms"
        )
        logging.info(log_message)
        return response
    except Exception as e:
        logging.exception(
            f"Exception for {request.method} {request.url.path}: {e}")
        raise


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.error(f"UNHANDLED EXCEPTION at {request.url.path}: {repr(exc)}")
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})

# --- Модели ---


class Transport(BaseModel):
    id: Optional[str] = None
    transport_kind: str
    truck_type: str
    weight: Optional[str] = ""
    volume: Optional[str] = ""
    # Новые поля для размеров
    body_length: Optional[str] = ""
    body_width: Optional[str] = ""
    body_height: Optional[str] = ""
    trailer_length: Optional[str] = ""
    trailer_width: Optional[str] = ""
    trailer_height: Optional[str] = ""
    # Спец. поля
    special: Optional[list] = []
    crew: Optional[str] = "1"
    gps_monitor: Optional[bool] = False
    load_types: Optional[list] = []
    adr: Optional[bool] = False
    adr_class: Optional[str] = ""
    # Ставка и опции
    rate_mode: Optional[str] = "есть"
    rate_with_vat: Optional[str] = ""
    rate_without_vat: Optional[str] = ""
    rate_cash: Optional[str] = ""
    currency: Optional[str] = ""
    bargain: Optional[bool] = False
    # Маршрут
    from_location: str
    from_radius: Optional[str] = ""
    to_location: str  # Смотри ниже: это теперь строка всех направлений
    # Даты
    ready_date: str
    ready_time: Optional[str] = ""
    mode: Optional[str] = "готов к загрузке"
    regularity: Optional[str] = ""
    ready_days: Optional[str] = ""
    # Контакты
    contact_name: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    comment: Optional[str] = ""
    attachments: Optional[list] = []
    matchesCount: Optional[int] = 0


class CargoItem(BaseModel):
    name: str
    tons: str
    volume: Optional[str] = ""
    packaging: Optional[str] = ""
    pieces: Optional[str] = ""
    length: Optional[str] = ""
    width: Optional[str] = ""
    height: Optional[str] = ""
    diameter: Optional[str] = ""
    description: Optional[str] = ""


class Order(BaseModel):
    id: Optional[int] = None
    cargo_items: List[CargoItem] = []
    # остальные поля (from_locations, to_locations, routes, has_customs и т.д.)
    from_locations: Optional[List[str]] = []
    attachments: Optional[List[str]] = []
    gps_monitoring: Optional[bool] = False
    to_locations: Optional[List[str]] = []
    routes: Optional[List[str]] = []
    has_customs: Optional[bool] = False
    customs_info: Optional[str] = ""
    from_location: Optional[str] = ""
    to_location: Optional[str] = ""
    load_date: str
    unload_date: Optional[str] = ""
    truck_type: str
    transport_type: Optional[str] = "FTL"
    loading_types: Optional[List[str]] = []
    adr: Optional[bool] = False
    adr_class: Optional[str] = ""
    temp_mode: Optional[bool] = False
    temp_from: Optional[str] = ""
    temp_to: Optional[str] = ""
    comment: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    price: Optional[str] = ""
    username: Optional[str] = ""
    responses: List[dict] = []
    # --- поля ставки ---
    rate_type: Optional[str] = ""
    rate_with_vat: Optional[str] = ""
    rate_no_vat: Optional[str] = ""
    rate_cash: Optional[str] = ""
    rate_currency: Optional[str] = ""
    rate_to_card: Optional[bool] = False
    # --- поля оплаты ---
    payment_scenario: Optional[str] = ""
    payment_days: Optional[str] = ""
    prepay_amount: Optional[str] = ""
    postpay_days: Optional[str] = ""
    payment_comment: Optional[str] = ""
    requested_rate_options: Optional[list] = []


class User(BaseModel):
    id: Optional[str] = None
    email: str
    password: str
    role: str = "shipper"
    organization: Optional[str] = ""
    person_type: Optional[str] = ""
    country: Optional[str] = ""
    city: Optional[str] = ""
    contact_person: Optional[str] = ""
    phone: Optional[str] = ""
    fleet: Optional[str] = ""

# Получить все биды по заявке


@app.get("/orders/{order_id}/bids/unread_count")
def get_unread_bids_count(order_id: int, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    from models import Bid
    # Найти все новые биды по заявке, где user_id != текущий пользователь, и статус new
    unread = db.query(Bid).filter(
        Bid.order_id == order_id,
        Bid.status == 'new',
        Bid.user_id != current_user.id
    ).count()
    return {"unread": unread}


@app.post("/orders/{order_id}/bids/mark_read")
def mark_bids_as_read(order_id: int, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    from models import Bid
    # Все новые биды, где user_id != текущий пользователь и статус new, меняем статус на "viewed" (или просто не используем статус, если не хочешь)
    updated = db.query(Bid).filter(
        Bid.order_id == order_id,
        Bid.status == 'new',
        Bid.user_id != current_user.id
    ).update({"status": 'viewed'}, synchronize_session=False)
    db.commit()
    return {"ok": True, "updated": updated}


@app.get("/orders/{order_id}/bids", response_model=List[BidOut])
def get_bids(order_id: int, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    bids = db.query(Bid).filter(Bid.order_id == order_id).order_by(
        Bid.created_at.desc()).all()
    res = []
    for b in bids:
        u = db.query(UserModel).filter(UserModel.id == b.user_id).first()
        res.append(BidOut(
            id=b.id,
            order_id=b.order_id,
            user_id=b.user_id,
            amount=b.amount,
            currency=b.currency,  # <- добавили валюту
            comment=b.comment,
            status=b.status.value if hasattr(
                b.status, "value") else str(b.status),
            created_at=b.created_at,
            user_name=(u.organization if u and u.organization else (
                u.email if u else ""))
        ))
    return res

# Отправить новую ставку


@app.post("/orders/{order_id}/bids", response_model=BidOut)
def create_bid(order_id: int, bid: BidCreate, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    # Запретить повторные ставки от одного пользователя
    existing = db.query(Bid).filter(Bid.order_id == order_id,
                                    Bid.user_id == current_user.id).first()
    if existing:
        raise HTTPException(400, "Вы уже отправили ставку")
    b = Bid(
        order_id=order_id,
        user_id=current_user.id,
        amount=bid.amount,
        currency=(bid.currency or db.query(OrderModel).filter(OrderModel.id == order_id).first().rate_currency
                  if db.query(OrderModel).filter(OrderModel.id == order_id).first() else "₾"),
        comment=bid.comment,
        status=BidStatus.new
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    u = db.query(UserModel).filter(UserModel.id == b.user_id).first()

    # Уведомление для владельца заявки о новой ставке
    order = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if order and order.owner_id != current_user.id:
        from notifications import create_notification
    # уведомление владельцу заявки (i18n: key|{json}|RU)
    import json
    _params = json.dumps({}, ensure_ascii=False)  # пока без параметров
    msg = f"notif.order.newBid|{_params}|Ваша заявка получила новую ставку"
    create_notification(
        db,
        order.owner_id,
        NotificationType.BID,
        msg,
        related_id=order.id
    )

    return BidOut(
        id=b.id,
        order_id=b.order_id,
        user_id=b.user_id,
        amount=b.amount,
        currency=b.currency,
        comment=b.comment,
        status=b.status.value,
        created_at=b.created_at,
        user_name=(u.organization if u and u.organization else (
            u.email if u else ""))
    )

# Принять ставку


@app.post("/orders/{order_id}/bids/{bid_id}/accept")
def accept_bid(order_id: int, bid_id: int, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    bid = db.query(Bid).filter(Bid.id == bid_id,
                               Bid.order_id == order_id).first()
    if not bid:
        raise HTTPException(status_code=404, detail={
                            "code": "error.bid.notFound", "message": "Ставка не найдена"})

    order = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if not order or order.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail={
                            "code": "error.forbidden", "message": "Доступ запрещён"})
    # Отклонить все остальные
    db.query(Bid).filter(Bid.order_id == order_id, Bid.id !=
                         bid_id).update({"status": BidStatus.rejected})
    # Принять выбранную
    bid.status = BidStatus.accepted
    db.commit()
    # --- Открыть или найти чат ---
    from models import Chat, ChatParticipant
    chat = (
        db.query(Chat)
        .filter(Chat.order_id == order_id)
        .join(ChatParticipant, ChatParticipant.chat_id == Chat.id)
        .filter(ChatParticipant.user_id == bid.user_id)
        .first()
    )
    if not chat:
        chat = Chat(order_id=order_id)
        db.add(chat)
        db.commit()
        db.refresh(chat)
        db.add_all([
            ChatParticipant(chat_id=chat.id,
                            user_id=order.owner_id, role="OWNER"),
            ChatParticipant(chat_id=chat.id,
                            user_id=bid.user_id, role="TRANSPORT"),
        ])
        db.commit()
    # Уведомление для пользователя, чья ставка принята (i18n: code|params|ru)
    from notifications import create_notification
    import json
    _params = json.dumps({"orderId": order_id}, ensure_ascii=False)
    msg = f"notif.bid.accepted|{_params}|Ваша ставка по заявке №{order_id} принята!"
    create_notification(
        db, bid.user_id, NotificationType.BID, msg, related_id=bid.id)
    return {"chat_id": chat.id}

# Отклонить ставку

# Получить совпадающие транспорты для заявки


@app.get("/orders/{order_id}/matching_transports", response_model=List[schemas.Transport])
def get_matching_transports_for_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    order = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail={
                            "code": "error.order.notFound", "message": "Заявка не найдена"})

    from notifications import find_matching_transports
    matches = find_matching_transports(
        order, db, exclude_user_id=current_user.id)

    # отметка “новое” относительно последнего просмотра
    view = db.query(OrderMatchView).filter_by(
        user_id=current_user.id, order_id=order_id).first()
    last_view = view.last_viewed_at if view else datetime(1970, 1, 1)

    enriched = []
    for tr in matches:
        try:
            tr.is_new = bool(tr.created_at and tr.created_at > last_view)
        except Exception:
            tr.is_new = False
        enriched.append(schemas.Transport.model_validate(
            tr, from_attributes=True))
    return enriched

# Получить совпадающие заказы для транспорта


@app.get("/transports/{transport_id}/matching_orders", response_model=List[schemas.OrderOut])
def get_matching_orders_for_transport(
    transport_id: str,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    tr = db.query(models.Transport).filter(
        models.Transport.id == transport_id).first()
    if not tr:
        raise HTTPException(status_code=404, detail={
                            "code": "error.transport.notFound", "message": "Транспорт не найден"})

    matches = find_matching_orders_for_transport(
        tr, db, exclude_user_id=current_user.id)

    view = db.query(TransportMatchView).filter_by(
        user_id=current_user.id, transport_id=transport_id).first()
    last_view = view.last_viewed_at if view else datetime(1970, 1, 1)

    enriched = []
    for o in matches:
        try:
            o.is_new = bool(o.created_at and o.created_at > last_view)
        except Exception:
            o.is_new = False
        enriched.append(schemas.OrderOut.model_validate(
            o, from_attributes=True))
    return enriched


@app.post("/orders/{order_id}/bids/{bid_id}/reject")
def reject_bid(order_id: int, bid_id: int, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    bid = db.query(Bid).filter(Bid.id == bid_id,
                               Bid.order_id == order_id).first()
    if not bid:
        raise HTTPException(status_code=404, detail={
                            "code": "error.bid.notFound", "message": "Ставка не найдена"})
    order = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if not order or order.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail={
                            "code": "error.forbidden", "message": "Доступ запрещён"})
    bid.status = BidStatus.rejected
    db.commit()
    # Уведомление для пользователя, чья ставка отклонена (i18n)
    from notifications import create_notification
    import json
    _params = json.dumps({"orderId": order_id}, ensure_ascii=False)
    msg = f"notif.bid.rejected|{_params}|Ваша ставка по заявке №{order_id} отклонена"
    create_notification(
        db, bid.user_id, NotificationType.BID, msg, related_id=bid.id)
    return {"ok": True}


@app.get("/orders/{order_id}/my_bid", response_model=Optional[BidOut])
def get_my_bid(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    bid = db.query(Bid).filter_by(order_id=order_id,
                                  user_id=current_user.id).first()
    if not bid:
        # Возвращаем null вместо 404, чтобы фронт не засорял консоль
        return None
    return bid


@app.get("/bids/my")
def get_my_bids(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    from models import Bid, Order as OrderModel, User as UserModel
    bids = db.query(Bid).filter(Bid.user_id == current_user.id).order_by(
        Bid.created_at.desc()).all()
    out = []
    for b in bids:
        order = db.query(OrderModel).filter(
            OrderModel.id == b.order_id).first()
        u = db.query(UserModel).filter(UserModel.id == b.user_id).first()
        owner = db.query(UserModel).filter(
            UserModel.id == order.owner_id).first() if order else None
        from schemas import OrderShort

        out.append({    # <--- ВНУТРИ ЦИКЛА
            "id": b.id,
            "order_id": b.order_id,
            "user_id": b.user_id,
            "amount": b.amount,
            "currency": b.currency,
            "comment": b.comment,
            "status": b.status.value if hasattr(b.status, "value") else str(b.status),
            "created_at": b.created_at,
            "user_name": u.organization or u.email if u else "",
            "order": OrderShort(
                id=order.id,
                title=order.title,
                from_locations=order.from_locations or [],
                to_locations=order.to_locations or [],
                load_date=order.load_date,
                price=order.price,
                owner_company=owner.organization if owner else "",
                owner_name=(owner.contact_person or (
                    owner.email if owner else "")),
                owner_lastname="",
                cargo_items=order.cargo_items or [],   # ← добавили
                created_at=order.created_at
            ) if order else None,
        })
    return out

# === ОБЩИЕ СТАВКИ АККАУНТА (только для MANAGER) ===


@app.get("/bids/account")
def get_account_bids(
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    from fastapi import HTTPException
    from models import Bid, Order as OrderModel, User as UserModel, UserRole
    from schemas import OrderShort

    # Только менеджер видит ставки всех участников аккаунта
    if current_user.role != UserRole.MANAGER:
        raise HTTPException(
            status_code=403, detail="Только MANAGER видит ставки аккаунта")

    account_manager_id = current_user.id
    employees = db.query(UserModel).filter(
        UserModel.manager_id == account_manager_id).all()
    account_user_ids = [account_manager_id] + [e.id for e in employees]

    bids = (
        db.query(Bid)
        .filter(Bid.user_id.in_(account_user_ids))
        .order_by(Bid.created_at.desc())
        .all()
    )

    out = []
    for b in bids:
        order = db.query(OrderModel).filter(
            OrderModel.id == b.order_id).first()
        u = db.query(UserModel).filter(UserModel.id == b.user_id).first()
        owner = db.query(UserModel).filter(
            UserModel.id == order.owner_id).first() if order else None
        out.append({
            "id": b.id,
            "order_id": b.order_id,
            "user_id": b.user_id,
            "amount": b.amount,
            "currency": b.currency,  # <- добавили валюту
            "comment": b.comment,
            "status": b.status.value if hasattr(b.status, "value") else str(b.status),
            "created_at": b.created_at,
            "user_name": (u.organization or u.email) if u else "",
            "isMine": (b.user_id == current_user.id),
            "order": OrderShort(
                id=order.id,
                title=order.title,
                from_locations=order.from_locations or [],
                to_locations=order.to_locations or [],
                load_date=order.load_date,
                price=order.price,
                owner_company=owner.organization if owner else "",
                owner_name=(owner.contact_person or (
                    owner.email if owner else "")),
                owner_lastname="",
                cargo_items=order.cargo_items or [],   # ← добавили
                created_at=order.created_at
            ) if order else None,
        })
    return out


def run_async_task(coro):
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # Если нет event loop, создаём временный
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(coro)
        loop.close()
        asyncio.set_event_loop(None)
        return
    loop.create_task(coro)


@app.post("/group/create")
def create_group(
    name: str = Body(..., embed=True),
    user_ids: List[int] = Body(...),
    avatar: str = Body(None, embed=True),
    db: Session = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    group = Chat(
        is_group=True,
        group_name=name,
        group_avatar=avatar,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    participants = [ChatParticipant(
        chat_id=group.id, user_id=current_user.id, role="owner")]
    for uid in set(user_ids):
        if uid != current_user.id:
            participants.append(ChatParticipant(
                chat_id=group.id, user_id=uid, role="member"))
    db.add_all(participants)
    db.commit()
    return {"chat_id": group.id}


@router.post("/matches/mark_read")
def mark_matches_read(
    transport_id: str = None,
    order_id: int = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if not transport_id and not order_id:
        raise HTTPException(
            status_code=400, detail="transport_id or order_id required")

    query = db.query(Match).filter(Match.is_read == False)

    # Здесь зависит от того, как ты определяешь пользователя (user_id в Match)
    query = query.filter(Match.user_id == current_user.id)

    if transport_id:
        query = query.filter(Match.transport_id == transport_id)
    if order_id:
        query = query.filter(Match.order_id == order_id)

    updated = query.update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"ok": True, "updated": updated}


@router.get("/matches/unread_count")
def get_unread_matches(
    transport_id: str = None,
    order_id: int = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if not transport_id and not order_id:
        raise HTTPException(
            status_code=400, detail="transport_id or order_id required")
    query = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.type == NotificationType.AUTO_MATCH,
        Notification.read == False
    )
    if transport_id:
        query = query.filter(Notification.related_id == str(transport_id))
    if order_id:
        query = query.filter(Notification.related_id == str(order_id))
    return {"unread": query.count()}

# Получить количество новых Соответствий по заявке


@app.get("/orders/{order_id}/new_matches_count")
def get_order_new_matches_count(
    order_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Лёгкий подсчёт количества новых совпадений по заявке.

    Вместо тяжёлого find_matching_transports считаем только
    непрочитанные уведомления типа AUTO_MATCH с related_id = order_id.
    """
    order = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if not order:
        raise HTTPException(
            status_code=404,
            detail={"code": "error.order.notFound",
                    "message": "Заявка не найдена"},
        )

    new_count = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.type == NotificationType.AUTO_MATCH,
            Notification.read == False,
            Notification.related_id == str(order_id),
        )
        .count()
    )
    return {"new_matches": new_count}
# Отметить Соответствия по заявке просмотренными


@app.post("/orders/{order_id}/view_matches")
def mark_order_matches_viewed(
    order_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    now = datetime.utcnow()
    view = db.query(OrderMatchView).filter_by(
        user_id=current_user.id, order_id=order_id).first()
    if view:
        view.last_viewed_at = now
    else:
        view = OrderMatchView(user_id=current_user.id,
                              order_id=order_id, last_viewed_at=now)
        db.add(view)
    db.commit()
    return {"viewed_at": now}

# Получить количество новых Соответствий по транспорту


@app.get("/transport/{transport_id}/new_matches_count")
def get_transport_new_matches_count(
    transport_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Лёгкий подсчёт новых совпадений по транспорту.

    Считаем только непрочитанные AUTO_MATCH-уведомления с related_id = transport_id.
    """
    tr = db.query(TransportModel).filter(
        TransportModel.id == transport_id).first()
    if not tr:
        raise HTTPException(
            status_code=404,
            detail={"code": "error.transport.notFound",
                    "message": "Транспорт не найден"},
        )

    new_count = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.type == NotificationType.AUTO_MATCH,
            Notification.read == False,
            Notification.related_id == str(transport_id),
        )
        .count()
    )
    return {"new_matches": new_count}


# Отметить Соответствия по транспорту просмотренными


@app.post("/transport/{transport_id}/view_matches")
def mark_transport_matches_viewed(
    transport_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    now = datetime.utcnow()
    view = db.query(TransportMatchView).filter_by(
        user_id=current_user.id, transport_id=transport_id).first()
    if view:
        view.last_viewed_at = now
    else:
        view = TransportMatchView(
            user_id=current_user.id, transport_id=transport_id, last_viewed_at=now)
        db.add(view)
    db.commit()
    return {"viewed_at": now}


# --- Единая нормализация для ОТВЕТОВ (как у транспортов) ---
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg"}


def _normalize_attachments_read(raw: Any):
    """
    Приводит attachments к виду:
    [{name, file_type: 'images'|'files', file_url}]
    Работает и для старых записей со строками.
    """
    out = []
    if not raw:
        return out
    for it in raw:
        if isinstance(it, str):
            url = it
            name = url.split("/")[-1] if url else "file"
            ext = ("." + name.split(".")[-1].lower()) if "." in name else ""
            kind = "images" if ext in IMAGE_EXTS else "files"
            out.append({"name": name, "file_type": kind, "file_url": url})
        elif isinstance(it, dict):
            url = it.get("file_url") or it.get("url") or it.get("href") or ""
            name = it.get("name") or it.get("filename") or (
                url.split("/")[-1] if url else "file")
            file_type = it.get("file_type") or it.get("type") or ""
            if file_type in ("image", "images"):
                kind = "images"
            elif file_type in ("file", "files"):
                kind = "files"
            else:
                ext = ("." + name.split(".")
                       [-1].lower()) if "." in name else ""
                kind = "images" if ext in IMAGE_EXTS else "files"
            out.append({"name": name, "file_type": kind, "file_url": url})
    # Дедуп по file_url
    seen = set()
    uniq = []
    for a in out:
        u = a.get("file_url")
        if u in seen:
            continue
        seen.add(u)
        uniq.append(a)
    return uniq


@app.get("/attachments/{order_id}/{filename}")
def get_order_attachment(order_id: int, filename: str):
    path = f"static/orders/{order_id}/{filename}"
    if not os.path.isfile(path):
        raise HTTPException(404, "error.file.notFound")
    # Определи content_type если хочешь (можно по расширению)
    return FileResponse(path)


@app.delete("/orders/{order_id}/attachments/{filename}")
def delete_order_attachment(order_id: int, filename: str, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    order = db.query(OrderModel).filter_by(id=order_id).first()
    if not order:
        raise HTTPException(404, "error.order.notFound")
    if order.owner_id != current_user.id:
        raise HTTPException(403, "error.forbidden")
    full_path = f"static/orders/{order_id}/{filename}"
    # Удаляем файл и запись в списке
    if os.path.isfile(full_path):
        os.remove(full_path)
        new_list = []
        for it in (order.attachments or []):
            if isinstance(it, str):
                keep = not it.endswith(filename)
            else:
                url = (it or {}).get("file_url") or (it or {}).get("url") or ""
                keep = not (url.endswith(filename))
            if keep:
                new_list.append(it)
        order.attachments = new_list
        db.commit()
        return {"attachments": _normalize_attachments_read(order.attachments)}


@app.get("/users/simple_list")
def users_simple_list(db: Session = Depends(get_db), user=Depends(get_current_user)):
    users = db.query(UserModel).order_by(UserModel.id.asc()).all()
    items = []
    for u in users:
        items.append({
            "id": u.id,
            "name": getattr(u, "name", None) or getattr(u, "email", None),
            "email": getattr(u, "email", None),
            "role": getattr(u.role, "name", None) if getattr(u, "role", None) else None
        })
    return items


app.include_router(tracking_router)

# после других include_router(...)
app.include_router(admin_router)


@app.get("/blocked")
def blocked_alias():
    # 307, чтобы метод (GET) и тело запроса сохранялись корректно
    return RedirectResponse(url="/users/blocked", status_code=307)
