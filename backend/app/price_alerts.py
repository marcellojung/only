"""One-shot stop/buy/price-change rules; no trading actions."""

from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from .automations import claim_run, finish_delivery, job_setting
from .models import AutomationRun, Holding, HoldingAlertRule
from .telegram import telegram_configured

KINDS = {"stop_loss": "손절 기준가", "buy_below": "하락 매수가", "change_percent": "직전 갱신 대비 변동률"}


def price_rules(db: Session, holding_id: int) -> dict:
    holding = db.get(Holding, holding_id)
    if not holding or not holding.is_active:
        raise ValueError("보유 종목을 찾을 수 없습니다.")
    records = {r.kind: r for r in db.scalars(select(HoldingAlertRule).where(HoldingAlertRule.holding_id == holding_id))}
    rules = []
    for kind, label in KINDS.items():
        record = records.get(kind)
        run = db.scalar(select(AutomationRun).where(AutomationRun.run_key == f"price-rule:{record.id}:{record.generation}")) if record else None
        rules.append({"kind": kind, "label": label, "threshold": record.threshold if record else 0, "status": run.status if run else ""})
    return {"holding_id": holding_id, "currency": holding.currency, "rules": rules}


def save_price_rules(db: Session, holding_id: int, values: dict[str, float], rearm: bool = False) -> dict:
    price_rules(db, holding_id)
    for kind, threshold in values.items():
        if kind not in KINDS:
            raise ValueError("지원하지 않는 가격 조건입니다.")
        record = db.scalar(select(HoldingAlertRule).where(HoldingAlertRule.holding_id == holding_id, HoldingAlertRule.kind == kind))
        if record is None:
            record = HoldingAlertRule(holding_id=holding_id, kind=kind, threshold=threshold, generation=str(uuid4()))
            db.add(record)
        elif record.threshold != threshold or rearm:
            record.threshold, record.generation = threshold, str(uuid4())
    db.commit()
    return price_rules(db, holding_id)


def check_price_rules(db: Session, holding: Holding, price: float, previous_price: float | None) -> tuple[int, int]:
    if not job_setting(db, "price_alerts")["enabled"] or not telegram_configured():
        return 0, 0
    sent = failed = 0
    for rule in db.scalars(select(HoldingAlertRule).where(HoldingAlertRule.holding_id == holding.id, HoldingAlertRule.threshold > 0)):
        change = (price / previous_price - 1) * 100 if previous_price and previous_price > 0 else None
        triggered = price <= rule.threshold if rule.kind in {"stop_loss", "buy_below"} else change is not None and abs(change) >= rule.threshold
        if not triggered:
            continue
        unit = "%" if rule.kind == "change_percent" else holding.currency
        message = f"[모아 {KINDS[rule.kind]} 알림] {holding.name}\n{holding.owner} · {holding.ticker}\n현재가 {price:,.2f} {holding.currency}\n설정 기준 {rule.threshold:,.2f} {unit}"
        if rule.kind == "change_percent":
            message += f"\n직전 갱신 대비 {change:+.2f}% (전일 대비가 아님)"
        run = claim_run(db, rule.kind, f"price-rule:{rule.id}:{rule.generation}", message)
        if run is None:
            continue
        result = finish_delivery(db, run, message)
        sent += int(bool(result["ok"]))
        failed += int(not result["ok"])
    return sent, failed
