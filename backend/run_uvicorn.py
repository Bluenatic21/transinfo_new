# run_uvicorn.py
import tracemalloc
import threading
import time
import uvicorn

def print_top_allocations(interval: int = 10):
    """Каждые N секунд печатаем топ мест, где больше всего памяти."""
    while True:
        time.sleep(interval)
        snapshot = tracemalloc.take_snapshot()
        top_stats = snapshot.statistics('lineno')[:15]

        print("\n[tracemalloc] Top 15 lines by allocated size:")
        for stat in top_stats:
            print(stat)
        print("-" * 60)

if __name__ == "__main__":
    # Сохраняем до 25 кадров стека, чтобы было видно путь
    tracemalloc.start(25)

    t = threading.Thread(target=print_top_allocations, daemon=True)
    t.start()

    uvicorn.run("main:app", host="0.0.0.0", port=8000, log_level="info")
