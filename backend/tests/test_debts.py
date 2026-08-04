from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.app.database import Base
from backend.app.importer import _deactivate
from backend.app.main import DebtCreate, create_debt
from backend.app.models import AssetItem, Debt, Holding


def database() -> Session:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return Session(engine)


def test_create_manual_real_estate_debt(monkeypatch) -> None:
    monkeypatch.setattr("backend.app.main.create_portfolio_snapshot", lambda *_args, **_kwargs: None)
    with database() as db:
        result = create_debt(
            DebtCreate(owner="성근", provider="은행", name="아파트 주담대", balance=320_000_000, interest_rate=3.8),
            db,
        )
        debt = db.scalar(select(Debt))
        assert result["balance"] == 320_000_000
        assert debt is not None and debt.principal == 320_000_000
        assert debt.source_key.startswith("manual:")


def test_import_preserves_manual_debt() -> None:
    with database() as db:
        manual = Debt(owner="성근", source_key="manual:mortgage", name="주담대", balance=1)
        imported = Debt(owner="성근", source_key="bank:loan", name="신용대출", balance=1)
        db.add_all([manual, imported])
        db.flush()
        _deactivate(db, Debt, "성근", preserve_manual=True)
        assert manual.is_active is True
        assert imported.is_active is False


def test_import_preserves_every_manual_asset_type() -> None:
    with database() as db:
        records = [
            AssetItem(owner="성근", source_key="manual:property", category="부동산", name="직접 등록 집", value=1),
            Holding(owner="성근", source_key="manual:coin", asset_type="코인", name="직접 등록 코인"),
            Debt(owner="성근", source_key="manual:loan", name="직접 등록 대출", balance=1),
        ]
        db.add_all(records)
        db.flush()
        _deactivate(db, AssetItem, "성근", preserve_manual=True)
        _deactivate(db, Holding, "성근", preserve_manual=True)
        _deactivate(db, Debt, "성근", preserve_manual=True)
        assert all(record.is_active for record in records)
