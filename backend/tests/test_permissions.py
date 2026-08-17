from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.app.database import Base
from backend.app.models import AssetItem, Debt, FamilyEvent, Holding, Transaction
from backend.app.state import build_state


def database() -> Session:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return Session(engine)


def test_guest_state_keeps_assets_private_but_shares_ledger_and_calendar() -> None:
    with database() as db:
        db.add_all(
            [
                AssetItem(owner="지우", source_key="asset-jiwoo", category="부동산", name="지우 집", value=300),
                AssetItem(owner="성근", source_key="asset-admin", category="부동산", name="성근 집", value=900),
                Holding(owner="지우", source_key="holding-jiwoo", asset_type="주식", name="지우 주식", market_value=200, principal=100),
                Holding(owner="성근", source_key="holding-admin", asset_type="주식", name="성근 주식", market_value=800, principal=400),
                Debt(owner="지우", source_key="debt-jiwoo", name="지우 대출", balance=50),
                Debt(owner="성근", source_key="debt-admin", name="성근 대출", balance=500),
                FamilyEvent(event_key="event-jiwoo", owner="지우", title="지우 일정", event_date=date(2026, 8, 6)),
                FamilyEvent(event_key="event-admin", owner="성근", title="성근 일정", event_date=date(2026, 8, 7)),
                Transaction(owner="지우", source_key="tx-jiwoo", transaction_date=date(2026, 8, 5), merchant="지우 결제", amount=10, signed_amount=-10),
                Transaction(owner="성근", source_key="tx-admin", transaction_date=date(2026, 8, 5), merchant="성근 결제", amount=20, signed_amount=-20),
            ]
        )
        db.commit()
        state = build_state(db, owner="지우", role="guest")
        assert state["viewer"] == {"owner": "지우", "role": "guest"}
        assert [item["owner"] for item in state["holdings"]] == ["지우"]
        assert [item["owner"] for item in state["debts"]] == ["지우"]
        assert {item["owner"] for item in state["transactions"]} == {"성근", "지우"}
        assert {item["owner"] for item in state["events"]} == {"성근", "지우"}
        assert state["transaction_count"] == 2
        assert state["summary"]["monthly_spending"] == 30
        assert state["summary"]["total_assets"] == 500
        assert state["summary"]["total_debts"] == 50
        assert state["history"] == []
        assert state["latest_analysis"] is None
        assert state["integrations"] == {}
