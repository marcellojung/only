"""API serialization and integration readiness."""

from __future__ import annotations

from datetime import date, datetime
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import settings
from .history import calculate_summary
from .gowalter import archive_status
from .market import latest_exchange_rate
from .models import AIAnalysis, AlertEvent, AssetItem, Debt, FamilyEvent, Holding, ImportBatch, PortfolioSnapshot, Transaction
from .telegram import probe_telegram, telegram_configured
from .scheduler import scheduler_status


def _iso(value: datetime | date | None) -> str:
    return value.isoformat() if value else ""


def serialize_transaction(item: Transaction) -> dict[str, object]:
    return {
        "id": str(item.id),
        "date": _iso(item.transaction_date),
        "time": item.transaction_time,
        "type": item.transaction_type,
        "merchant": item.merchant,
        "category": item.primary_category,
        "subcategory": item.secondary_category,
        "amount": item.amount,
        "signed_amount": item.signed_amount,
        "currency": item.currency,
        "payment_method": item.payment_method,
        "owner": item.owner,
    }


def integrations(db: Session, probe: bool = False) -> dict[str, dict[str, object]]:
    last_import = db.scalar(select(ImportBatch).order_by(ImportBatch.imported_at.desc()))
    last_fx = latest_exchange_rate(db)
    last_ai = db.scalar(select(AIAnalysis).order_by(AIAnalysis.created_at.desc()))
    last_alert = db.scalar(select(AlertEvent).order_by(AlertEvent.created_at.desc()))
    telegram = probe_telegram() if probe else {
        "configured": telegram_configured(),
        "connected": telegram_configured(),
        "message": "설정됨" if telegram_configured() else "설정 필요",
    }
    auto_refresh = scheduler_status(db)
    return {
        "database": {
            "configured": True,
            "connected": True,
            "message": "SQLite 누적 저장 중",
            "detail": str(settings.data_dir / "family-assets.db"),
        },
        "bank_salad": {
            "configured": True,
            "connected": bool(last_import),
            "message": "업로드 완료" if last_import else "첫 파일을 올려 주세요",
            "last_checked_at": _iso(last_import.imported_at) if last_import else "",
        },
        "market": {
            "configured": True,
            "connected": bool(last_fx),
            "message": "현재가·환율 갱신 가능" if last_fx else "첫 갱신 필요",
            "last_checked_at": _iso(last_fx.captured_at) if last_fx else "",
        },
        "auto_refresh": {
            "configured": auto_refresh["enabled"],
            "connected": auto_refresh["enabled"] and not auto_refresh["last_error"],
            "message": f"최근 실행 실패: {auto_refresh['last_error']}" if auto_refresh["last_error"] else ("자동 갱신 켜짐" if auto_refresh["enabled"] else "자동 갱신 꺼짐"),
            "detail": f"{auto_refresh['schedule']} · 다음 {auto_refresh['next_run'] or '계산 중'}",
            "last_checked_at": auto_refresh["last_run"],
        },
        "openai": {
            "configured": bool(settings.openai_api_key),
            "connected": bool(last_ai and last_ai.provider == "openai"),
            "message": f"{settings.openai_model} 설정됨" if settings.openai_api_key else "키 없이 로컬 분석 사용",
            "last_checked_at": _iso(last_ai.created_at) if last_ai else "",
        },
        "gowalter": {
            "configured": archive_status()["archive_ready"],
            "connected": archive_status()["archive_ready"],
            "message": archive_status()["source_label"],
            "detail": archive_status()["archive_dir"],
        },
        "opendart": {
            "configured": bool(settings.opendart_api_key),
            "connected": bool(settings.opendart_api_key),
            "message": "기업 리포트 사용 가능" if settings.opendart_api_key else "API 키 설정 필요",
        },
        "naver_news": {
            "configured": bool((settings.naver_api_hub_client_id and settings.naver_api_hub_client_secret) or (settings.naver_client_id and settings.naver_client_secret)),
            "connected": bool((settings.naver_api_hub_client_id and settings.naver_api_hub_client_secret) or (settings.naver_client_id and settings.naver_client_secret)),
            "message": "최신 뉴스 검색 가능" if ((settings.naver_api_hub_client_id and settings.naver_api_hub_client_secret) or (settings.naver_client_id and settings.naver_client_secret)) else "API HUB 키 설정 필요",
        },
        "telegram": {
            **telegram,
            "last_checked_at": _iso(last_alert.created_at) if last_alert else "",
        },
        "google_calendar": {
            "configured": bool(
                (settings.google_oauth_client_id and settings.google_oauth_client_secret)
                or (settings.google_calendar_id and settings.google_service_account_email and settings.google_private_key)
            ),
            "connected": False,
            "message": "앱에서 연결 확인 필요" if (
                (settings.google_oauth_client_id and settings.google_oauth_client_secret)
                or (settings.google_calendar_id and settings.google_service_account_email and settings.google_private_key)
            ) else "설정 필요",
        },
    }


