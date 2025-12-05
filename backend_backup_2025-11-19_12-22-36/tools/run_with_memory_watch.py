#!/usr/bin/env python3

"""Run the FastAPI app with live memory monitoring.

This helper boots uvicorn the same way as ``uvicorn main:app`` but, while the
server is running, periodically reports process RSS usage together with the
current and peak Python heap tracked by ``tracemalloc``.  Whenever the RSS
usage grows more than the configured threshold compared to the previous
baseline, the watcher also prints the top locations responsible for the growth
according to ``tracemalloc`` so the output can be shared for debugging
potential leaks.

Usage example (from the ``backend`` directory)::

    python3 tools/run_with_memory_watch.py --reload --threshold-mb 50

``python3`` is used explicitly because many production servers (включая тот,
на котором крутится Transinfo) не имеют алиаса ``python``.  Альтернатива —
сделать файл исполняемым и запускать его напрямую ``./tools/run_with_memory_watch.py``
из-под активированного виртуального окружения.  Скрипт также попробует
автоматически перезапуститься из ``.venv`` рядом с проектом, если uvicorn не
обнаружен в текущем интерпретаторе.  Перед запуском uvicorn скрипт проверяет,
что указанный порт свободен, и подсказывает остановить systemd-службу или
запустить мониторинг на альтернативном порту (``--port``), если боевой сервис
уже занимает 8000.

The command is intended to be run from VSCode's integrated terminal while the
developer interacts with the site.  When memory growth is detected, copy the
printed report and share it so we can analyse the culprit lines.
"""

from __future__ import annotations

import argparse
import importlib
import socket
import signal
import sys
import threading
import time
import traceback
from contextlib import contextmanager
from datetime import datetime
from typing import Iterable, List, Optional

import os
import tracemalloc
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _ensure_project_root_on_path() -> None:
    project_str = str(PROJECT_ROOT)
    if project_str not in sys.path:
        sys.path.insert(0, project_str)


_ensure_project_root_on_path()


def _maybe_reexec_with_local_venv() -> None:
    """If a sibling ``.venv`` exists, re-exec the script using its python."""

    if os.environ.get("RUN_WITH_MEMORY_WATCH_REEXECUTED") == "1":
        return

    project_root = Path(__file__).resolve().parents[1]
    candidates = [
        project_root / ".venv" / "bin" / "python",
        project_root / ".venv" / "Scripts" / "python.exe",
    ]
    for candidate in candidates:
        if candidate.exists() and candidate != Path(sys.executable):
            env = dict(os.environ)
            env["RUN_WITH_MEMORY_WATCH_REEXECUTED"] = "1"
            os.execvpe(str(candidate), [str(candidate), *sys.argv], env)


def _ensure_uvicorn_available():
    try:
        import uvicorn as uvicorn_module
    except ImportError as exc:  # pragma: no cover - guard for unexpected envs
        _maybe_reexec_with_local_venv()
        raise SystemExit(
            "uvicorn is not available. Activate the project's virtualenv or run "
            "`pip install -r requirements.txt`."
        ) from exc
    else:
        return uvicorn_module


uvicorn = _ensure_uvicorn_available()


