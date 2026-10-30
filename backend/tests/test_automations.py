from datetime import timedelta
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.app import automations
from backend.app.auth import Viewer, current_user
from backend.app.automation_api import router
from backend.app.database import Base, get_db
from backend.app.models import AlertEvent, AutomationRun, Holding, TelegramPreview, WatchItem, utcnow
from backend.app.telegram import split_message
from backend.app.telegram_commands import HELP_TEXT, command_response, normalize_command, process_updates


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        yield session
    engine.dispose()


def test_settings_persist_across_sessions_and_invalid_times_do_not_replace_them(db):
    automations.save_setting(db, "morning_brief", True, "21:30,08:00,08:00")
    with Session(db.bind) as another:
        assert automations.job_setting(another, "morning_brief")["times"] == "08:00,21:30"
    with pytest.raises(ValueError):
        automations.save_setting(db, "morning_brief", False, "25:00")
    assert automations.job_setting(db, "morning_brief")["enabled"] is True


def test_new_briefs_are_disabled_by_default(db):
    assert not automations.job_setting(db, "morning_brief")["enabled"]
    assert not automations.job_setting(db, "evening_brief")["enabled"]


def test_preview_never_sends_and_dispatch_is_claimed_once(db, monkeypatch):
    calls = []
    monkeypatch.setattr(automations, "telegram_configured", lambda: True)
    monkeypatch.setattr(automations, "send_telegram_message", lambda text: calls.append(text) or {"ok": True, "message": "sent"})
    preview = automations.create_preview(db, "evening_brief")
    assert not calls
    assert automations.send_preview(db, preview["id"])["ok"]
    with pytest.raises(ValueError, match="이미"):
        automations.send_preview(db, preview["id"])
    assert calls == [preview["text"]]
    assert len(list(db.scalars(select(AlertEvent)))) == 1


def test_expired_preview_cannot_be_sent(db):
    db.add(TelegramPreview(id="expired", job_key="evening_brief", text="old", created_at=utcnow() - timedelta(minutes=31)))
    db.commit()
    with pytest.raises(ValueError, match="만료"):
        automations.send_preview(db, "expired")


def test_disabled_schedule_and_same_slot_after_restart_do_not_send(db, monkeypatch):
    calls = []
    monkeypatch.setattr(automations, "send_telegram_message", lambda text: calls.append(text) or {"ok": True, "message": "sent"})
    slot = "2026-09-13T21:30"
    automations.run_scheduled(db, "evening_brief", slot)
    assert not calls
    automations.save_setting(db, "evening_brief", True, "21:30")
    automations.run_scheduled(db, "evening_brief", slot)
    with Session(db.bind, expire_on_commit=False) as restarted:
        automations.run_scheduled(restarted, "evening_brief", slot)
    assert len(calls) == 1


def test_turning_off_while_preparing_cancels_before_delivery(db, monkeypatch):
    automations.save_setting(db, "morning_brief", True, "08:00")
    def prepare():
        automations.save_setting(db, "morning_brief", False, "08:00")
        return "prepared"
    monkeypatch.setattr(automations, "market_brief", prepare)
    monkeypatch.setattr(automations, "send_telegram_message", lambda text: pytest.fail("must not send"))
    automations.run_scheduled(db, "morning_brief", "2026-09-13T08:00")
    assert db.scalar(select(AutomationRun)).status == "cancelled"


def test_uncertain_delivery_is_not_replayed(db, monkeypatch):
    monkeypatch.setattr(automations, "telegram_configured", lambda: True)
    calls = []
    monkeypatch.setattr(automations, "send_telegram_message", lambda text: calls.append(text) or {"ok": False, "uncertain": True, "message": "timeout"})
    preview = automations.create_preview(db, "evening_brief")
    assert automations.send_preview(db, preview["id"])["status"] == "uncertain"
    with pytest.raises(ValueError):
        automations.send_preview(db, preview["id"])
    assert len(calls) == 1


def test_guest_cannot_read_history_change_settings_or_send(db):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[current_user] = lambda: Viewer(owner="지우", role="guest")
    with TestClient(app) as client:
        assert client.get("/api/automations").status_code == 403
        assert client.get("/api/automations/history").status_code == 403
        assert client.put("/api/automations/morning_brief/settings", json={"enabled": True, "times": "08:00"}).status_code == 403
        assert client.post("/api/automations/previews", json={"kind": "evening_brief"}).status_code == 403
        assert client.post("/api/automations/previews/id/send").status_code == 403


