"""Persisted portfolio analysis using OpenAI with a local fallback."""

from __future__ import annotations

from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .history import calculate_summary
from .models import AIAnalysis, Holding


def _money(value: float) -> str:
    return f"{value:,.0f}원"


def _context(db: Session) -> tuple[str, list[Holding], dict[str, float]]:
    holdings = list(
        db.scalars(
            select(Holding)
            .where(Holding.is_active.is_(True))
            .order_by(Holding.market_value.desc())
        )
    )
    summary = calculate_summary(db)
    lines = [
        f"- 총자산: {_money(summary['total_assets'])}",
        f"- 순자산: {_money(summary['net_assets'])}",
        f"- 투자 평가액: {_money(summary['investment_value'])}",
        f"- 투자 원금: {_money(summary['investment_principal'])}",
        f"- 현금성 자산: {_money(summary['cash_value'])}",
        "- 보유 종목:",
    ]
    lines.extend(
        f"  - {item.name} ({item.ticker or '티커 미확인'}): 평가 {_money(item.market_value)}, 수익률 {item.return_rate * 100:.1f}%"
        for item in holdings[:30]
    )
    return "\n".join(lines), holdings, summary


def _local_analysis(holdings: list[Holding], summary: dict[str, float]) -> str:
    total = summary["investment_value"]
    top = holdings[:5]
    concentration = sum(item.market_value for item in top) / total if total else 0
    losers = sorted(holdings, key=lambda item: item.return_rate)[:5]
    cash_ratio = summary["cash_value"] / summary["total_assets"] if summary["total_assets"] else 0
    return f"""## 포트폴리오 점검

- 투자자산은 **{_money(total)}**, 상위 5개 종목 집중도는 **{concentration * 100:.1f}%**입니다.
- 전체 자산 대비 현금성 자산 비중은 **{cash_ratio * 100:.1f}%**입니다.
- 손실 폭이 큰 종목: {', '.join(f'{item.name} {item.return_rate * 100:.1f}%' for item in losers) or '없음'}

## 우선 확인할 일

1. 상위 종목의 투자 가정이 여전히 유효한지 확인하세요.
2. 손실 종목은 본전 회복 기대가 아니라 보유 이유와 손실 한도를 기준으로 재검토하세요.
3. 목표가 알림을 설정할 종목은 티커와 목표 통화가 맞는지 확인하세요.

> AI 키가 없어 현재 SQLite 수치로 만든 규칙 기반 점검입니다. 투자 권유가 아닌 검토 초안입니다.
"""


def _extract_text(payload: dict[str, Any]) -> str:
    if payload.get("output_text"):
        return str(payload["output_text"]).strip()
    chunks: list[str] = []
    for item in payload.get("output", []):
        for content in item.get("content", []):
            if content.get("type") == "output_text" and content.get("text"):
                chunks.append(str(content["text"]))
    return "\n".join(chunks).strip()


def analyze_portfolio(db: Session, user_prompt: str = "") -> dict[str, Any]:
    context, holdings, summary = _context(db)
    prompt = user_prompt.strip() or "현재 자산 배분, 집중 위험, 큰 손실 종목, 현금 비중을 점검하고 이번 달 확인할 행동을 제안해 줘."
    provider = "local"
    model = "rules-v1"
    error = ""
    result_text = ""

    if settings.openai_api_key:
        try:
            response = httpx.post(
                "https://api.openai.com/v1/responses",
                headers={"Authorization": f"Bearer {settings.openai_api_key}", "Content-Type": "application/json"},
                json={
                    "model": settings.openai_model,
                    "instructions": "당신은 부부의 개인 자산을 점검하는 분석 보조자입니다. 투자 권유가 아닌 검토 초안을 한국어 Markdown으로 작성하고, 수치 근거와 위험을 분리하세요.",
                    "input": f"{prompt}\n\n현재 SQLite 포트폴리오:\n{context}",
                    "max_output_tokens": 3000,
                },
                timeout=75,
            )
            payload = response.json()
            if response.is_success:
                result_text = _extract_text(payload)
                provider = "openai"
                model = settings.openai_model
            else:
                error = str(payload.get("error", {}).get("message", f"HTTP {response.status_code}"))
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}"

    if not result_text:
        result_text = _local_analysis(holdings, summary)

    record = AIAnalysis(
        prompt=prompt,
        result=result_text,
        provider=provider,
        model=model,
        success=True,
        error=error,
    )
    db.add(record)
    db.commit()
    return {
        "id": record.id,
        "text": result_text,
        "provider": provider,
        "model": model,
        "warning": error,
        "created_at": record.created_at.isoformat(timespec="seconds"),
    }
