from __future__ import annotations

from typing import Optional
import base64
import json
import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from database import SessionLocal
from models import User as UserModel, ChatParticipant, ChatMessage
import models  # для ChatMessageReaction
from notifications import push_notification, user_notification_connections
from auth import get_token_from_header_or_cookie
from ws_events import register_ws, unregister_ws, ws_emit_to_chat, active_connections

from datetime import datetime, timezone

ws_router = APIRouter()

# In-memory call sessions per chat
CALL_SESSIONS = {}  # {chat_id: {caller_id, start_ts, answered, connect_ts, media, logged}}


def _ws_extract_token(websocket: WebSocket) -> Optional[str]:
    # subprotocols: "bearer, <JWT>"
    proto = websocket.headers.get("sec-websocket-protocol") or ""
    parts = [p.strip() for p in proto.split(",") if p.strip()]
    for p in parts:
        if p.lower() in ("bearer", "jwt", "token"):
            continue
        if p.count(".") == 2:
            return p
    return None


def _jwt_user_id(token: Optional[str]) -> Optional[int | str]:
    if not token:
        return None
    try:
        from jose import jwt as _jwt
        claims = _jwt.get_unverified_claims(token)
    except Exception:
        try:
            payload_b64 = token.split(".")[1]
            payload_b64 += "=" * (-len(payload_b64) % 4)
            claims = json.loads(base64.urlsafe_b64decode(
                payload_b64).decode("utf-8"))
        except Exception:
            return None
    uid = claims.get("user_id") or claims.get(
        "id") or claims.get("uid") or claims.get("sub")
    try:
        return int(uid)
    except Exception:
        return uid if uid else None


