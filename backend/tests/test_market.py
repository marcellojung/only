from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.app.database import Base
from backend.app.importer import _deactivate
from backend.app.main import HoldingCreate, create_holding
from backend.app.market import _is_krw_symbol, _latest_price, normalize_user_symbol, refresh_market
from backend.app.models import Holding, WatchItem


def test_crypto_symbols_default_to_krw() -> None:
    assert normalize_user_symbol("코인", "BTC") == "BTC-KRW"
    assert normalize_user_symbol("암호화폐", "ETH-USD") == "ETH-KRW"
    assert normalize_user_symbol("코인", "", "리플") == "XRP-KRW"
    assert _is_krw_symbol("BTC-KRW")


def test_invalid_market_price_is_skipped(monkeypatch) -> None:
    class FakeIndex:
        def __getitem__(self, _index):
            return float("nan")

    class FakeColumn:
        iloc = FakeIndex()

    class FakeHistory:
        empty = False

        def __getitem__(self, _key):
            return FakeColumn()

    class FakeTicker:
        def history(self, **_kwargs):
            return FakeHistory()

    monkeypatch.setattr("backend.app.market.yf.Ticker", lambda _symbol: FakeTicker())
    assert _latest_price("196170.KQ") is None


def test_market_refresh_does_not_invent_missing_quantity(monkeypatch) -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    monkeypatch.setattr("backend.app.market.refresh_exchange_rate", lambda _db: type("Rate", (), {"rate": 1400.0})())
    monkeypatch.setattr("backend.app.market._latest_price", lambda _symbol: 80_000.0)
    monkeypatch.setattr("backend.app.market._maybe_send_target_alert", lambda *_args: (0, 0))
    monkeypatch.setattr("backend.app.price_alerts.check_price_rules", lambda *_args: (0, 0))
    monkeypatch.setattr("backend.app.market.create_portfolio_snapshot", lambda *_args, **_kwargs: type("Snapshot", (), {"id": 1})())
    with Session(engine) as db:
        holding = Holding(
            owner="성근",
            source_key="bank:stock",
            name="삼성전자",
            ticker="005930.KS",
            ticker_source="user",
            market_value=1_100_000,
            quantity=None,
        )
        db.add(holding)
        db.commit()

        refresh_market(db)

        assert holding.quantity is None
        assert holding.quantity_source == ""
        assert holding.market_value == 1_100_000
        assert holding.current_price == 80_000


def test_market_refresh_updates_watchlist_and_sends_target_once(monkeypatch) -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    sent = []
    monkeypatch.setattr("backend.app.market.refresh_exchange_rate", lambda _db: type("Rate", (), {"rate": 1400.0})())
    monkeypatch.setattr("backend.app.market._latest_price", lambda _symbol: 120.0)
    monkeypatch.setattr("backend.app.market.send_telegram_message", lambda text: sent.append(text) or {"ok": True, "message": "sent"})
    monkeypatch.setattr("backend.app.market.create_portfolio_snapshot", lambda *_args, **_kwargs: type("Snapshot", (), {"id": 1})())
    with Session(engine) as db:
        item = WatchItem(ticker="AAPL", target_price=100, currency="USD")
        db.add(item)
        db.commit()

        first = refresh_market(db)
        second = refresh_market(db)

        assert first["watch_updated"] == 1
        assert item.current_price == 120
        assert item.alert_sent_at is not None
        assert len(sent) == 1
        assert second["alerts_sent"] == 0


def test_bank_import_deactivation_preserves_manual_holdings() -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        manual = Holding(owner="성근", source_key="manual:coin", name="비트코인", asset_type="코인")
        imported = Holding(owner="성근", source_key="bank:stock", name="삼성전자", asset_type="주식")
        db.add_all([manual, imported])
        db.flush()
        _deactivate(db, Holding, "성근", preserve_manual=True)
        assert manual.is_active is True
        assert imported.is_active is False


def test_create_crypto_holding_keeps_krw_pair(monkeypatch) -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    monkeypatch.setattr("backend.app.main.refresh_holding_quote", lambda _db, _holding: False)
    monkeypatch.setattr("backend.app.main.create_portfolio_snapshot", lambda *_args, **_kwargs: None)
    with Session(engine) as db:
        result = create_holding(
            HoldingCreate(owner="성근", asset_type="코인", name="비트코인", ticker="BTC", quantity=0.1),
            db,
        )
        holding = db.scalar(select(Holding))
        assert result["ticker"] == "BTC-KRW"
        assert holding is not None and holding.source_key.startswith("manual:")


def test_create_us_stock_converts_average_price_to_krw(monkeypatch) -> None:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    monkeypatch.setattr("backend.app.main.refresh_holding_quote", lambda _db, _holding: False)
    monkeypatch.setattr("backend.app.main.create_portfolio_snapshot", lambda *_args, **_kwargs: None)
    monkeypatch.setattr("backend.app.main.latest_exchange_rate", lambda _db: type("Rate", (), {"rate": 1400.0})())
    with Session(engine) as db:
        create_holding(
            HoldingCreate(
                owner="성근",
                asset_type="주식",
                name="Apple",
                ticker="AAPL",
                quantity=2,
                average_price=100,
                average_price_currency="USD",
            ),
            db,
        )
        holding = db.scalar(select(Holding))
        assert holding is not None and holding.principal == 280_000
        assert holding.average_price_krw == 140_000
        assert holding.average_price_source == "user"
