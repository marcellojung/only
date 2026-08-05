"""In-process market refresh schedule for the always-on family server."""

from __future__ import annotations

import asyncio
from datetime import datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from .config import settings
from .database import SessionLocal
from .market import refresh_market


SEOUL = ZoneInfo("Asia/Seoul")


def parse_schedule_times(raw: str) -> tuple[time, ...]:
    parsed: list[time] = []
    for value in raw.split(","):
        try:
            hour, minute = (int(part) for part in value.strip().split(":"))
            parsed.append(time(hour=hour, minute=minute, tzinfo=SEOUL))
        except (TypeError, ValueError):
            continue
    return tuple(sorted(set(parsed))) or (time(9, 0, tzinfo=SEOUL), time(13, 0, tzinfo=SEOUL), time(17, 0, tzinfo=SEOUL), time(21, 0, tzinfo=SEOUL))


SCHEDULE = parse_schedule_times(settings.auto_refresh_times)
_runtime: dict[str, Any] = {
    "next_run": "",
    "last_run": "",
    "last_error": "",
    "last_result": None,
    "running": False,
}


def next_scheduled_run(now: datetime, schedule: tuple[time, ...] = SCHEDULE) -> datetime:
    local_now = now.astimezone(SEOUL)
    for target in schedule:
        candidate = datetime.combine(local_now.date(), target)
        if candidate > local_now:
            return candidate
    return datetime.combine(local_now.date() + timedelta(days=1), schedule[0])


def scheduler_status() -> dict[str, object]:
    return {
        "enabled": settings.auto_refresh_enabled,
        "schedule": ", ".join(value.strftime("%H:%M") for value in SCHEDULE),
        **_runtime,
    }


def _refresh_once() -> dict[str, Any]:
    db = SessionLocal()
    try:
        return refresh_market(db)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


async def _scheduler_loop() -> None:
    while True:
        target = next_scheduled_run(datetime.now(SEOUL))
        _runtime["next_run"] = target.isoformat(timespec="minutes")
        await asyncio.sleep(max(1, (target - datetime.now(SEOUL)).total_seconds()))
        _runtime["running"] = True
        _runtime["last_error"] = ""
        try:
            _runtime["last_result"] = await asyncio.to_thread(_refresh_once)
            _runtime["last_run"] = datetime.now(SEOUL).isoformat(timespec="seconds")
        except Exception as exc:
            _runtime["last_run"] = datetime.now(SEOUL).isoformat(timespec="seconds")
            _runtime["last_error"] = type(exc).__name__
        finally:
            _runtime["running"] = False


def start_auto_refresh() -> asyncio.Task[None] | None:
    if not settings.auto_refresh_enabled:
        return None
    return asyncio.create_task(_scheduler_loop(), name="market-auto-refresh")


async def stop_auto_refresh(task: asyncio.Task[None] | None) -> None:
    if not task:
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
