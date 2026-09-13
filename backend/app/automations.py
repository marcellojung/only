"""Persistent job settings, previews and at-most-once dispatch claims."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from html import unescape
from uuid import uuid4
from zoneinfo import ZoneInfo

import httpx
import yfinance as yf
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import settings
from .history import calculate_summary
from .models import AIAnalysis, AlertEvent, AutomationRun, AutomationSetting, Holding, PortfolioSnapshot, TelegramPreview, utcnow
from .telegram import send_telegram_message, telegram_configured

SEOUL = ZoneInfo("Asia/Seoul")
JOB_DEFAULTS = {
    "auto_refresh": ("자동 시세 갱신", settings.auto_refresh_enabled, settings.auto_refresh_times),
    "price_alerts": ("목표가 알림", True, ""),
    "morning_brief": ("아침 시장 브리핑", False, "08:00"),
    "evening_brief": ("저녁 자산 요약", False, "21:30"),
}


def validate_times(raw: str) -> str:
    values = [value.strip() for value in raw.split(",")]
    if not 1 <= len(values) <= 12 or any(not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value) for value in values):
        raise ValueError("시간은 08:00,21:30 형식으로 최대 12개 입력해 주세요.")
    return ",".join(sorted(set(values)))


def job_setting(db: Session, key: str) -> dict:
    label, enabled, times = JOB_DEFAULTS[key]
    record = db.get(AutomationSetting, key)
    return {"key": key, "label": label, "enabled": record.enabled if record else enabled, "times": record.times if record else times}


def save_setting(db: Session, key: str, enabled: bool, times: str) -> dict:
    if key not in JOB_DEFAULTS:
        raise ValueError("지원하지 않는 자동 작업입니다.")
    times = validate_times(times) if key != "price_alerts" else ""
    record = db.get(AutomationSetting, key)
    if record is None:
        record = AutomationSetting(key=key)
        db.add(record)
    record.enabled, record.times = enabled, times
    db.commit()
    return job_setting(db, key)


def automation_state(db: Session) -> dict:
    now = datetime.now(SEOUL)
    jobs = []
    for key in JOB_DEFAULTS:
        item = job_setting(db, key)
        candidates = []
        if item["enabled"] and item["times"]:
            for value in validate_times(item["times"]).split(","):
                hour, minute = map(int, value.split(":"))
                target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                candidates.append(target if target > now else target + timedelta(days=1))
        item["next_run"] = min(candidates).isoformat() if candidates else ""
        last = db.scalar(select(AutomationRun).where(AutomationRun.job_key == key).order_by(AutomationRun.id.desc()))
        item["last_status"] = last.status if last else ""
        item["last_result"] = last.result if last else ""
        jobs.append(item)
    return {"jobs": jobs, "telegram_configured": telegram_configured(), "timezone": "Asia/Seoul"}


def plain(value: str) -> str:
    return unescape(re.sub(r"<[^>]+>", "", value or "")).strip()


def market_brief() -> str:
    """Adapted from portfolioweb's standalone daily brief; no portfolio DB needed."""
    lines = [f"[모아 아침 브리핑] {datetime.now(SEOUL):%Y-%m-%d %H:%M}", "", "시장 지표 · 각 지표의 최근 거래일 기준"]
    for name, symbol in (("나스닥", "^IXIC"), ("반도체 지수", "^SOX"), ("USD/KRW", "KRW=X")):
        try:
            history = yf.Ticker(symbol).history(period="5d", timeout=10)
            if len(history) < 2:
                raise ValueError("insufficient history")
            last, previous = float(history.iloc[-1]["Close"]), float(history.iloc[-2]["Close"])
            if previous <= 0:
                raise ValueError("invalid previous close")
            lines.append(f"• {name}: {last:,.2f} ({(last / previous - 1) * 100:+.2f}%) · {history.index[-1]:%m/%d}")
        except Exception:
            lines.append(f"• {name}: 조회 실패")
    lines.extend(["", "주요 시장 뉴스"])
    try:
        response = httpx.get("https://finance.yahoo.com/news/rssindex", timeout=12)
        response.raise_for_status()
        root = ET.fromstring(response.content)
        seen = set()
        for item in root.findall(".//item"):
            title, link = plain(item.findtext("title", "")), item.findtext("link", "")
            if title and title not in seen:
                seen.add(title)
                lines.append(f"• {title}\n{link if link.startswith('https://') else ''}")
            if len(seen) >= 5:
                break
        if not seen:
            lines.append("뉴스가 없습니다.")
    except Exception:
        lines.append("뉴스 조회 실패")
    return "\n".join(lines)


def asset_brief(db: Session) -> str:
    summary = calculate_summary(db)
    latest = db.scalar(select(PortfolioSnapshot).order_by(PortfolioSnapshot.captured_at.desc()))
    lines = [f"[모아 저녁 자산 요약] {datetime.now(SEOUL):%Y-%m-%d %H:%M}", "저장된 최근 평가액 기준 · 입출금과 업로드 변화가 포함될 수 있습니다.", ""]
    for label, key in (("총자산", "total_assets"), ("순자산", "net_assets"), ("투자 평가액", "investment_value"), ("부채", "total_debts")):
        lines.append(f"• {label}: {summary[key]:,.0f}원")
    if latest:
        today_start = datetime.now(SEOUL).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(ZoneInfo("UTC")).replace(tzinfo=None)
        baseline = db.scalar(select(PortfolioSnapshot).where(PortfolioSnapshot.captured_at < today_start).order_by(PortfolioSnapshot.captured_at.desc()))
        stamp = latest.captured_at.replace(tzinfo=ZoneInfo("UTC")).astimezone(SEOUL)
        lines.append(f"최근 스냅샷: {stamp:%m/%d %H:%M} KST")
        if baseline:
            lines.append(f"이전 스냅샷 대비 순자산 변화: {summary['net_assets'] - baseline.net_assets:+,.0f}원 (투자 수익과 다를 수 있음)")
    holdings = db.scalars(select(Holding).where(Holding.is_active.is_(True)).order_by(Holding.market_value.desc()).limit(5))
    lines.extend(["", "평가액 상위 보유 종목"])
    lines.extend(f"• {h.owner} · {h.name}: {h.market_value:,.0f}원 / 보유 수익률 {h.return_rate * 100:+.1f}%" for h in holdings)
    return "\n".join(lines)


