from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.app.database import Base
from backend.app.importer import _deactivate
from backend.app.main import HoldingCreate, create_holding
from backend.app.market import _is_krw_symbol, _latest_price, normalize_user_symbol
from backend.app.models import Holding


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
