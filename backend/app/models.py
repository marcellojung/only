"""Current-state tables plus immutable history tables."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.utcnow()


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(300))
    checksum: Mapped[str] = mapped_column(String(64), index=True)
    owner: Mapped[str] = mapped_column(String(30), default="공통")
    transaction_count: Mapped[int] = mapped_column(Integer, default=0)
    new_transaction_count: Mapped[int] = mapped_column(Integer, default=0)
    holding_count: Mapped[int] = mapped_column(Integer, default=0)
    asset_count: Mapped[int] = mapped_column(Integer, default=0)
    imported_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    import_batch_id: Mapped[int | None] = mapped_column(ForeignKey("import_batches.id"), nullable=True)
    owner: Mapped[str] = mapped_column(String(30), default="공통", index=True)
    transaction_date: Mapped[date] = mapped_column(Date, index=True)
    transaction_time: Mapped[str] = mapped_column(String(20), default="")
    transaction_type: Mapped[str] = mapped_column(String(20), default="지출", index=True)
    primary_category: Mapped[str] = mapped_column(String(50), default="미분류", index=True)
    secondary_category: Mapped[str] = mapped_column(String(50), default="미분류")
    merchant: Mapped[str] = mapped_column(String(300), default="")
    amount: Mapped[float] = mapped_column(Float, default=0)
    signed_amount: Mapped[float] = mapped_column(Float, default=0)
    currency: Mapped[str] = mapped_column(String(10), default="KRW")
    payment_method: Mapped[str] = mapped_column(String(200), default="")
    memo: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AssetItem(Base):
    __tablename__ = "asset_items"
    __table_args__ = (UniqueConstraint("owner", "source_key", name="uq_asset_owner_source"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner: Mapped[str] = mapped_column(String(30), default="공통", index=True)
    source_key: Mapped[str] = mapped_column(String(64), index=True)
    category: Mapped[str] = mapped_column(String(80), default="기타", index=True)
    provider: Mapped[str] = mapped_column(String(120), default="")
    name: Mapped[str] = mapped_column(String(300))
    value: Mapped[float] = mapped_column(Float, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Holding(Base):
    __tablename__ = "holdings"
    __table_args__ = (UniqueConstraint("owner", "source_key", name="uq_holding_owner_source"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner: Mapped[str] = mapped_column(String(30), default="공통", index=True)
    source_key: Mapped[str] = mapped_column(String(64), index=True)
    asset_type: Mapped[str] = mapped_column(String(40), default="주식")
    broker: Mapped[str] = mapped_column(String(120), default="")
    name: Mapped[str] = mapped_column(String(300))
    ticker: Mapped[str] = mapped_column(String(40), default="", index=True)
    ticker_source: Mapped[str] = mapped_column(String(30), default="")
    currency: Mapped[str] = mapped_column(String(10), default="KRW")
    principal: Mapped[float] = mapped_column(Float, default=0)
    market_value: Mapped[float] = mapped_column(Float, default=0)
    return_rate: Mapped[float] = mapped_column(Float, default=0)
    quantity: Mapped[float | None] = mapped_column(Float, nullable=True)
    quantity_source: Mapped[str] = mapped_column(String(40), default="")
    current_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    price_source: Mapped[str] = mapped_column(String(30), default="bank_salad")
    price_updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    target_price: Mapped[float] = mapped_column(Float, default=0)
    target_alert_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    target_alert_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Debt(Base):
    __tablename__ = "debts"
    __table_args__ = (UniqueConstraint("owner", "source_key", name="uq_debt_owner_source"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner: Mapped[str] = mapped_column(String(30), default="공통", index=True)
    source_key: Mapped[str] = mapped_column(String(64), index=True)
    debt_type: Mapped[str] = mapped_column(String(80), default="대출")
    provider: Mapped[str] = mapped_column(String(120), default="")
    name: Mapped[str] = mapped_column(String(300))
    principal: Mapped[float] = mapped_column(Float, default=0)
    balance: Mapped[float] = mapped_column(Float, default=0)
    interest_rate: Mapped[float] = mapped_column(Float, default=0)
    opened_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    matures_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class FamilyEvent(Base):
    __tablename__ = "family_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    owner: Mapped[str] = mapped_column(String(30), index=True)
    title: Mapped[str] = mapped_column(String(300))
    event_date: Mapped[date] = mapped_column(Date, index=True)
    event_time: Mapped[str] = mapped_column(String(20), default="")
    color: Mapped[str] = mapped_column(String(30), default="mint")
    google_event_id: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class PortfolioSnapshot(Base):
    __tablename__ = "portfolio_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    import_batch_id: Mapped[int | None] = mapped_column(ForeignKey("import_batches.id"), nullable=True)
    source: Mapped[str] = mapped_column(String(40), default="manual")
    total_assets: Mapped[float] = mapped_column(Float, default=0)
    total_debts: Mapped[float] = mapped_column(Float, default=0)
    net_assets: Mapped[float] = mapped_column(Float, default=0)
    investment_value: Mapped[float] = mapped_column(Float, default=0)
    investment_principal: Mapped[float] = mapped_column(Float, default=0)
    real_estate_value: Mapped[float] = mapped_column(Float, default=0)
    cash_value: Mapped[float] = mapped_column(Float, default=0)
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    holdings: Mapped[list["HoldingSnapshot"]] = relationship(cascade="all, delete-orphan")


class HoldingSnapshot(Base):
    __tablename__ = "holding_snapshots"
    __table_args__ = (Index("ix_holding_snapshot_history", "holding_id", "captured_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    snapshot_id: Mapped[int] = mapped_column(ForeignKey("portfolio_snapshots.id", ondelete="CASCADE"), index=True)
    holding_id: Mapped[int | None] = mapped_column(ForeignKey("holdings.id", ondelete="SET NULL"), nullable=True)
    owner: Mapped[str] = mapped_column(String(30), default="공통")
    name: Mapped[str] = mapped_column(String(300))
    ticker: Mapped[str] = mapped_column(String(40), default="")
    principal: Mapped[float] = mapped_column(Float, default=0)
    market_value: Mapped[float] = mapped_column(Float, default=0)
    current_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ExchangeRateHistory(Base):
    __tablename__ = "exchange_rate_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    pair: Mapped[str] = mapped_column(String(20), default="USD/KRW", index=True)
    rate: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(30), default="yfinance")
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class AIAnalysis(Base):
    __tablename__ = "ai_analyses"

    id: Mapped[int] = mapped_column(primary_key=True)
    analysis_type: Mapped[str] = mapped_column(String(40), default="portfolio")
    prompt: Mapped[str] = mapped_column(Text, default="")
    result: Mapped[str] = mapped_column(Text, default="")
    provider: Mapped[str] = mapped_column(String(30), default="local")
    model: Mapped[str] = mapped_column(String(100), default="")
    success: Mapped[bool] = mapped_column(Boolean, default=True)
    error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class AlertEvent(Base):
    __tablename__ = "alert_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    holding_id: Mapped[int | None] = mapped_column(ForeignKey("holdings.id", ondelete="SET NULL"), nullable=True)
    alert_type: Mapped[str] = mapped_column(String(40), default="target_price")
    channel: Mapped[str] = mapped_column(String(30), default="telegram")
    message: Mapped[str] = mapped_column(Text, default="")
    trigger_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    threshold_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, default=False)
    response_message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
