"""Collect recent holding news/disclosures and reserve each item once."""

from datetime import datetime, timedelta, timezone
from hashlib import sha256
from zoneinfo import ZoneInfo

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import AutomationRun, Holding, ResearchItem, ResearchPreference
from .news import search_company_news
from .opendart import recent_holding_disclosures


def keywords(db: Session) -> str:
    preference = db.get(ResearchPreference, "keywords")
    return preference.value if preference else ""


def save_keywords(db: Session, value: str) -> dict:
    preference = db.get(ResearchPreference, "keywords")
    if not preference:
        preference = ResearchPreference(key="keywords")
        db.add(preference)
    preference.value = ",".join(word.strip() for word in value.split(",") if word.strip())
    db.commit()
    return {"keywords": preference.value}


def publication_date(value: str) -> datetime | None:
    try:
        if len(value) == 8 and value.isdigit():
            return datetime.strptime(value, "%Y%m%d").replace(tzinfo=ZoneInfo("Asia/Seoul"))
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=ZoneInfo("Asia/Seoul"))
    except (ValueError, TypeError):
        return None


def collect_research(db: Session) -> tuple[list[ResearchItem], list[str]]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=3)
    filters = [value.strip().casefold() for value in keywords(db).split(",") if value.strip()]
    holdings = db.scalars(select(Holding).where(Holding.is_active.is_(True)).order_by(Holding.market_value.desc()))
    visited, warnings = set(), []
    for holding in holdings:
        # The same security in several family accounts needs only one lookup.
        identity = holding.ticker or holding.name
        if identity in visited or holding.asset_type in {"코인", "암호화폐"}:
            continue
        visited.add(identity)
        sources = (("뉴스", search_company_news(holding)), ("공시", recent_holding_disclosures(holding)))
        for source, result in sources:
            if result.get("configured") is False or "실패" in result.get("message", "") or "설정 필요" in result.get("message", ""):
                warnings.append(f"{holding.name} {source}: {result['message']}")
            for item in result.get("items", []):
                published = item.get("published_at") or item.get("date") or ""
                stamp = publication_date(published)
                title, url = item.get("title", ""), item.get("url", "")
                if not stamp or stamp < cutoff or stamp > datetime.now(timezone.utc) + timedelta(days=1) or not url.startswith(("https://", "http://")):
                    continue
                if filters and not any(word in title.casefold() for word in filters):
                    continue
                fingerprint = sha256(f"{source}:{url}".encode()).hexdigest()
                if db.get(ResearchItem, fingerprint):
                    continue
                try:
                    with db.begin_nested():
                        db.add(ResearchItem(fingerprint=fingerprint, source=source, company=holding.name, title=title, url=url, published_at=stamp.isoformat()))
                        db.flush()
                except IntegrityError:
                    pass  # Another concurrent preview may have collected it.
    db.commit()
    pending = list(db.scalars(select(ResearchItem).where(ResearchItem.delivery_run_id.is_(None)).order_by(ResearchItem.captured_at, ResearchItem.fingerprint)))
    pending = [item for item in pending if (publication_date(item.published_at) or cutoff) >= cutoff and (not filters or any(word in item.title.casefold() for word in filters))]
    return pending[:15], warnings


def research_message(items: list[ResearchItem], warnings: list[str]) -> str:
    lines = ["[모아 보유 종목 새 소식]", "최근 3일 내 뉴스·공시 중 아직 발송하지 않은 항목 (최대 15건)", ""]
    for item in items:
        lines.append(f"• [{item.source}] {item.company} · {item.title}\n{item.published_at[:10]}\n{item.url}\n")
    if not items:
        lines.append("조건에 맞는 새 소식이 없습니다.")
    if warnings:
        lines.extend(["일부 자료를 확인하지 못했습니다:", *warnings[:5]])
    return "\n".join(lines)


def reserve_items(db: Session, run: AutomationRun, fingerprints: list[str]) -> bool:
    if not fingerprints:
        return True
    result = db.execute(update(ResearchItem).where(ResearchItem.fingerprint.in_(fingerprints), ResearchItem.delivery_run_id.is_(None)).values(delivery_run_id=run.id))
    if result.rowcount != len(fingerprints):
        db.rollback()
        run.status, run.result = "cancelled", "다른 발송에서 이미 사용한 항목입니다. 새 미리보기를 만들어 주세요."
        db.commit()
        return False
    db.commit()
    return True