def _port_is_available(host: str, port: int) -> bool:
    """Return True when the requested host/port combo looks free."""

    candidates = [host]
    if host in {"0.0.0.0", "::"}:
        candidates.extend(["127.0.0.1", "::1"])

    for candidate in candidates:
        family = socket.AF_INET6 if ":" in candidate else socket.AF_INET
        try:
            with socket.create_connection((candidate, port), timeout=0.5):
                return False
        except OSError:
            continue

    family = socket.AF_INET6 if ":" in host else socket.AF_INET
    with socket.socket(family, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


def _read_rss_kb() -> Optional[int]:
    """Return RSS in kilobytes by reading ``/proc/self/status``.

    ``/proc`` is available on Linux which is what we expect in both the
    deployment servers and local dev containers.  On other platforms the
    function returns ``None`` so the watcher can degrade gracefully.
    """

    try:
        with open("/proc/self/status", "r", encoding="utf-8") as status_file:
            for line in status_file:
                if line.startswith("VmRSS:"):
                    parts = line.split()
                    if len(parts) >= 2:
                        return int(parts[1])  # value already in KB
                    break
    except FileNotFoundError:
        return None
    return None


def format_bytes(num_bytes: int) -> str:
    return f"{num_bytes / (1024 * 1024):.1f} MiB"


class MemoryWatcher(threading.Thread):
    def __init__(
        self,
        *,
        interval: float,
        growth_threshold_mb: float,
        report_limit: int,
    ) -> None:
        super().__init__(name="MemoryWatcher", daemon=True)
        self.interval = interval
        self.growth_threshold_kb = growth_threshold_mb * 1024
        self.report_limit = report_limit
        self._stop_event = threading.Event()
        self._baseline_snapshot = tracemalloc.take_snapshot()
        rss_kb = _read_rss_kb()
        self._baseline_rss_kb = rss_kb if rss_kb is not None else 0

    def stop(self) -> None:
        self._stop_event.set()

    def _maybe_report_growth(self, current_rss_kb: Optional[int]) -> None:
        if current_rss_kb is None:
            return
        delta = current_rss_kb - self._baseline_rss_kb
        if delta < self.growth_threshold_kb:
            return

        snapshot = tracemalloc.take_snapshot()
        top_stats = snapshot.compare_to(self._baseline_snapshot, "lineno")
        print("\n" + "=" * 80)
        print(
            f"[Memory Watcher] Significant RSS increase detected at {datetime.now():%Y-%m-%d %H:%M:%S}."
        )
        print(
            f"RSS grew by {delta / 1024:.1f} MiB (baseline {self._baseline_rss_kb / 1024:.1f} MiB -> {current_rss_kb / 1024:.1f} MiB)."
        )
        print("Top allocation hotspots since last baseline:")
        for idx, stat in enumerate(top_stats[: self.report_limit], start=1):
            size = format_bytes(stat.size)
            count = stat.count
            location_lines = stat.traceback.format()
            if isinstance(location_lines, str):
                location_lines = location_lines.splitlines()
            first_line = "<unknown>"
            if location_lines:
                first_line = str(location_lines[0]).splitlines()[0]
            print(f"  {idx}. {first_line} -> {size} in {count} blocks")
        print("=" * 80 + "\n")

        self._baseline_snapshot = snapshot
        self._baseline_rss_kb = current_rss_kb

    def run(self) -> None:  # pragma: no cover - long running thread
        while not self._stop_event.is_set():
            time.sleep(self.interval)
            current_rss_kb = _read_rss_kb()
            current, peak = tracemalloc.get_traced_memory()
            rss_display = (
                f"{current_rss_kb / 1024:.1f} MiB"
                if current_rss_kb is not None
                else "N/A"
            )
            print(
                f"[Memory Watcher] {datetime.now():%H:%M:%S} | RSS={rss_display} | "
                f"Python heap current={format_bytes(current)} peak={format_bytes(peak)}"
            )
            self._maybe_report_growth(current_rss_kb)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run uvicorn with periodic memory usage reports",
    )
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="Bind address for the FastAPI server (default: %(default)s)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port for the FastAPI server (default: %(default)s)",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload (useful in development)",
    )
    parser.add_argument(
        "--log-level",
        default="info",
        help="Logging level passed to uvicorn",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=10.0,
        help="Seconds between memory samples (default: %(default)s)",
    )
    parser.add_argument(
        "--threshold-mb",
        type=float,
        default=50.0,
        help=(
            "Trigger a detailed report when RSS grows more than this many MiB "
            "since the last baseline (default: %(default)s)"
        ),
    )
    parser.add_argument(
        "--report-limit",
        type=int,
        default=5,
        help="How many hotspots to include in detailed reports",
    )
    return parser


@contextmanager
def _graceful_shutdown(handler: Iterable[signal.Signals]):
    original_handlers: List = []
    try:
        for sig in handler:
            original_handlers.append(signal.getsignal(sig))
            signal.signal(sig, signal.SIG_DFL)
        yield
    finally:
        for sig, original in zip(handler, original_handlers):
            signal.signal(sig, original)


def _validate_app_import(target: str) -> None:
    """Eagerly import the ASGI target to surface helpful tracebacks."""

    module_name, sep, attr_path = target.partition(":")
    if not module_name or not sep:
        return

    try:
        module = importlib.import_module(module_name)
    except Exception:  # pragma: no cover - import error diagnostics
        print(
            "[Memory Watcher] Failed to import ASGI module. Full traceback follows:",
            file=sys.stderr,
            flush=True,
        )
        traceback.print_exc()
        raise SystemExit(1)

    obj = module
    path_parts: List[str] = []
    for part in attr_path.split("."):
        path_parts.append(part)
        if not hasattr(obj, part):
            print(
                "[Memory Watcher] Imported module but attribute "
                f"'{'/'.join(path_parts)}' is missing.",
                file=sys.stderr,
                flush=True,
            )
            raise SystemExit(1)
        obj = getattr(obj, part)


def main() -> None:
    parser = build_arg_parser()
    args = parser.parse_args()

    target = "main:app"
    _validate_app_import(target)

    if not _port_is_available(args.host, args.port):
        print(
            f"[Memory Watcher] Port {args.port} on {args.host} is already in use. "
            "Stop the production service (e.g. `sudo systemctl stop transinfo-backend.service`) "
            "or rerun with --port to use a free port.",
            file=sys.stderr,
            flush=True,
        )
        raise SystemExit(1)

    tracemalloc.start(25)
    watcher = MemoryWatcher(
        interval=args.interval,
        growth_threshold_mb=args.threshold_mb,
        report_limit=args.report_limit,
    )
    watcher.start()

    config = uvicorn.Config(
        target,
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level=args.log_level,
    )
    server = uvicorn.Server(config)

    try:
        with _graceful_shutdown((signal.SIGINT, signal.SIGTERM)):
            server.run()
    finally:
        watcher.stop()
        watcher.join(timeout=args.interval)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted by user", file=sys.stderr)
        sys.exit(0)
