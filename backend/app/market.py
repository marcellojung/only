"""Exchange-rate and quote refresh with cumulative snapshot/alert history."""

from __future__ import annotations

from datetime import datetime
import math
from typing import Any

import yfinance as yf
from sqlalchemy import select
from sqlalchemy.orm import Session

from .history import create_portfolio_snapshot
from .models import AlertEvent, ExchangeRateHistory, Holding, utcnow
from .telegram import send_telegram_message


ALIASES = {
    "ACE 러시아MSCI(합성)": "265690.KS",
    "삼성전자": "005930.KS",
    "삼성전자우": "005935.KS",
    "SK하이닉스": "000660.KS",
    "삼성전기": "009150.KS",
    "현대차우": "005385.KS",
    "LS": "006260.KS",
    "OCI홀딩스": "010060.KS",
    "RFHIC": "218410.KQ",
    "에치에프알": "230240.KQ",
    "케이엠더블유": "032500.KQ",
    "쏠리드": "050890.KQ",
    "오이솔루션": "138080.KQ",
    "알테오젠": "196170.KQ",
    "올릭스": "226950.KQ",
    "지아이이노베이션": "358570.KQ",
    "퓨쳐켐": "220100.KQ",
    "KODEX 미국AI전력핵심인프라": "487230.KS",
    "KODEX 반도체": "091160.KS",
    "KODEX 증권": "102970.KS",
    "KODEX 차이나과창판STAR50(합성)": "415340.KS",
    "KoAct 바이오헬스케어액티브": "462900.KS",
    "RISE 네트워크인프라": "367760.KS",
    "RISE 현대차고정피지컬AI": "0190C0.KS",
    "SOL AI반도체소부장": "455850.KS",
    "TIGER 우선주": "261140.KS",
    "TIGER 기술이전바이오액티브": "0168K0.KS",
    "TIME 글로벌AI인공지능액티브": "456600.KS",
    "TIME 코스닥액티브": "0162Y0.KS",
    "뉴스케일 파워": "SMR",
    "서클 인터넷 그룹": "CRCL",
    "비트마인 이머전 테크놀로지스": "BMNR",
    "이더리움 프로셰어즈 ETF": "EETH",
    "DIREXION SEMICONDUCTOR DAILY 3X": "SOXL",
}

COIN_ALIASES = {
    "BTC": "BTC-KRW",
    "비트코인": "BTC-KRW",
    "ETH": "ETH-KRW",
    "이더리움": "ETH-KRW",
    "XRP": "XRP-KRW",
    "리플": "XRP-KRW",
    "SOL": "SOL-KRW",
    "솔라나": "SOL-KRW",
    "DOGE": "DOGE-KRW",
    "도지코인": "DOGE-KRW",
    "ADA": "ADA-KRW",
    "에이다": "ADA-KRW",
}


def _is_crypto(asset_type: str) -> bool:
    return asset_type.strip().lower() in {"코인", "암호화폐", "crypto", "cryptocurrency"}


def normalize_user_symbol(asset_type: str, ticker: str, name: str = "") -> str:
    """Normalize manually entered symbols, using KRW crypto pairs by default."""
    symbol = ticker.strip().upper()
    if not _is_crypto(asset_type):
        return symbol
    lookup = symbol or name.strip()
    alias = COIN_ALIASES.get(lookup.upper()) or COIN_ALIASES.get(lookup)
    if alias:
        return alias
    if symbol.endswith("-USD"):
        return f"{symbol[:-4]}-KRW"
    if symbol and "-" not in symbol:
        return f"{symbol}-KRW"
    return symbol


def latest_exchange_rate(db: Session) -> ExchangeRateHistory | None:
    return db.scalar(select(ExchangeRateHistory).order_by(ExchangeRateHistory.captured_at.desc()))


def refresh_exchange_rate(db: Session) -> ExchangeRateHistory:
    history = yf.Ticker("KRW=X").history(period="5d", auto_adjust=False)
    if history.empty:
        raise ValueError("USD/KRW 환율을 가져오지 못했습니다.")
    rate = float(history["Close"].iloc[-1])
    if not math.isfinite(rate) or rate <= 0:
        raise ValueError("USD/KRW 환율 응답이 유효하지 않습니다.")
    record = ExchangeRateHistory(rate=rate, source="yfinance")
    db.add(record)
    db.flush()
    return record


def _auto_symbol(holding: Holding) -> str:
    if holding.ticker and holding.ticker_source == "user":
        return normalize_user_symbol(holding.asset_type, holding.ticker, holding.name)
    if _is_crypto(holding.asset_type):
        return normalize_user_symbol(holding.asset_type, holding.ticker, holding.name)
    if holding.name in ALIASES:
        return ALIASES[holding.name]
    if holding.ticker and not any("가" <= char <= "힣" for char in holding.name):
        return holding.ticker.strip().upper()
    if holding.asset_type == "펀드":
        return ""
    # Yahoo's Korean free-text search often returns an unrelated ETF that only
    # shares the KODEX/TIGER brand. Korean products are therefore refreshed only
    # through the reviewed alias table or an explicit user ticker.
    if any("가" <= char <= "힣" for char in holding.name):
        return ""
    try:
        quotes = yf.Search(holding.name, max_results=10).quotes
    except Exception:
        return ""
    if not quotes:
        return ""
    preferred = [
        item for item in quotes
        if item.get("quoteType") in {"EQUITY", "ETF", "MUTUALFUND"}
        and item.get("symbol")
    ]
    if not preferred:
        return ""
    korean = [item for item in preferred if str(item.get("symbol", "")).endswith((".KS", ".KQ"))]
    return str((korean or preferred)[0].get("symbol", "")).upper()


