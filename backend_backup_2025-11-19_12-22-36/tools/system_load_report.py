#!/usr/bin/env python3
"""Utility helper to inspect current server load (CPU, memory, disk, processes).

The script is intentionally dependency-free so it can be executed directly on a
production host:

    python backend/tools/system_load_report.py

It prints a quick summary that helps to answer the question "what is overloaded
on the server right now?".
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
from datetime import timedelta
from typing import Dict, Iterable, Tuple

MEMINFO_PATH = "/proc/meminfo"
UPTIME_PATH = "/proc/uptime"


def _read_meminfo() -> Dict[str, str]:
    data: Dict[str, str] = {}
    try:
        with open(MEMINFO_PATH, "r", encoding="utf-8") as fh:
            for line in fh:
                if ":" not in line:
                    continue
                key, value = line.split(":", 1)
                data[key.strip()] = value.strip()
    except FileNotFoundError:
        pass
    return data


def _parse_kib(value: str | None) -> float:
    """Convert strings like '12345 kB' from /proc/meminfo into MiB."""
    if not value:
        return 0.0
    parts = value.split()
    if not parts:
        return 0.0
    try:
        kib = float(parts[0])
    except ValueError:
        return 0.0
    # meminfo reports kilobytes -> convert to MiB
    return kib / 1024.0


def _format_mib(value: float) -> str:
    return f"{value:,.1f} MiB"


def _read_uptime() -> timedelta | None:
    try:
        with open(UPTIME_PATH, "r", encoding="utf-8") as fh:
            seconds = float(fh.readline().split()[0])
            return timedelta(seconds=int(seconds))
    except (FileNotFoundError, ValueError, IndexError):
        return None


def _disk_usage(path: str) -> Tuple[float, float, float]:
    try:
        usage = shutil.disk_usage(path)
    except FileNotFoundError:
        return (0.0, 0.0, 0.0)
    total = usage.total / (1024**3)
    used = (usage.total - usage.free) / (1024**3)
    free = usage.free / (1024**3)
    return total, used, free


def _run_ps(sort_key: str, limit: int) -> Iterable[str]:
    """Return formatted lines from ps sorted either by cpu or mem usage."""
    cmd = [
        "ps",
        "-eo",
        "pid,ppid,pcpu,pmem,rss,args",
        f"--sort=-p{sort_key}",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0 or not proc.stdout:
        yield f"<ps command unavailable (exit={proc.returncode})>"
        return
    lines = proc.stdout.strip().splitlines()
    if not lines:
        return
    header, *rows = lines
    yield header
    for row in rows[:limit]:
        yield row


def generate_report(args: argparse.Namespace) -> str:
    parts = []

    uptime = _read_uptime()
    if uptime:
        parts.append(f"Uptime: {uptime}")

    cpu_count = os.cpu_count() or 1
    try:
        load1, load5, load15 = os.getloadavg()
        parts.append(
            "Load average: "
            f"1m={load1:.2f} 5m={load5:.2f} 15m={load15:.2f} (CPUs={cpu_count})"
        )
    except OSError:
        parts.append("Load average: unavailable on this platform")

    meminfo = _read_meminfo()
    mem_total = _parse_kib(meminfo.get("MemTotal"))
    mem_available = _parse_kib(meminfo.get("MemAvailable"))
    mem_used = max(0.0, mem_total - mem_available)
    swap_total = _parse_kib(meminfo.get("SwapTotal"))
    swap_free = _parse_kib(meminfo.get("SwapFree"))
    swap_used = max(0.0, swap_total - swap_free)
    parts.append(
        "Memory: "
        f"used={_format_mib(mem_used)} / total={_format_mib(mem_total)}"
        f" (available={_format_mib(mem_available)})"
    )
    parts.append(
        "Swap: "
        f"used={_format_mib(swap_used)} / total={_format_mib(swap_total)}"
    )

    total_gb, used_gb, free_gb = _disk_usage(args.disk_path)
    parts.append(
        "Disk ({}): used={:.1f} GiB free={:.1f} GiB total={:.1f} GiB".format(
            args.disk_path, used_gb, free_gb, total_gb
        )
    )

    parts.append("")
    parts.append(f"Top {args.top} processes by CPU usage:")
    parts.extend(_run_ps("cpu", args.top))
    parts.append("")
    parts.append(f"Top {args.top} processes by memory usage:")
    parts.extend(_run_ps("mem", args.top))

    return "\n".join(parts)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Print a quick overview of server resource usage",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=5,
        help="Number of processes to show in the CPU/memory tables (default: 5)",
    )
    parser.add_argument(
        "--disk-path",
        default="/",
        help="Mount point to inspect for disk usage (default: /)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    report = generate_report(args)
    print("=" * 80)
    print("System load report")
    print("=" * 80)
    print(report)


if __name__ == "__main__":
    main()