def test_admin_can_save_and_preview_without_delivery(db):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[current_user] = lambda: Viewer(owner="성근", role="admin")
    with TestClient(app) as client:
        assert client.put("/api/automations/evening_brief/settings", json={"enabled": False, "times": "21:45"}).status_code == 200
        response = client.post("/api/automations/previews", json={"kind": "evening_brief"})
        assert response.status_code == 200
        assert "순자산" in response.json()["text"]
        assert not list(db.scalars(select(AlertEvent)))


def test_long_unicode_messages_keep_all_content():
    text = "가족 자산 📈\n" * 1600
    parts = split_message(text)
    assert "".join(parts) == text
    assert len(parts) > 1
    assert all(len(part.encode("utf-16-le")) // 2 <= 3500 for part in parts)


def test_telegram_command_phrases_map_to_requested_responses(db, monkeypatch):
    monkeypatch.setattr("backend.app.telegram_commands.asset_brief", lambda _db, title: f"[{title}]")
    monkeypatch.setattr("backend.app.telegram_commands.market_brief", lambda: "[모아 아침 브리핑]")
    assert command_response(db, "현재 조회") == "[모아 현재 자산 조회]"
    assert command_response(db, "/current") == "[모아 현재 자산 조회]"
    assert command_response(db, "아침 브리핑") == "[모아 아침 브리핑]"
    assert command_response(db, "/morning@my_bot") == "[모아 아침 브리핑]"
    assert command_response(db, "help") == HELP_TEXT
    assert command_response(db, "/start") == HELP_TEXT
    assert normalize_command("  현재   조회 ") == "현재조회"


def test_refresh_command_reports_holding_and_watch_counts(db, monkeypatch):
    monkeypatch.setattr(
        "backend.app.telegram_commands.refresh_market",
        lambda _db: {"updated": 3, "watch_updated": 2, "skipped": 1, "alerts_sent": 1},
    )
    response = command_response(db, "/refresh")
    assert "보유 종목 3개" in response
    assert "관심종목 2개" in response


def test_watch_command_registers_queries_and_deletes(db):
    registered = command_response(db, "watch AAPL 250")
    item = db.scalar(select(WatchItem))
    assert item is not None and item.ticker == "AAPL" and item.target_price == 250
    assert "등록했습니다" in registered
    assert "AAPL" in command_response(db, "watch")
    assert "250.00 USD" in command_response(db, "watch AAPL")
    assert "삭제했습니다" in command_response(db, "watch 삭제 AAPL")
    assert item.is_active is False


def test_stock_command_sets_queries_and_disables_target(db):
    holding = Holding(owner="성근", source_key="test:samsung", name="삼성전자", ticker="005930.KS", currency="KRW", current_price=80_000)
    db.add(holding)
    db.commit()
    assert "등록했습니다" in command_response(db, "stock 삼성전자 100000")
    assert holding.target_price == 100_000 and holding.target_alert_enabled is True
    assert "목표 100,000 KRW" in command_response(db, "stock 005930.KS")
    assert "해제했습니다" in command_response(db, "stock 삼성전자 해제")
    assert holding.target_price == 0 and holding.target_alert_enabled is False


def test_telegram_updates_only_answer_configured_chat_once(db, monkeypatch):
    sent = []
    answered = []
    monkeypatch.setattr("backend.app.telegram_commands.settings", SimpleNamespace(telegram_chat_id="123"))
    monkeypatch.setattr("backend.app.telegram_commands.send_telegram_message", lambda text, **kwargs: sent.append(text) or {"ok": True})
    monkeypatch.setattr("backend.app.telegram_commands.answer_callback_query", lambda callback_id: answered.append(callback_id))
    updates = [
        {"update_id": 10, "message": {"chat": {"id": 999}, "text": "help"}},
        {"update_id": 11, "message": {"chat": {"id": 123}, "text": "help"}},
        {"update_id": 12, "callback_query": {"id": "callback-1", "data": "current", "message": {"chat": {"id": 123}}}},
    ]
    monkeypatch.setattr("backend.app.telegram_commands.asset_brief", lambda _db, title: f"[{title}]")
    assert process_updates(db, updates) == 2
    assert process_updates(db, updates) == 0
    assert sent == [HELP_TEXT, "[모아 현재 자산 조회]"]
    assert answered == ["callback-1"]