def _latest_price(symbol: str) -> float | None:
    try:
        history = yf.Ticker(symbol).history(period="5d", auto_adjust=False)
    except Exception:
        return None
    if history.empty:
        return None
    price = float(history["Close"].iloc[-1])
    if not math.isfinite(price) or price <= 0:
        return None
    return price


def _is_krw_symbol(symbol: str) -> bool:
    return symbol.endswith((".KS", ".KQ", "-KRW"))


def refresh_holding_quote(db: Session, holding: Holding) -> bool:
    """Refresh one holding and keep its market value in KRW."""
    symbol = _auto_symbol(holding)
    if not symbol:
        return False
    price = _latest_price(symbol)
    if price is None:
        return False
    holding.ticker = symbol
    holding.ticker_source = holding.ticker_source or "user"
    holding.currency = "KRW" if _is_krw_symbol(symbol) else "USD"
    exchange = latest_exchange_rate(db)
    fx = 1 if holding.currency == "KRW" else (exchange.rate if exchange else 0)
    if not fx:
        try:
            fx = refresh_exchange_rate(db).rate
        except Exception:
            return False
    if holding.quantity:
        holding.market_value = holding.quantity * price * fx
        holding.return_rate = (
            (holding.market_value - holding.principal) / holding.principal if holding.principal else 0
        )
    holding.current_price = price
    holding.price_source = "yfinance"
    holding.price_updated_at = utcnow()
    return True


def _maybe_send_target_alert(db: Session, holding: Holding, price: float) -> tuple[int, int]:
    if (
        not holding.target_alert_enabled
        or holding.target_price <= 0
        or price < holding.target_price
        or holding.target_alert_sent_at is not None
    ):
        return 0, 0
    message = (
        f"[목표가 도달] {holding.name}\n"
        f"현재가 {price:,.2f} {holding.currency} / 목표가 {holding.target_price:,.2f}\n"
        f"계좌 {holding.owner} · {holding.broker} · {holding.ticker}"
    )
    result = send_telegram_message(message)
    db.add(
        AlertEvent(
            holding_id=holding.id,
            alert_type="target_price",
            message=message,
            trigger_price=price,
            threshold_price=holding.target_price,
            success=bool(result["ok"]),
            response_message=str(result["message"]),
        )
    )
    if result["ok"]:
        holding.target_alert_sent_at = utcnow()
        return 1, 0
    return 0, 1


def refresh_market(db: Session) -> dict[str, Any]:
    try:
        exchange = refresh_exchange_rate(db)
    except Exception:
        exchange = latest_exchange_rate(db)
    usd_krw = exchange.rate if exchange else 0
    updated = 0
    skipped = 0
    resolved = 0
    alerts_sent = 0
    alerts_failed = 0
    now = utcnow()

    holdings = list(db.scalars(select(Holding).where(Holding.is_active.is_(True))))
    for holding in holdings:
        symbol = _auto_symbol(holding)
        if not symbol:
            if holding.ticker_source == "auto_search":
                holding.ticker = ""
                holding.ticker_source = ""
            skipped += 1
            continue
        if not holding.ticker or (holding.ticker_source != "user" and holding.ticker != symbol):
            if holding.quantity_source == "estimated_from_import_value":
                holding.quantity = None
                holding.quantity_source = ""
            holding.ticker = symbol
            holding.ticker_source = "reviewed_alias" if holding.name in ALIASES else "auto_search"
            resolved += 1
        price = _latest_price(symbol)
        if price is None:
            skipped += 1
            continue
        holding.currency = "KRW" if _is_krw_symbol(symbol) else "USD"
        fx = 1 if holding.currency == "KRW" else usd_krw
        if not fx:
            skipped += 1
            continue
        if not holding.quantity:
            holding.quantity = holding.market_value / (price * fx) if price > 0 else None
            holding.quantity_source = "estimated_from_import_value"
        if holding.quantity:
            holding.market_value = holding.quantity * price * fx
            holding.return_rate = (
                (holding.market_value - holding.principal) / holding.principal if holding.principal else 0
            )
        holding.current_price = price
        holding.price_source = "yfinance"
        holding.price_updated_at = now
        sent, failed = _maybe_send_target_alert(db, holding, price)
        alerts_sent += sent
        alerts_failed += failed
        updated += 1

    snapshot = create_portfolio_snapshot(db, source="market_refresh")
    db.commit()
    return {
        "updated": updated,
        "skipped": skipped,
        "tickers_resolved": resolved,
        "alerts_sent": alerts_sent,
        "alerts_failed": alerts_failed,
        "snapshot_id": snapshot.id,
        "exchange_rate": exchange.rate if exchange else 0,
        "updated_at": now.isoformat(timespec="seconds"),
    }