def holding_brief(db: Session, holding_id: int) -> str:
    from .news import search_company_news
    from .opendart import build_holding_report

    holding = db.get(Holding, holding_id)
    if not holding or not holding.is_active:
        raise ValueError("보유 종목을 찾을 수 없습니다.")
    report = build_holding_report(holding)
    news = search_company_news(holding)
    lines = [f"[모아 종목 분석] {holding.name} ({holding.ticker})", f"{holding.owner} · 평가액 {holding.market_value:,.0f}원 · 보유 수익률 {holding.return_rate * 100:+.1f}%", "", report["dart"]["message"]]
    analysis = report["dart"].get("analysis") or {}
    lines.extend(f"• {text}" for text in analysis.get("observations", []) + analysis.get("cautions", []))
    lines.append("\n최근 뉴스")
    lines.extend(f"• {item['title']}\n{item['url']}" for item in news.get("items", [])[:5])
    return "\n".join(lines)


def create_preview(db: Session, key: str, holding_id: int | None = None) -> dict:
    if key == "morning_brief":
        text = market_brief()
    elif key == "evening_brief":
        text = asset_brief(db)
    elif key == "holding_report" and holding_id:
        text = holding_brief(db, holding_id)
    elif key == "portfolio_analysis":
        analysis = db.scalar(select(AIAnalysis).order_by(AIAnalysis.created_at.desc()))
        if not analysis:
            raise ValueError("먼저 포트폴리오 AI 분석을 실행해 주세요.")
        text = "[모아 포트폴리오 분석]\n" + analysis.result
    else:
        raise ValueError("미리보기를 만들 수 없는 항목입니다.")
    record = TelegramPreview(id=str(uuid4()), job_key=key, text=text)
    db.add(record)
    db.commit()
    return {"id": record.id, "text": record.text, "job_key": key, "expires_in_minutes": 30}


def claim_run(db: Session, key: str, run_key: str, message: str = "") -> AutomationRun | None:
    record = AutomationRun(job_key=key, run_key=run_key, message=message)
    db.add(record)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return None
    return record


def finish_delivery(db: Session, run: AutomationRun, text: str) -> dict:
    # Persist the exact message BEFORE the network call. An interrupted run is
    # never automatically replayed: Telegram may have accepted it already.
    run.message = text
    db.commit()
    result = send_telegram_message(text)
    run.status = "succeeded" if result["ok"] else ("uncertain" if result.get("uncertain") else "failed")
    run.result = str(result["message"])
    run.finished_at = utcnow()
    db.add(AlertEvent(alert_type=run.job_key, message=text, success=bool(result["ok"]), response_message=run.result))
    db.commit()
    return {**result, "run_id": run.id, "status": run.status}


def send_preview(db: Session, preview_id: str) -> dict:
    preview = db.get(TelegramPreview, preview_id)
    if not preview or utcnow() - preview.created_at > timedelta(minutes=30):
        raise ValueError("미리보기가 만료되었습니다. 다시 생성해 주세요.")
    if not telegram_configured():
        raise ValueError("텔레그램 연결 설정이 필요합니다.")
    run = claim_run(db, preview.job_key, f"preview:{preview.id}", preview.text)
    if run is None:
        raise ValueError("이미 발송을 요청한 미리보기입니다. 발송 이력을 확인해 주세요.")
    return finish_delivery(db, run, preview.text)


def run_scheduled(db: Session, key: str, slot: str) -> None:
    if not job_setting(db, key)["enabled"]:
        return
    run = claim_run(db, key, f"schedule:{key}:{slot}")
    if run is None:
        return
    try:
        if key == "auto_refresh":
            from .market import refresh_market
            result = refresh_market(db)
            run.status, run.result, run.finished_at = "succeeded", str(result), utcnow()
            db.commit()
        else:
            message = market_brief() if key == "morning_brief" else asset_brief(db)
            db.expire_all()
            if not job_setting(db, key)["enabled"]:
                run.status, run.result, run.finished_at = "cancelled", "발송 전에 자동 작업을 껐습니다.", utcnow()
                db.commit()
                return
            finish_delivery(db, run, message)
    except Exception as exc:
        db.rollback()
        run.status, run.result, run.finished_at = "failed", f"작업 실패: {type(exc).__name__}", utcnow()
        db.commit()


def alert_history(db: Session) -> dict:
    alerts = list(db.scalars(select(AlertEvent).order_by(AlertEvent.id.desc()).limit(50)))
    runs = list(db.scalars(select(AutomationRun).order_by(AutomationRun.id.desc()).limit(30)))
    return {
        "alerts": [{"id": a.id, "type": a.alert_type, "success": a.success, "message": a.message, "result": a.response_message, "created_at": a.created_at.isoformat() + "Z"} for a in alerts],
        "runs": [{"id": r.id, "job_key": r.job_key, "status": r.status, "result": r.result, "started_at": r.started_at.isoformat() + "Z"} for r in runs],
    }
