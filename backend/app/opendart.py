"""Deterministic OpenDART company reports and official research links."""

from __future__ import annotations

import json
import re
import threading
from datetime import date, datetime, timedelta
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import quote
from xml.etree import ElementTree
from zipfile import ZipFile

import httpx

from .config import settings
from .models import Holding


DART_API_BASE = "https://opendart.fss.or.kr/api"
DART_VIEWER_BASE = "https://dart.fss.or.kr/dsaf001/main.do"
_corp_code_lock = threading.Lock()
_ACCOUNTS: dict[str, tuple[set[str], tuple[str, ...]]] = {
    "revenue": ({"ifrs-full_Revenue", "ifrs-full_SalesRevenue", "dart_OperatingRevenue"}, ("매출액", "영업수익", "수익(매출액)")),
    "operating_income": ({"dart_OperatingIncomeLoss", "ifrs-full_ProfitLossFromOperatingActivities"}, ("영업이익", "영업이익(손실)")),
    "net_income": ({"ifrs-full_ProfitLoss"}, ("당기순이익", "당기순이익(손실)", "연결당기순이익")),
    "assets": ({"ifrs-full_Assets"}, ("자산총계",)),
    "liabilities": ({"ifrs-full_Liabilities"}, ("부채총계",)),
    "equity": ({"ifrs-full_Equity"}, ("자본총계",)),
}
_LABELS = {"revenue": "매출액", "operating_income": "영업이익", "net_income": "당기순이익", "assets": "자산총계", "liabilities": "부채총계", "equity": "자본총계"}


class OpenDartError(RuntimeError):
    """A user-displayable OpenDART failure."""


def korean_stock_code(holding: Holding) -> str:
    match = re.search(r"(?<!\d)(\d{6})(?!\d)", holding.ticker or "")
    return match.group(1) if match else ""


def broker_research_links(holding: Holding) -> list[dict[str, str]]:
    stock_code = korean_stock_code(holding)
    if not stock_code:
        return []
    return [
        {"provider": "알파스퀘어", "title": f"{holding.name} 증권사 리포트", "description": "종목별 증권사 리포트 목록과 원문을 검색합니다.", "url": f"https://alphasquare.co.kr/home/stock-issue?code={quote(stock_code)}&type=report", "kind": "reports"},
        {"provider": "FnGuide", "title": f"{holding.name} 컨센서스", "description": "증권사별 투자의견, 적정주가와 실적 컨센서스를 확인합니다.", "url": f"https://comp.fnguide.com/SVO2/ASP/SVD_Consensus.asp?pGB=1&gicode={quote(f'A{stock_code}')}&cID=&MenuYn=Y&ReportGB=&NewMenuID=108", "kind": "consensus"},
        {"provider": "FnGuide", "title": "전체 요약 리포트 검색", "description": "FnGuide의 증권사 요약 리포트 검색 화면을 엽니다.", "url": "https://comp.fnguide.com/SVO2/ASP/SVD_Report_Summary.asp?pGB=1", "kind": "reports"},
    ]


def _cache_path() -> Path:
    return settings.data_dir / "opendart-corp-codes.json"


def _read_cache(path: Path) -> dict[str, str] | None:
    try:
        if datetime.now().timestamp() - path.stat().st_mtime > 7 * 86400:
            return None
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else None
    except (FileNotFoundError, OSError, ValueError):
        return None


def _download_codes(client: httpx.Client, path: Path) -> dict[str, str]:
    response = client.get(f"{DART_API_BASE}/corpCode.xml", params={"crtfc_key": settings.opendart_api_key})
    response.raise_for_status()
    try:
        with ZipFile(BytesIO(response.content)) as archive:
            xml_name = next(name for name in archive.namelist() if name.lower().endswith(".xml"))
            root = ElementTree.fromstring(archive.read(xml_name))
    except Exception as exc:
        raise OpenDartError("DART 기업 고유번호 파일을 읽지 못했습니다.") from exc
    codes = {(item.findtext("stock_code") or "").strip(): (item.findtext("corp_code") or "").strip() for item in root.findall("list")}
    codes = {stock: corp for stock, corp in codes.items() if stock and corp}
    if not codes:
        raise OpenDartError("DART 기업 고유번호 목록이 비어 있습니다.")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(codes, ensure_ascii=False), encoding="utf-8")
    return codes


