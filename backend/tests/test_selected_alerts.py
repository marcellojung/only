from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.app import automations, price_alerts, research_alerts
from backend.app.database import Base
from backend.app.models import AutomationRun, Holding, ResearchItem


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        yield session
    engine.dispose()


@pytest.fixture
def holding(db):
    record = Holding(owner="성근", source_key="test:stock", name="테스트기업", ticker="005930.KS", currency="KRW")
    db.add(record)
    db.commit()
    return record


@pytest.fixture
def messages(monkeypatch):
    captured = []
    monkeypatch.setattr(price_alerts, "telegram_configured", lambda: True)
    monkeypatch.setattr(automations, "telegram_configured", lambda: True)
    monkeypatch.setattr(automations, "send_telegram_message", lambda text: captured.append(text) or {"ok": True, "message": "sent"})
    return captured


def test_stop_and_buy_rules_send_once_and_explicit_rearm_allows_again(db, holding, messages):
    values = {"stop_loss": 90, "buy_below": 85, "change_percent": 0}
    price_alerts.save_price_rules(db, holding.id, values)
    assert price_alerts.check_price_rules(db, holding, 100, 101) == (0, 0)
    assert price_alerts.check_price_rules(db, holding, 90, 100) == (1, 0)
    assert price_alerts.check_price_rules(db, holding, 80, 90) == (1, 0)
    assert price_alerts.check_price_rules(db, holding, 79, 80) == (0, 0)
    price_alerts.save_price_rules(db, holding.id, values)
    assert price_alerts.check_price_rules(db, holding, 80, 79) == (0, 0)
    price_alerts.save_price_rules(db, holding.id, values, rearm=True)
    assert price_alerts.check_price_rules(db, holding, 80, 79) == (2, 0)
    assert len(messages) == 4


def test_global_off_and_missing_baseline_do_not_send(db, holding, messages):
    price_alerts.save_price_rules(db, holding.id, {"change_percent": 5, "stop_loss": 0, "buy_below": 0})
    assert price_alerts.check_price_rules(db, holding, 90, None) == (0, 0)
    automations.save_setting(db, "price_alerts", False, "")
    assert price_alerts.check_price_rules(db, holding, 90, 100) == (0, 0)
    automations.save_setting(db, "price_alerts", True, "")
    assert price_alerts.check_price_rules(db, holding, 90, 100) == (1, 0)
    assert "직전 갱신 대비 -10.00%" in messages[0]


def mock_news(monkeypatch, items):
    monkeypatch.setattr(research_alerts, "search_company_news", lambda h: {"items": items, "message": "조회 완료"})
    monkeypatch.setattr(research_alerts, "recent_holding_disclosures", lambda h: {"items": [], "message": "조회 완료"})


def test_news_filters_old_and_unknown_dates_and_deduplicates_accounts(db, holding, monkeypatch):
    now = datetime.now(timezone.utc)
    db.add(Holding(owner="지우", source_key="test:other", name=holding.name, ticker=holding.ticker))
    db.commit()
    items = [
        {"title": "신규 수주", "url": "https://example.test/new", "published_at": now.isoformat()},
        {"title": "옛 수주", "url": "https://example.test/old", "published_at": (now - timedelta(days=5)).isoformat()},
        {"title": "주가 뉴스", "url": "https://example.test/stock", "published_at": now.isoformat()},
        {"title": "날짜 없는 수주", "url": "https://example.test/unknown", "published_at": "bad"},
    ]
    mock_news(monkeypatch, items)
    research_alerts.save_keywords(db, "수주")
    pending, _ = research_alerts.collect_research(db)
    assert [item.title for item in pending] == ["신규 수주"]
    research_alerts.collect_research(db)
    assert len(list(db.scalars(select(ResearchItem)))) == 1


def test_two_news_previews_cannot_deliver_same_article(db, holding, monkeypatch, messages):
    mock_news(monkeypatch, [{"title": "새 소식", "url": "https://example.test/news", "published_at": datetime.now(timezone.utc).isoformat()}])
    first = automations.create_preview(db, "research_digest")
    second = automations.create_preview(db, "research_digest")
    assert not messages
    assert automations.send_preview(db, first["id"])["ok"]
    with pytest.raises(ValueError, match="이미"):
        automations.send_preview(db, second["id"])
    assert len(messages) == 1
    pending, _ = research_alerts.collect_research(db)
    assert pending == []


def test_no_news_skips_scheduled_message(db, holding, monkeypatch, messages):
    mock_news(monkeypatch, [])
    automations.save_setting(db, "research_digest", True, "07:30,21:00")
    automations.run_scheduled(db, "research_digest", "2026-09-13T07:30")
    assert not messages
    assert db.scalar(select(AutomationRun)).result == "새 소식 없음"


def test_changed_keyword_still_excludes_previously_sent_news(db, holding, monkeypatch, messages):
    mock_news(monkeypatch, [{"title": "수주 실적 개선", "url": "https://example.test/news", "published_at": datetime.now(timezone.utc).isoformat()}])
    research_alerts.save_keywords(db, "수주")
    preview = automations.create_preview(db, "research_digest")
    automations.send_preview(db, preview["id"])
    research_alerts.save_keywords(db, "실적")
    pending, _ = research_alerts.collect_research(db)
    assert not pending


def test_failed_article_reservation_rolls_back_entire_batch(db, holding, monkeypatch):
    mock_news(monkeypatch, [{"title": f"소식 {i}", "url": f"https://example.test/{i}", "published_at": datetime.now(timezone.utc).isoformat()} for i in range(2)])
    items, _ = research_alerts.collect_research(db)
    first = automations.claim_run(db, "research_digest", "first")
    second = automations.claim_run(db, "research_digest", "second")
    assert research_alerts.reserve_items(db, first, [items[0].fingerprint])
    assert not research_alerts.reserve_items(db, second, [item.fingerprint for item in items])
    db.expire_all()
    assert db.get(ResearchItem, items[1].fingerprint).delivery_run_id is None
