from datetime import datetime
from zoneinfo import ZoneInfo

from backend.app.scheduler import SEOUL, next_scheduled_run, parse_schedule_times


def test_schedule_parses_valid_times_and_ignores_invalid_values() -> None:
    values = parse_schedule_times("21:00,09:00,bad,13:00,17:00")
    assert [value.strftime("%H:%M") for value in values] == ["09:00", "13:00", "17:00", "21:00"]


def test_next_run_uses_same_day_then_rolls_to_tomorrow() -> None:
    schedule = parse_schedule_times("09:00,13:00,17:00,21:00")
    assert next_scheduled_run(datetime(2026, 8, 5, 12, 30, tzinfo=SEOUL), schedule).hour == 13
    next_day = next_scheduled_run(datetime(2026, 8, 5, 22, 0, tzinfo=SEOUL), schedule)
    assert next_day.isoformat(timespec="minutes") == "2026-08-06T09:00+09:00"


def test_next_run_converts_other_timezones() -> None:
    utc = ZoneInfo("UTC")
    schedule = parse_schedule_times("09:00")
    assert next_scheduled_run(datetime(2026, 8, 5, 0, 1, tzinfo=utc), schedule).date().isoformat() == "2026-08-06"
