"""Copy-ready prompts grounded in a stock report payload."""

from __future__ import annotations

from datetime import date
from typing import Any

from .models import Holding


def _report_context(report: dict[str, Any]) -> str:
    dart = report.get("dart") or {}
    metrics = dart.get("metrics") or []
    ratios = dart.get("ratios") or []
    metric_lines = [
        f"- {item['label']}: {item['current']:,.0f}원" + (f" (전년 대비 {item['change_rate'] * 100:+.1f}%)" if item.get("change_rate") is not None else "")
        for item in metrics
    ]
    ratio_lines = [f"- {item['label']}: {item['value'] * 100:.1f}%" for item in ratios]
    return "\n".join([
        f"분석 기준일: {date.today().isoformat()}",
        f"DART 기준: {dart.get('basis') or '데이터 없음'}",
        "\n[공시 재무 데이터]",
        *(metric_lines or ["- 데이터 없음"]),
        "\n[계산 지표]",
        *(ratio_lines or ["- 데이터 없음"]),
    ])


def build_stock_prompts(holding: Holding, report: dict[str, Any]) -> list[dict[str, str]]:
    context = _report_context(report)
    identity = f"{holding.name} ({holding.ticker or '티커 미확인'})"
    basic = f"""당신은 근거 중심의 주식 리서치 애널리스트입니다. 아래 제공 데이터만 사실로 간주하고 {identity}를 분석하세요. 최신 정보가 더 필요하면 웹 검색으로 확인하고 모든 외부 수치에는 출처와 기준일을 표시하세요. 확인되지 않은 값은 추정하지 말고 '확인 불가'라고 쓰세요.

다음 순서로 한국어 Markdown 보고서를 작성하세요.
1. 한 줄 결론과 핵심 투자 포인트 3개
2. 사업 모델과 주요 매출원
3. 최근 3개년 실적 추세: 매출, 영업이익, 순이익, 마진
4. 재무 안정성: 부채, 현금흐름, 자본 효율성
5. 최근 뉴스와 공시가 실적·밸류에이션에 미칠 영향
6. 증권사 리포트의 공통 의견과 의견 차이(원문 확인 시에만)
7. 상승 촉매 3개와 핵심 위험 3개
8. 낙관/기준/비관 시나리오와 각 시나리오의 전제
9. 추가 확인이 필요한 데이터와 다음 실적 발표 때 볼 항목

매수·매도 단정 대신 가정과 반증 조건을 명시하세요. 뉴스 제목만으로 사실관계를 확정하지 마세요.

{context}"""
    gowalter = f"""당신은 'gowalter' 방식의 냉정한 투자위원회 심사역입니다. {identity}에 대해 좋은 이야기보다 틀릴 가능성을 먼저 찾고, 투자 가설을 반증 가능한 형태로 평가하세요. 아래 데이터와 검증 가능한 최신 원문만 사용하며 수치마다 출처·기준일·연결/별도 여부를 표시하세요.

[분석 절차]
A. 기업을 한 문장으로 정의하고 실제 돈을 버는 구조를 제품·고객·지역별로 분해
B. 최근 5년의 매출, 영업이익, 순이익, FCF, ROIC, 부채와 주식수 변화를 표로 정리
C. 회계 품질 점검: 이익과 현금흐름 괴리, 일회성 항목, 자본화, 재고·매출채권, 희석 가능성
D. 해자 검증: 가격 결정력, 전환 비용, 네트워크 효과, 규모의 경제를 증거와 반대 증거로 구분
E. 시장 기대 역산: 현재 주가에 이미 반영된 성장률과 마진 가정을 설명
F. 경쟁사 3곳과 성장성·수익성·밸류에이션을 동일 기준으로 비교
G. 최근 뉴스·공시·증권사 리포트를 사실, 해석, 이해관계로 분리
H. 상승/기준/하락 시나리오별 핵심 변수, 확률, 예상 범위를 제시하되 데이터 부족 시 계산하지 않음
I. 투자 가설을 깨뜨릴 선행지표 5개와 명확한 매도·재검토 조건
J. 마지막에 '내가 틀릴 수 있는 이유'와 추가로 확인할 원문 목록 작성

[강제 규칙]
- 경영진 주장과 실제 실적을 분리한다.
- 뉴스 제목이나 증권사 목표주가를 근거 없이 반복하지 않는다.
- 낙관과 비관 시나리오는 서로 다른 전제를 사용한다.
- 숫자가 없으면 정성적 표현으로 빈칸을 숨기지 않는다.
- 결론은 투자 권유가 아닌 검증 가능한 체크리스트로 끝낸다.

{context}"""
    return [
        {"id": "basic", "title": "기본 종목분석 프롬프트", "description": "사업·재무·뉴스·공시·시나리오를 균형 있게 점검합니다.", "text": basic},
        {"id": "gowalter", "title": "gowalter 프롬프트", "description": "반증, 회계 품질, 시장 기대와 매도 조건까지 깊게 점검합니다.", "text": gowalter},
    ]
