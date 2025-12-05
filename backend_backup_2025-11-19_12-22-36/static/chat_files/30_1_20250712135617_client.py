import asyncio
import websockets
import json
import logging
import time
import threading

from PyQt6.QtWidgets import QMessageBox
from SettingsWindow import SettingsWindow

with open("strings_ka.json", "r", encoding="utf-8") as f:
    STRINGS = json.load(f)
_client_thread_started = False

logging.basicConfig(level=logging.DEBUG)
message_queue = None  # глобальная переменная


def get_server_uri():
    # Получаем адрес сервера из настроек (SettingsWindow)
    settings = SettingsWindow.get_server_settings()
    is_server = settings.get("server_mode") == "1"
    ip = "127.0.0.1" if is_server else settings.get("server_ip", "127.0.0.1")
    port = int(settings.get("server_port", 8765))
    return f"ws://{ip}:{port}"


SERVER_URI = get_server_uri()
ui_instance = None  # начало с JMTGmain.py


async def connect_to_server(uri, message_queue):
    try:
        logging.info(f"🔌 Подключаемся к серверу {uri}...")
        async with websockets.connect(uri) as websocket:
            logging.info("✅ Постоянное соединение с сервером установлено.")
            await websocket.send(json.dumps({"action": "sync_all"}))
            await asyncio.gather(
                handle_messages(websocket, message_queue),
                send_from_queue(websocket, message_queue)
            )
    except Exception as e:
        logging.error(f"{STRINGS['client']['connect_error']}: {e}")


async def send_request_and_wait_response(data):
    import websockets
    import json
    from SettingsWindow import SettingsWindow
    settings = SettingsWindow.get_server_settings()
    is_server = settings.get("server_mode") == "1"
    ip = "127.0.0.1" if is_server else settings.get("server_ip", "127.0.0.1")
    port = int(settings.get("server_port", 8765))
    uri = f"ws://{ip}:{port}"

    try:
        async with websockets.connect(uri) as websocket:
            await websocket.send(json.dumps(data))
            response = await websocket.recv()
            return json.loads(response)
    except Exception as e:
        print(f"Ошибка получения ответа: {e}")
        return {}


async def send_request(websocket, data):
    try:
        await websocket.send(json.dumps(data))
        logging.debug(f"➡️ Отправлено через send_request: {data}")
    except Exception as e:
        logging.error(f"❌ Ошибка при отправке через send_request: {e}")


def send_through_connection(data):
    global message_queue
    t_send = time.time()
    print(
        f"[CLIENT] [send_through_connection] отправка на сервер: {t_send:.6f}")
    print("[CLIENT SEND] (universal)", data)
    if message_queue:
        message_queue.put_nowait(data)
    else:
        logging.error("message_queue не инициализирована")


async def send_from_queue(websocket, message_queue):
    logging.info("📤 Очередь отправки запущена")
    while True:
        data = await message_queue.get()
        t_before = time.time()
        print(f"[CLIENT] [send_from_queue] ДО отправки: {t_before:.6f}")
        try:
            await websocket.send(json.dumps(data))
            t_after = time.time()
            print(
                f"[CLIENT] [send_from_queue] ПОСЛЕ отправки: {t_after:.6f} (+{t_after-t_before:.4f}s)")
            logging.debug(f"➡️ Отправлено через очередь: {data}")
        except Exception as e:
            logging.error(f"❌ Ошибка при отправке: {e}")


async def handle_messages(websocket, message_queue):
    async for message in websocket:
        try:
            data = json.loads(message)
            logging.debug(f"{STRINGS['client']['received']}: {data}")
            await handle_server_message(websocket, data)
        except Exception as e:
            logging.error(f"{STRINGS['client']['handle_error']}: {e}")


