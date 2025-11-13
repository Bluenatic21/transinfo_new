from __future__ import annotations

from typing import Dict, List, Optional, Set
import json
from fastapi import WebSocket

# Активные WS-соединения по chat_id
active_connections: Dict[int, List[WebSocket]] = {}

def register_ws(chat_id: int, ws: WebSocket) -> None:
    active_connections.setdefault(chat_id, [])
    if ws not in active_connections[chat_id]:
        active_connections[chat_id].append(ws)

def unregister_ws(chat_id: int, ws: WebSocket) -> None:
    try:
        if ws in active_connections.get(chat_id, []):
            active_connections[chat_id].remove(ws)
    except Exception:
        pass

async def ws_emit_to_chat(chat_id: int, arg1, arg2=None, skip: Optional[WebSocket] = None):
    """
    Рассылает JSON всем активным WS-подключениям данного чата.
    Бэк-совместимо поддерживает оба варианта вызова:
      1) ws_emit_to_chat(chat_id, {"event": "name", ...}, skip=?)
      2) ws_emit_to_chat(chat_id, "name", {"...": "..."}, skip=?)
    """
    # Нормализуем payload
    if isinstance(arg1, str):
        payload: dict = {"event": arg1}
        if isinstance(arg2, dict):
            payload.update(arg2)
    else:
        payload = arg1 if isinstance(arg1, dict) else {}

    conns = list(active_connections.get(chat_id, []))
    if not conns:
        return
    drop: List[WebSocket] = []
    for ws in conns:
        if skip is not None and ws is skip:
            continue
        try:
            await ws.send_json(payload)
        except TypeError:
            # как запасной вариант приводим к json-строке (например, при datetime)
            try:
                await ws.send_json(json.loads(json.dumps(payload, default=str)))
            except Exception:
                drop.append(ws)
        except Exception:
            drop.append(ws)
    if drop:
        for ws in drop:
            try:
                active_connections[chat_id].remove(ws)
            except Exception:
                pass