def _corp_codes(client: httpx.Client) -> dict[str, str]:
    path = _cache_path()
    cached = _read_cache(path)
    if cached is not None:
        return cached
    with _corp_code_lock:
        return _read_cache(path) or _download_codes(client, path)


def _get_json(client: httpx.Client, endpoint: str, params: dict[str, Any]) -> dict[str, Any]:
    response = client.get(f"{DART_API_BASE}/{endpoint}", params={"crtfc_key": settings.opendart_api_key, **params})
    response.raise_for_status()
    try:
        payload = response.json()
    except ValueError as exc:
        raise OpenDartError("DART에서 올바르지 않은 응답을 받았습니다.") from exc
    if str(payload.get("status", "")) not in {"000", "013"}:
        raise OpenDartError(str(payload.get("message") or "DART 조회에 실패했습니다."))
    return payload


def _amount(value: Any) -> int | None:
    normalized = str(value or "").strip().replace(",", "")
    if not normalized or normalized == "-":
        return None
    negative = normalized.startswith("(") and normalized.endswith(")")
    try:
        amount = int(float(normalized.strip("()")))
        return -amount if negative else amount
    except ValueError:
        return None


def _row_score(row: dict[str, Any], key: str) -> int:
    ids, names = _ACCOUNTS[key]
    account_name = re.sub(r"\s+", "", str(row.get("account_nm") or ""))
    score = (100 if str(row.get("account_id") or "") in ids else 0) + (80 if account_name in {re.sub(r"\s+", "", name) for name in names} else 0)
    if key in {"revenue", "operating_income", "net_income"} and row.get("sj_div") in {"IS", "CIS"}:
        score += 10
    if key in {"assets", "liabilities", "equity"} and row.get("sj_div") == "BS":
        score += 10
    return score