async def handle_server_message(websocket, data):
    action = data.get("action")
    logging.info(f"client.py: {action}")

    if action == "sync_all":
        requests = data.get("data", [])
        logging.info(
            f"client.py: {STRINGS['client']['received']}: {len(requests)}")
        if ui_instance:
            ui_instance.async_signals.update_tasks_signal.emit(requests)
            print("[CLIENT] ⏱ ПОЛУЧЕН MASS SYNC ОТ СЕРВЕРА:", time.time())

    elif action == "new_request":
        if ui_instance:
            request = data.get("data")
            if request:
                t_client = time.time()
                print(
                    f"[CLIENT] [new_request] получено от сервера: {t_client:.6f}")
                # Вместо пересоздания всего списка — добавляем или обновляем одну заявку:
                ui_instance.async_signals.update_single_task_signal.emit(
                    request)

    elif action == "trigger_sync":
        logging.info("📡 Получен сигнал trigger_sync — выполняем sync_all")
        await send_request(websocket, {"action": "sync_all"})

    elif action == "response":
        status = data.get("status")
        message = data.get("message")
        if status == "success":
            logging.info(f"{STRINGS['client']['response_success']}: {message}")
            if ui_instance:
                ui_instance.log_message_to_ui(f"✅ {message}")
        else:
            logging.warning(f"{STRINGS['client']['response_fail']}: {data}")
            if ui_instance:
                ui_instance.log_message_to_ui(
                    f"⚠️ {STRINGS['client']['response_fail']}: {message}")

    elif "error" in data:
        logging.error(f"{STRINGS['client']['response_fail']}: {data['error']}")
        if ui_instance:
            ui_instance.log_message_to_ui(
                f"{STRINGS['client']['response_fail']}: {data['error']}")

    elif action == "download_file":
        filename = data.get("filename")
        file_b64 = data.get("filedata")
        import base64
        file_bytes = base64.b64decode(file_b64)
        if ui_instance and hasattr(ui_instance, "async_signals"):
            ui_instance.async_signals.file_save_dialog_signal.emit(
                filename, file_bytes)

    elif action == "add_comment":
        # Можно тут обновить UI, если нужно, или просто игнорировать успешный ответ
        logging.info(f"Комментарий успешно добавлен: {data}")

    else:
        logging.warning(f"{STRINGS['client']['unknown']}: {data}")


def attach_download_file(self, parent_dlg, file_list):
    selected = file_list.currentItem()
    if not selected:
        QMessageBox.warning(
            self, STRINGS["message_boxes"]["select_file_for_download"])
        return
    filename = selected.text()
    from client import send_request_threadsafe
    send_request_threadsafe({
        "action": "download_file",
        "task_id": self.request_data["id"],
        "filename": filename
    })
    # Далее жди, когда от сервера придёт ответ с файлом (обработка в client.py)


def send_request_threadsafe(data):
    loop = asyncio.get_event_loop()
    if loop.is_running():
        asyncio.run_coroutine_threadsafe(_send_in_connected_loop(data), loop)
    else:
        loop.run_until_complete(_send_in_connected_loop(data))


async def _send_in_connected_loop(data):
    try:
        async with websockets.connect(SERVER_URI) as websocket:
            await send_request(websocket, data)
    except Exception as e:
        msg = f"{STRINGS['client']['connect_error']}: {e}"
        logging.error(msg)
        if ui_instance and hasattr(ui_instance, "log_message_to_ui"):
            ui_instance.log_message_to_ui(msg)


def start_client_async():
    global message_queue
    message_queue = asyncio.Queue()
    uri = get_server_uri()
    try:
        asyncio.run(connect_to_server(uri, message_queue))
    except Exception as e:
        logging.error(f"🚫 Ошибка в async-клиенте: {e}")


def start_client_thread():
    global _client_thread_started
    if _client_thread_started:
        print(f">>> [DEBUG] Клиент уже запущен! ({time.time()})")
        return
    _client_thread_started = True
    print(
        f">>> [DEBUG] Запуск потока клиента: start_client_thread() ({time.time()})")
    t = threading.Thread(target=start_client_async, daemon=True)
    t.start()
