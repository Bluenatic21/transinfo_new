
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from typing import Dict, Set, Any, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from auth import get_token_from_header_or_cookie
from jose import jwt

router = APIRouter()

# Подписки по user_id: кому слать события про шаринг GPS
track_user_connections: Dict[int, Set[WebSocket]] = defaultdict(set)


async def _ws_send_safe(ws: WebSocket, payload: Any) -> bool:
    try:
        await ws.send_json(payload)
        return True
    except TypeError:
        try:
            await ws.send_text(json.dumps(payload, default=str))
            return True
        except Exception:
            return False
    except Exception:
        return False


async def _emit_to_user(user_id: int, payload: Any) -> None:
    conns = list(track_user_connections.get(int(user_id), set()))
    if not conns:
        return
    drop: list[WebSocket] = []
    for ws in conns:
        ok = await _ws_send_safe(ws, payload)
        if not ok:
            drop.append(ws)
    if drop:
        for ws in drop:
            try:
                track_user_connections[int(user_id)].discard(ws)
            except Exception:
                pass


# ===== Эмиттеры для вызова из REST-обработчиков =====
def emit_incoming_share(*, from_user_id: int, to_user_id: int, session: dict) -> None:
    payload = {
        "type": "incoming_share",
        "from_user_id": int(from_user_id),
        "to_user_id": int(to_user_id),
        "session": session,
    }
    asyncio.create_task(_emit_to_user(to_user_id, payload))


def emit_incoming_unshare(*, from_user_id: int, to_user_id: int, session_id: str, reason: Optional[str] = None) -> None:
    payload = {
        "type": "incoming_unshare",
        "from_user_id": int(from_user_id),
        "to_user_id": int(to_user_id),
        "session": {"id": session_id},
        "reason": reason,
    }
    asyncio.create_task(_emit_to_user(to_user_id, payload))


def emit_outgoing_share(*, from_user_id: int, to_user_id: int, session: dict) -> None:
    payload = {
        "type": "outgoing_share",
        "from_user_id": int(from_user_id),
        "to_user_id": int(to_user_id),
        "session": session,
    }
    asyncio.create_task(_emit_to_user(from_user_id, payload))


def emit_outgoing_unshare(*, from_user_id: int, to_user_id: int, session_id: str, reason: Optional[str] = None) -> None:
    payload = {
        "type": "outgoing_unshare",
        "from_user_id": int(from_user_id),
        "to_user_id": int(to_user_id),
        "session": {"id": session_id},
        "reason": reason,
    }
    asyncio.create_task(_emit_to_user(from_user_id, payload))


@router.websocket("/ws/track/shares_user")
async def ws_shares_for_user(websocket: WebSocket) -> None:
    # Совместимость с Safari/Firefox
    subproto = websocket.headers.get("sec-websocket-protocol")
    try:
        await websocket.accept(subprotocol=subproto)
    except Exception:
        return

    # Токен из заголовка/куки/Query (?token=)
    try:
        token_value = get_token_from_header_or_cookie(
            request=None, websocket=websocket)
    except Exception:
        token_value = websocket.query_params.get("token")
    if not token_value:
        await websocket.close()
        return

    # user_id из JWT (fallback — ?user_id=)
    try:
        payload = jwt.get_unverified_claims(token_value)
        user_id = int(payload.get("sub") or payload.get(
            "user_id") or payload.get("id"))
    except Exception:
        user_id = None
    if not user_id:
        uid_q = websocket.query_params.get("user_id")
        try:
            user_id = int(uid_q) if uid_q else None
        except Exception:
            user_id = None
    if not user_id:
        await websocket.close()
        return

    track_user_connections[int(user_id)].add(websocket)
    try:
        # держим соединение, отвечаем на ping
        while True:
            text = await websocket.receive_text()
            if not text:
                continue
            try:
                msg = json.loads(text)
            except Exception:
                msg = {}
            if msg.get("type") == "ping":
                try:
                    await websocket.send_json({"type": "pong"})
                except Exception:
                    pass
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        try:
            track_user_connections[int(user_id)].discard(websocket)
        except Exception:
            pass
        try:
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.close()
        except Exception:
            pass


# ---- Back-compat alias ------------------------------------------------------
# На фронте ранее использовался путь /ws/track/shares_session.
# Оставим совместимость, чтобы ничего не ломалось во время централизованной миграции.
@router.websocket("/ws/track/shares_session")
async def ws_shares_session(websocket: WebSocket) -> None:
    # просто делегируем в основной обработчик
    await ws_shares_for_user(websocket)