def extract_financial_metrics(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    fs_div = "CFS" if any(row.get("fs_div") == "CFS" for row in rows) else "OFS"
    selected = [row for row in rows if row.get("fs_div") == fs_div]
    metrics: list[dict[str, Any]] = []
    for key, label in _LABELS.items():
        ranked = sorted(selected, key=lambda row: _row_score(row, key), reverse=True)
        if not ranked or _row_score(ranked[0], key) <= 0:
            continue
        periods = []
        for label_key, amount_key in (("bfefrmtrm_nm", "bfefrmtrm_amount"), ("frmtrm_nm", "frmtrm_amount"), ("thstrm_nm", "thstrm_amount")):
            amount = _amount(ranked[0].get(amount_key))
            if amount is not None:
                periods.append({"label": str(ranked[0].get(label_key) or "").strip(), "value": amount})
        if not periods:
            continue
        current = periods[-1]["value"]
        previous = periods[-2]["value"] if len(periods) > 1 else None
        metrics.append({"key": key, "label": label, "unit": "KRW", "periods": periods, "current": current, "previous": previous, "change_rate": (current - previous) / abs(previous) if previous not in {None, 0} else None})
    return metrics


def _metric(metrics: list[dict[str, Any]], key: str) -> int | None:
    item = next((item for item in metrics if item["key"] == key), None)
    return item["current"] if item else None


def _ratio(label: str, numerator: int | None, denominator: int | None) -> dict[str, Any] | None:
    return None if numerator is None or denominator in {None, 0} else {"label": label, "value": numerator / denominator}


def _analysis(metrics: list[dict[str, Any]], ratios: list[dict[str, Any]]) -> dict[str, Any]:
    observations: list[str] = []
    cautions: list[str] = []
    for key, noun in (("revenue", "매출"), ("operating_income", "영업이익"), ("net_income", "순이익")):
        item = next((item for item in metrics if item["key"] == key), None)
        change = item.get("change_rate") if item else None
        if change is not None:
            sentence = f"전년 대비 {noun}이 {abs(change) * 100:.1f}% {'증가' if change >= 0 else '감소'}했습니다."
            (observations if change >= 0 else cautions).append(sentence)
    if not observations:
        observations.append("확인 가능한 재무 수치를 기준으로 추세를 점검해 주세요.")
    if not cautions:
        cautions.append("정량 지표 외 사업 전망과 최신 공시도 함께 확인해야 합니다.")
    return {"summary": "OpenDART 공시 재무제표를 계산식과 규칙 기반 문장으로 정리했습니다.", "observations": observations[:4], "cautions": cautions[:4]}


def _financials(client: httpx.Client, corp_code: str) -> tuple[list[dict[str, Any]], str]:
    for year in range(date.today().year - 1, date.today().year - 5, -1):
        for fs_div, suffix in (("CFS", ""), ("OFS", "(별도)")):
            payload = _get_json(client, "fnlttSinglAcntAll.json", {"corp_code": corp_code, "bsns_year": str(year), "reprt_code": "11011", "fs_div": fs_div})
            if payload.get("list"):
                return payload["list"], f"{year}년 사업보고서{suffix}"
    return [], "최근 사업보고서"


def _disclosures(client: httpx.Client, corp_code: str) -> list[dict[str, str]]:
    end = date.today()
    payload = _get_json(client, "list.json", {"corp_code": corp_code, "bgn_de": (end - timedelta(days=370)).strftime("%Y%m%d"), "end_de": end.strftime("%Y%m%d"), "last_reprt_at": "Y", "page_count": "10", "sort": "date", "sort_mth": "desc"})
    return [{"title": str(item.get("report_nm") or "공시"), "date": str(item.get("rcept_dt") or ""), "submitter": str(item.get("flr_nm") or ""), "url": f"{DART_VIEWER_BASE}?rcpNo={quote(str(item.get('rcept_no') or ''))}"} for item in (payload.get("list") or [])[:8] if item.get("rcept_no")]


def build_holding_report(holding: Holding, client: httpx.Client | None = None) -> dict[str, Any]:
    stock_code = korean_stock_code(holding)
    base: dict[str, Any] = {"holding_id": holding.id, "name": holding.name, "ticker": holding.ticker, "stock_code": stock_code, "generated_at": datetime.now().isoformat(timespec="seconds"), "llm_required": False, "broker_research": broker_research_links(holding), "dart": {"configured": bool(settings.opendart_api_key), "available": False, "message": "", "company": None, "basis": "", "metrics": [], "ratios": [], "analysis": None, "disclosures": []}}
    dart = base["dart"]
    if not stock_code:
        dart["message"] = "OpenDART는 6자리 종목코드가 있는 국내 상장기업을 지원합니다."
        return base
    if not settings.opendart_api_key:
        dart["message"] = "설정에 OPENDART_API_KEY를 추가하면 자체 리포트가 활성화됩니다."
        return base
    owns_client = client is None
    if client is None:
        client = httpx.Client(timeout=15, follow_redirects=True)
    try:
        corp_code = _corp_codes(client).get(stock_code, "")
        if not corp_code:
            dart["message"] = "DART 공시대상 기업으로 확인되지 않습니다."
            return base
        company = _get_json(client, "company.json", {"corp_code": corp_code})
        rows, basis = _financials(client, corp_code)
        metrics = extract_financial_metrics(rows)
        ratios = [item for item in (_ratio("영업이익률", _metric(metrics, "operating_income"), _metric(metrics, "revenue")), _ratio("순이익률", _metric(metrics, "net_income"), _metric(metrics, "revenue")), _ratio("부채비율", _metric(metrics, "liabilities"), _metric(metrics, "equity")), _ratio("자기자본이익률(단순)", _metric(metrics, "net_income"), _metric(metrics, "equity"))) if item is not None]
        dart.update({"available": bool(metrics), "message": "공시 재무제표 기반으로 생성했습니다." if metrics else "재무제표 주요 계정을 찾지 못했습니다.", "company": {"corp_code": corp_code, "name": company.get("corp_name") or holding.name, "market": company.get("corp_cls", ""), "industry_code": company.get("induty_code", ""), "homepage": company.get("hm_url", "")}, "basis": basis, "metrics": metrics, "ratios": ratios, "analysis": _analysis(metrics, ratios) if metrics else None, "disclosures": _disclosures(client, corp_code)})
        return base
    except (httpx.HTTPError, OpenDartError) as exc:
        dart["message"] = f"OpenDART 조회 실패: {exc}"
        return base
    finally:
        if owns_client:
            client.close()
