# chat_upload.py
# -*- coding: utf-8 -*-
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any
import re

from fastapi import (
    APIRouter,
    UploadFile,
    File,
    Depends,
    HTTPException,
    status,
)
from sqlalchemy.orm import Session

router = APIRouter(tags=["chat-upload"])

# ----- Пути хранения -----
BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "static" / "chat_files"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
SAFE_URL_PREFIX = "/static/chat_files"

# ----- Импорт get_db с резервными вариантами -----
def _import_get_db():
    try:
        from app.database import get_db as _g  # типовой путь
        return _g
    except Exception:
        try:
            from database import get_db as _g   # альтернативный
            return _g
        except Exception:
            try:
                from utils.database import get_db as _g  # ещё один частый вариант
                return _g
            except Exception:
                return None

__get_db = _import_get_db()

def get_db():
    """
    Обёртка для зависимостей FastAPI. Вызывает реальный get_db(),
    если он найден. Иначе — даёт понятную 500‑ю ошибку.
    """
    if __get_db is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="get_db() не найден. Исправьте импорт в chat_upload.py под ваш модуль БД.",
        )
    # Ожидаем, что реальный get_db — генератор, как в типовом шаблоне FastAPI
    yield from __get_db()

# ----- Импорт get_current_user -----
def _import_get_current_user():
    try:
        from auth import get_current_user as f  # чаще всего
        return f
    except Exception:
        try:
            from app.auth import get_current_user as f
            return f
        except Exception:
            return None

__get_current_user = _import_get_current_user()

if __get_current_user is None:
    def get_current_user(*_args, **_kwargs):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="get_current_user() не найден. Исправьте импорт в chat_upload.py.",
        )
else:
    get_current_user = __get_current_user  # type: ignore

# ----- Импорт модели ChatFile (опционально) -----
ChatFile = None
try:
    from app.models import ChatFile  # type: ignore[attr-defined]
except Exception:
    try:
        from models import ChatFile  # type: ignore[attr-defined]
    except Exception:
        ChatFile = None  # допустим режим без записи в БД

# ----- Утилиты -----
_filename_re = re.compile(r"[^A-Za-z0-9_.\-]+")

def _safe_filename(name: str) -> str:
    """Нормализует имя файла (безопасные символы, ограничение длины)."""
    name = Path(name).name
    name = _filename_re.sub("_", name)
    return name[:180] or "file.bin"

# ----- Эндпоинт -----
@router.post("/chat/{chat_id}/upload", status_code=status.HTTP_201_CREATED)
async def upload_file(
    chat_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: Any = Depends(get_current_user),
):
    if not file:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Файл не передан.")

    original = file.filename or "upload.bin"
    now = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    user_id = getattr(user, "id", None) or getattr(user, "user_id", None) or "anon"

    storage_fn = _safe_filename(f"{chat_id}_{user_id}_{now}_{original}")
    target_path = UPLOAD_DIR / storage_fn
    contents = await file.read()
    if not contents:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Пустой файл.")

    with target_path.open("wb") as fh:
        fh.write(contents)

    file_url = f"{SAFE_URL_PREFIX}/{storage_fn}"

    if ChatFile is not None:
        # Если модель доступна — сохраняем запись в БД
        try:
            obj = ChatFile(
                chat_id=chat_id,
                uploader_id=user_id,
                filename=original,
                file_type=getattr(file, "content_type", None) or "application/octet-stream",
                file_url=file_url,
            )
            db.add(obj)
            db.commit()
            db.refresh(obj)
            return {"file_id": getattr(obj, "id", None), "file_url": file_url}
        except Exception as exc:
            try:
                db.rollback()
            except Exception:
                pass
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                f"Ошибка сохранения записи ChatFile: {exc}",
            ) from exc

    # Фолбэк: если модели ChatFile нет — возвращаем только ссылку
    return {"file_id": None, "file_url": file_url}