def build_state(db: Session, owner: str | None = None, role: str = "admin") -> dict[str, object]:
    summary = calculate_summary(db, owner=owner)
    latest_date_query = select(func.max(Transaction.transaction_date))
    latest_transaction_date = db.scalar(latest_date_query)
    if latest_transaction_date:
        month_start = latest_transaction_date.replace(day=1)
        if month_start.month == 12:
            next_month = date(month_start.year + 1, 1, 1)
        else:
            next_month = date(month_start.year, month_start.month + 1, 1)
        spending_query = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                Transaction.transaction_type == "지출",
                Transaction.transaction_date >= month_start,
                Transaction.transaction_date < next_month,
            )
        monthly_spending = db.scalar(spending_query) or 0
        spending_month = month_start.strftime("%Y-%m")
    else:
        monthly_spending = 0
        spending_month = ""

    investment_pnl = summary["investment_value"] - summary["investment_principal"]
    summary.update(
        {
            "investment_profit_loss": investment_pnl,
            "investment_return_rate": investment_pnl / summary["investment_principal"] if summary["investment_principal"] else 0,
            "monthly_spending": float(monthly_spending),
            "spending_month": spending_month,
        }
    )
    holding_query = select(Holding).where(Holding.is_active.is_(True))
    debt_query = select(Debt).where(Debt.is_active.is_(True))
    transaction_query = select(Transaction)
    event_query = select(FamilyEvent)
    if owner:
        holding_query = holding_query.where(Holding.owner == owner)
        debt_query = debt_query.where(Debt.owner == owner)
    holdings = list(db.scalars(holding_query.order_by(Holding.market_value.desc())))
    debts = list(db.scalars(debt_query.order_by(Debt.balance.desc())))
    transactions = list(db.scalars(transaction_query.order_by(Transaction.transaction_date.desc(), Transaction.id.desc()).limit(200)))
    transaction_count_query = select(func.count(Transaction.id))
    transaction_count = db.scalar(transaction_count_query) or 0
    events = list(db.scalars(event_query.order_by(FamilyEvent.event_date, FamilyEvent.event_time, FamilyEvent.id)))
    snapshots = list(
        db.scalars(select(PortfolioSnapshot).order_by(PortfolioSnapshot.captured_at.desc()).limit(24))
    )
    fx = latest_exchange_rate(db)
    last_ai = db.scalar(select(AIAnalysis).order_by(AIAnalysis.created_at.desc()))
    members: dict[str, float] = {}
    asset_query = select(AssetItem).where(AssetItem.is_active.is_(True))
    if owner:
        asset_query = asset_query.where(AssetItem.owner == owner)
    assets = list(db.scalars(asset_query))
    for asset in assets:
        category = asset.category.replace(" ", "")
        if any(word in category for word in ("투자", "주식", "펀드", "증권")):
            continue
        if owner is None and "부동산" in category:
            members["성근"] = members.get("성근", 0) + asset.value / 2
            members["지우"] = members.get("지우", 0) + asset.value / 2
            continue
        members[asset.owner] = members.get(asset.owner, 0) + asset.value
    for holding in holdings:
        members[holding.owner] = members.get(holding.owner, 0) + holding.market_value

    return {
        "protected": bool(settings.admin_password or settings.access_key or settings.jiwoo_guest_password or settings.yoonjae_guest_password),
        "viewer": {"owner": owner or "성근", "role": role},
        "updated_at": _iso(snapshots[0].captured_at) if snapshots else "",
        "summary": summary,
        "members": members,
        "transactions": [serialize_transaction(item) for item in transactions],
        "transaction_count": transaction_count,
        "holdings": [
            {
                "id": item.id,
                "owner": item.owner,
                "asset_type": item.asset_type,
                "broker": item.broker,
                "name": item.name,
                "ticker": item.ticker,
                "ticker_source": item.ticker_source,
                "currency": item.currency,
                "principal": item.principal,
                "average_price_krw": item.principal / item.quantity if item.quantity else 0,
                "market_value": item.market_value,
                "return_rate": item.return_rate,
                "quantity": item.quantity,
                "quantity_source": item.quantity_source,
                "current_price": item.current_price,
                "price_source": item.price_source,
                "price_updated_at": _iso(item.price_updated_at),
                "target_price": item.target_price,
                "target_alert_enabled": item.target_alert_enabled,
                "target_alert_sent_at": _iso(item.target_alert_sent_at),
            }
            for item in holdings
        ],
        "debts": [
            {
                "id": item.id,
                "owner": item.owner,
                "debt_type": item.debt_type,
                "provider": item.provider,
                "name": item.name,
                "principal": item.principal,
                "balance": item.balance,
                "interest_rate": item.interest_rate,
                "opened_on": _iso(item.opened_on),
                "matures_on": _iso(item.matures_on),
                "manual": item.source_key.startswith("manual:"),
            }
            for item in debts
        ],
        "events": [
            {
                "id": item.event_key,
                "title": item.title,
                "date": _iso(item.event_date),
                "time": item.event_time,
                "owner": item.owner,
                "color": item.color,
                "googleEventId": item.google_event_id,
            }
            for item in events
        ],
        "history": [
            {
                "id": item.id,
                "source": item.source,
                "total_assets": item.total_assets,
                "total_debts": item.total_debts,
                "net_assets": item.net_assets,
                "investment_value": item.investment_value,
                "captured_at": _iso(item.captured_at),
            }
            for item in (reversed(snapshots) if not owner else [])
        ],
        "exchange_rate": {
            "pair": fx.pair if fx else "USD/KRW",
            "rate": fx.rate if fx else 0,
            "source": fx.source if fx else "",
            "updated_at": _iso(fx.captured_at) if fx else "",
        },
        "latest_analysis": {
            "id": last_ai.id,
            "text": last_ai.result,
            "provider": last_ai.provider,
            "model": last_ai.model,
            "created_at": _iso(last_ai.created_at),
        } if last_ai and not owner else None,
        "integrations": integrations(db) if not owner else {},
    }