@ws_router.websocket("/ws/chat/{chat_id}")
async def chat_websocket(websocket: WebSocket, chat_id: int):
    # — логируем запрошенные subprotocols
    req_proto = (websocket.headers.get("sec-websocket-protocol") or "")
    asked = [p.strip() for p in req_proto.split(",") if p.strip()]
    chosen_proto = "bearer" if "bearer" in asked else None
    print(
        f"[WS CHAT] >>> handler picked chat_id={chat_id} asked={asked} chosen={chosen_proto}")

    # 1) Принять рукопожатие СРАЗУ, чтобы не словить 403 на handshake
    try:
        await websocket.accept(subprotocol=chosen_proto)
    except Exception as e:
        print(f"[WS CHAT] accept() failed: {e}")
        return

    db = SessionLocal()
    try:
        # 2) Токен: query (?token / ?access_token) -> заголовок/кука -> subprotocol
        token_value = (
            websocket.query_params.get("token")
            or websocket.query_params.get("access_token")
            or get_token_from_header_or_cookie(websocket=websocket)
            or _ws_extract_token(websocket)
        )

        # Разрешаем dev-фолбэк: можно без токена, если есть user_id в query
        if not token_value and not websocket.query_params.get("user_id"):
            print(
                f"[WS-CHAT] reject: no token & no user_id "
                f"(chat_id={chat_id}, origin={websocket.headers.get('origin')}, proto={req_proto})"
            )
            try:
                await websocket.send_json({"event": "error", "message": "error.ws.noToken"})
            except Exception:
                pass
            await websocket.close(code=4401)
            return

        # 3) user_id: сначала из query (?user_id=.), иначе — из JWT payload
        user_id: int | None = None
        uid_q = websocket.query_params.get("user_id")
        if uid_q:
            try:
                user_id = int(uid_q)
            except ValueError:
                user_id = None

        if user_id is None and token_value:
            user_id = _jwt_user_id(token_value)

        if not user_id:
            print(
                f"[WS-CHAT] reject: no user_id (chat_id={chat_id}) "
                f"q={dict(websocket.query_params)} proto={websocket.headers.get('sec-websocket-protocol')} "
                f"auth={websocket.headers.get('authorization')}"
            )
            await websocket.close(code=4401)
            return

        # 4) находим пользователя
        try:
            uid = int(user_id)
            user = db.query(UserModel).filter_by(id=uid).first()
        except Exception:
            user = db.query(UserModel).filter_by(email=str(user_id)).first()
        if not user:
            await websocket.close(code=4401)
            return

        # 5) участие проверяем «мягко»: не рвём соединение, если записи ещё нет
        participant = db.query(ChatParticipant).filter_by(
            chat_id=chat_id, user_id=user.id).first()
        if not participant:
            try:
                db.add(ChatParticipant(chat_id=chat_id, user_id=user.id))
                db.commit()
                participant = db.query(ChatParticipant).filter_by(
                    chat_id=chat_id, user_id=user.id).first()
            except Exception:
                db.rollback()
                # подождать и перечитать (если параллельно закоммитился /join)
                try:
                    import asyncio
                    await asyncio.sleep(0.2)
                    participant = db.query(ChatParticipant).filter_by(
                        chat_id=chat_id, user_id=user.id).first()
                except Exception:
                    participant = None
        # даже если не нашли — продолжаем, чтобы работал сигнальный канал

        # 6) регистрируем соединение и дальше обычная обработка сообщений/сигналов
        register_ws(chat_id, websocket)

        # 7) Основной цикл приёма
        while True:
            data = await websocket.receive_json()

            # --- Служебные ---
            t = data.get("type")
            if t in ("ping", "init", "handshake"):
                # важно отвечать, иначе клиент будет думать, что соединение «мертвое»
                try:
                    await websocket.send_json({"type": "pong"})
                except Exception:
                    pass
                continue

            # --- Прочитано/seen ---
            if data.get("action") in ("seen", "mark_read"):
                # TODO: вставь свою существующую логику mark_read/seen (если есть)
                continue

            # --- РЕАКЦИИ ---
            if data.get("action") == "add_reaction":
                message_id = data.get("message_id")
                reaction = data.get("reaction")
                if message_id and reaction:
                    try:
                        db.query(models.ChatMessageReaction).filter_by(
                            message_id=message_id, user_id=user.id
                        ).delete()
                        db.commit()

                        new_reaction = models.ChatMessageReaction(
                            message_id=message_id,
                            user_id=user.id,
                            reaction=reaction
                        )
                        db.add(new_reaction)
                        db.commit()
                        db.refresh(new_reaction)

                        all_reactions = db.query(models.ChatMessageReaction).filter_by(
                            message_id=message_id
                        ).all()
                        out_reactions = [{
                            "id": r.id,
                            "message_id": r.message_id,
                            "user_id": r.user_id,
                            "reaction": r.reaction,
                            "created_at": str(r.created_at)
                        } for r in all_reactions]

                        await ws_emit_to_chat(
                            chat_id,
                            "reaction_update",
                            {"chat_id": chat_id, "message_id": message_id,
                                "reactions": out_reactions},
                            skip=None
                        )
                    except Exception as e:
                        print(f"[WS ERROR] add_reaction failed: {e}")
                continue

            if data.get("action") == "remove_reaction":
                message_id = data.get("message_id")
                if message_id:
                    try:
                        db.query(models.ChatMessageReaction).filter_by(
                            message_id=message_id, user_id=user.id
                        ).delete()
                        db.commit()

                        all_reactions = db.query(models.ChatMessageReaction).filter_by(
                            message_id=message_id
                        ).all()
                        out_reactions = [{
                            "id": r.id,
                            "message_id": r.message_id,
                            "user_id": r.user_id,
                            "reaction": r.reaction,
                            "created_at": str(r.created_at)
                        } for r in all_reactions]

                        await ws_emit_to_chat(
                            chat_id,
                            "reaction_update",
                            {"chat_id": chat_id, "message_id": message_id,
                                "reactions": out_reactions},
                            skip=None
                        )
                    except Exception as e:
                        print(f"[WS ERROR] remove_reaction failed: {e}")
                continue

            # --- WebRTC сигналы ---
            _webrtc_type = data.get("type")
            if _webrtc_type in ("webrtc-offer", "webrtc-answer", "webrtc-ice", "webrtc-hangup"):
                try:
                    payload_out = {"chat_id": chat_id, "from_user_id": user.id}
                    media = data.get("media", "audio")

                    if _webrtc_type == "webrtc-offer":
                        payload_out.update(
                            {"event": "webrtc-offer", "sdp": data.get("sdp"), "media": media})
                        # Рассылка по участникам чата (кроме отправителя)
                        await ws_emit_to_chat(chat_id, payload_out, skip=websocket)
                        # Пуш в глобальные нотификации
                        try:
                            participants = db.query(ChatParticipant).filter_by(
                                chat_id=chat_id).all()
                            delivered = 0
                            for p in participants:
                                u_id = p.user_id
                                if u_id == user.id:
                                    continue
                                sockets = user_notification_connections.get(
                                    str(u_id)) or set()
                                for gws in list(sockets):
                                    try:
                                        await gws.send_json({
                                            "event": "incoming_call",
                                            "chat_id": chat_id,
                                            "from_user_id": user.id,
                                            "media": media,
                                            "sdp": data.get("sdp")
                                        })
                                        delivered += 1
                                    except Exception:
                                        try:
                                            sockets.discard(gws)
                                        except Exception:
                                            pass
                            print(
                                f"[CALL] incoming_call chat={chat_id} delivered={delivered}")
                        except Exception as e:
                            print(
                                f"[WS][CALL] incoming_call notify error: {e}")

                    elif _webrtc_type == "webrtc-answer":
                        payload_out.update(
                            {"event": "webrtc-answer", "sdp": data.get("sdp"), "media": media})
                        await ws_emit_to_chat(chat_id, payload_out, skip=websocket)

                    elif _webrtc_type == "webrtc-ice":
                        payload_out.update(
                            {"event": "webrtc-ice", "candidate": data.get("candidate"), "media": media})
                        await ws_emit_to_chat(chat_id, payload_out, skip=websocket)

                    elif _webrtc_type == "webrtc-hangup":
                        payload_out.update(
                            {"event": "webrtc-hangup", "media": media})
                        await ws_emit_to_chat(chat_id, payload_out, skip=websocket)
                except Exception as e:
                    print(f"[WS ERROR] WebRTC handling failed: {e}")
                continue  # не создаём сообщение в БД

            # --- Обычное сообщение ---
            if not data.get("content") and not data.get("file_id"):
                continue

            msg = ChatMessage(
                chat_id=chat_id,
                sender_id=user.id,
                content=data.get("content"),
                message_type=data.get("message_type", "text"),
                file_id=data.get("file_id"),
                order_id=data.get("order_id"),
                transport_id=data.get("transport_id"),
            )
            db.add(msg)
            db.commit()
            db.refresh(msg)

            outgoing = {
                "id": msg.id,
                "sender_id": msg.sender_id,
                "content": msg.content,
                "message_type": msg.message_type,
                "file_id": msg.file_id,
                "file": {
                    "file_url": msg.file.file_url if msg.file else None,
                    "name": msg.file.filename if msg.file else None,
                    "file_type": msg.file.file_type if msg.file else None
                } if msg.file_id and msg.file else None,
                "order_id": msg.order_id,
                "transport_id": str(msg.transport_id) if msg.transport_id else None,
                "sent_at": str(msg.sent_at)
            }

            # Пуш всем участникам, кроме отправителя, через /ws/notifications
            participants = db.query(ChatParticipant).filter_by(
                chat_id=chat_id).all()
            for p in participants:
                receiver_user_id = p.user_id
                if receiver_user_id != user.id:
                    await push_notification(receiver_user_id, {
                        "event": "new_message",
                        "chat_id": chat_id,
                        "message": outgoing,
                    })

            # Рассылка по сокетам чата
            await ws_emit_to_chat(chat_id, {"event": "message.new", "chat_id": chat_id, "message": outgoing}, skip=None)

    except WebSocketDisconnect:
        pass  # нормальное закрытие клиентом
    except Exception as e:
        print(f"[WS ERROR] Chat {chat_id}: {repr(e)}")
        try:
            import traceback as _tb
            _tb.print_exc()
        except Exception:
            pass
        try:
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.close()
        except Exception:
            pass
    finally:
        try:
            unregister_ws(chat_id, websocket)
        except Exception:
            pass
        try:
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.close()
        except Exception:
            pass
        try:
            db.close()
        except Exception:
            pass
