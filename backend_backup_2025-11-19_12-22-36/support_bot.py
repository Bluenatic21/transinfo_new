# backend/support_bot.py
import asyncio
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Dict, Optional

# Типы «хуков», которые мы получаем от вашего сервера:
# (chat_id, text, meta) -> save+broadcast (persisted)
SendSystemFn = Callable[[int, str, dict], Awaitable[None]]
# (chat_id, action, payload) -> WS only (not persisted)
SendEphemeralFn = Callable[[int, str, dict], Awaitable[None]]
CheckAssignedFn = Callable[[], Awaitable[bool]
                           ]                      # -> True if assigned
# -> {"position": int, "eta_minutes": int}
QueueInfoFn = Callable[[], Awaitable[dict]]


@dataclass
class BotTasks:
    sequence: Optional[asyncio.Task] = None
    queue: Optional[asyncio.Task] = None


_active: Dict[int, BotTasks] = {}   # key: chat_id


async def _typing(ephemeral: SendEphemeralFn, chat_id: int, on: bool):
    await ephemeral(chat_id, "support.typing", {"chat_id": chat_id, "is_typing": on})


async def _run_sequence(chat_id: int,
                        send_system: SendSystemFn,
                        ephemeral: SendEphemeralFn,
                        is_assigned: CheckAssignedFn,
                        ticket_no: int):
    try:
        # Шаг 1: маленькая задержка + "печатает" + Сообщение 1
        await _typing(ephemeral, chat_id, True)
        await asyncio.sleep(1.2)
        if await is_assigned():
            return
        await _typing(ephemeral, chat_id, False)
        await send_system(chat_id, "support.queue.received", {
            "kind": "support.welcome.step1"
        })

        # Шаг 2
        await _typing(ephemeral, chat_id, True)
        await asyncio.sleep(0.9)
        if await is_assigned():
            return
        await _typing(ephemeral, chat_id, False)
        await send_system(chat_id, "support.queue.typicalEta", {
            "kind": "support.welcome.step2"
        })

        # Шаг 3
        await _typing(ephemeral, chat_id, True)
        await asyncio.sleep(0.6)
        if await is_assigned():
            return
        await _typing(ephemeral, chat_id, False)
        await send_system(chat_id, "support.queue.ticketNo", {
            "kind": "support.welcome.step3",
            "ticket_no": ticket_no
        })
    except asyncio.CancelledError:
        # Тихо выходим и гасим индикатор набора
        await _typing(ephemeral, chat_id, False)
        raise


async def _run_queue_updates(chat_id: int,
                             ephemeral: SendEphemeralFn,
                             is_assigned: CheckAssignedFn,
                             get_queue_info: QueueInfoFn):
    try:
        while True:
            if await is_assigned():
                # Как только назначен — баннер больше не нужен
                await ephemeral(chat_id, "support.queue_update", {
                    "chat_id": chat_id, "position": None, "eta_minutes": None
                })
                return
            info = await get_queue_info()
            await ephemeral(chat_id, "support.queue_update", {
                "chat_id": chat_id,
                "position": info.get("position"),
                "eta_minutes": info.get("eta_minutes"),
            })
            await asyncio.sleep(15)
    except asyncio.CancelledError:
        # При отмене — просто убираем баннер
        await ephemeral(chat_id, "support.queue_update", {
            "chat_id": chat_id, "position": None, "eta_minutes": None
        })
        raise


def _ensure_tasks(chat_id: int) -> BotTasks:
    if chat_id not in _active:
        _active[chat_id] = BotTasks()
    return _active[chat_id]


async def start_for_chat(*,
                         chat_id: int,
                         ticket_no: int,
                         send_system: SendSystemFn,
                         send_ephemeral: SendEphemeralFn,
                         is_assigned: CheckAssignedFn,
                         get_queue_info: QueueInfoFn):
    """Запуск бота ожидания для данного чата поддержки."""
    tasks = _ensure_tasks(chat_id)
    # если уже крутится — перезапускать не нужно
    if tasks.sequence and not tasks.sequence.done():
        return
    if tasks.queue and not tasks.queue.done():
        return

    loop = asyncio.get_running_loop()
    tasks.sequence = loop.create_task(_run_sequence(
        chat_id, send_system, send_ephemeral, is_assigned, ticket_no
    ))
    tasks.queue = loop.create_task(_run_queue_updates(
        chat_id, send_ephemeral, is_assigned, get_queue_info
    ))


async def cancel_for_chat(chat_id: int):
    """Отмена всех задач бота для чата (назначили оператора / оператор написал / тикет закрыт)."""
    tasks = _active.get(chat_id)
    if not tasks:
        return
    for t in (tasks.sequence, tasks.queue):
        if t and not t.done():
            t.cancel()
            try:
                await t
            except asyncio.CancelledError:
                pass
    _active.pop(chat_id, None)
