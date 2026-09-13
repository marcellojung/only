"""In-process market refresh schedule for the always-on family server."""

from __future__ import annotations

import asyncio
from datetime import datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from .config import settings
from .database import SessionLocal
from .market import refresh_market
from .automations import JOB_DEFAULTS, job_setting, run_scheduled


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


def scheduler_status(db=None) -> dict[str, object]:
    config = job_setting(db, "auto_refresh") if db is not None else {"enabled": settings.auto_refresh_enabled, "times": settings.auto_refresh_times}
    return {
        "enabled": config["enabled"],
        "schedule": config["times"],
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
    active: dict[str, asyncio.Task] = {}
    attempted: dict[str, str] = {}

    def execute(key: str, slot: str) -> None:
        with SessionLocal() as db:
            run_scheduled(db, key, slot)

    try:
        while True:
            now = datetime.now(SEOUL)
            try:
                with SessionLocal() as db:
                    configs = [job_setting(db, key) for key in JOB_DEFAULTS if key != "price_alerts"]
                market = configs[0]
                _runtime["next_run"] = next_scheduled_run(now, parse_schedule_times(market["times"])).isoformat(timespec="minutes") if market["enabled"] else ""
                for key, task in list(active.items()):
                    if task.done():
                        del active[key]
                        task.result()
                for config in configs:
                    key = config["key"]
                    slot = now.strftime("%Y-%m-%dT%H:%M")
                    if config["enabled"] and now.strftime("%H:%M") in config["times"].split(",") and key not in active and attempted.get(key) != slot:
                        attempted[key] = slot
                        active[key] = asyncio.create_task(asyncio.to_thread(execute, key, slot))
                _runtime["running"] = bool(active)
                _runtime["last_error"] = ""
            except Exception as exc:
                _runtime["last_error"] = type(exc).__name__
            await asyncio.sleep(10)
    finally:
        # Let an in-flight network operation finish instead of cancelling its
        # bookkeeping while the message could already have been delivered.
        if active:
            await asyncio.gather(*active.values(), return_exceptions=True)


def start_auto_refresh() -> asyncio.Task[None] | None:
    return asyncio.create_task(_scheduler_loop(), name="market-auto-refresh")


async def stop_auto_refresh(task: asyncio.Task[None] | None) -> None:
    if not task:
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
