"""Helpers that turn the mutable current state into immutable snapshots."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AssetItem, Debt, Holding, HoldingSnapshot, PortfolioSnapshot, utcnow


def _is_investment_category(category: str) -> bool:
    normalized = category.replace(" ", "")
    return any(word in normalized for word in ("투자", "주식", "펀드", "증권"))


def _is_cash_category(category: str) -> bool:
    normalized = category.replace(" ", "")
    return any(word in normalized for word in ("자유입출금", "현금", "저축", "전자금융", "신탁"))


def calculate_summary(db: Session, owner: str | None = None) -> dict[str, float]:
    asset_query = select(AssetItem).where(AssetItem.is_active.is_(True))
    holding_query = select(Holding).where(Holding.is_active.is_(True))
    debt_query = select(Debt).where(Debt.is_active.is_(True))
    if owner:
        asset_query = asset_query.where(AssetItem.owner == owner)
        holding_query = holding_query.where(Holding.owner == owner)
        debt_query = debt_query.where(Debt.owner == owner)
    assets = list(db.scalars(asset_query))
    holdings = list(db.scalars(holding_query))
    debts = list(db.scalars(debt_query))

    investment_value = sum(item.market_value for item in holdings)
    investment_principal = sum(item.principal for item in holdings)
    non_investment_assets = sum(
        item.value for item in assets if not _is_investment_category(item.category)
    )
    total_assets = non_investment_assets + investment_value
    total_debts = sum(item.balance for item in debts)
    real_estate_value = sum(item.value for item in assets if "부동산" in item.category)
    cash_value = sum(item.value for item in assets if _is_cash_category(item.category))
    return {
        "total_assets": total_assets,
        "total_debts": total_debts,
        "net_assets": total_assets - total_debts,
        "investment_value": investment_value,
        "investment_principal": investment_principal,
        "real_estate_value": real_estate_value,
        "cash_value": cash_value,
    }


def create_portfolio_snapshot(
    db: Session,
    source: str,
    import_batch_id: int | None = None,
) -> PortfolioSnapshot:
    summary = calculate_summary(db)
    captured_at = utcnow()
    snapshot = PortfolioSnapshot(
        import_batch_id=import_batch_id,
        source=source,
        captured_at=captured_at,
        **summary,
    )
    db.add(snapshot)
    db.flush()

    holdings = list(db.scalars(select(Holding).where(Holding.is_active.is_(True))))
    db.add_all(
        HoldingSnapshot(
            snapshot_id=snapshot.id,
            holding_id=item.id,
            owner=item.owner,
            name=item.name,
            ticker=item.ticker,
            principal=item.principal,
            market_value=item.market_value,
            current_price=item.current_price,
            captured_at=captured_at,
        )
        for item in holdings
    )
    return snapshot
