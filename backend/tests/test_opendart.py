from backend.app.models import Holding
from backend.app.opendart import broker_research_links, extract_financial_metrics, korean_stock_code


def _row(account_id: str, account_nm: str, current: str, previous: str, *, fs_div: str = "CFS", sj_div: str = "IS"):
    return {"account_id": account_id, "account_nm": account_nm, "fs_div": fs_div, "sj_div": sj_div, "thstrm_nm": "제 56 기", "thstrm_amount": current, "frmtrm_nm": "제 55 기", "frmtrm_amount": previous}


def test_extracts_consolidated_metrics_and_change_rates():
    rows = [_row("ifrs-full_Revenue", "매출액", "120,000", "100,000"), _row("dart_OperatingIncomeLoss", "영업이익", "12,000", "8,000"), _row("ifrs-full_Assets", "자산총계", "300,000", "270,000", sj_div="BS"), _row("ifrs-full_Revenue", "매출액", "1", "1", fs_div="OFS")]
    by_key = {metric["key"]: metric for metric in extract_financial_metrics(rows)}
    assert by_key["revenue"]["current"] == 120_000
    assert by_key["revenue"]["change_rate"] == 0.2
    assert by_key["assets"]["current"] == 300_000


def test_builds_provider_links_only_for_krx_stock_code():
    korean = Holding(name="삼성전자", ticker="005930.KS")
    assert korean_stock_code(korean) == "005930"
    links = broker_research_links(korean)
    assert any("alphasquare.co.kr" in link["url"] for link in links)
    assert any("fnguide.com" in link["url"] for link in links)
    assert broker_research_links(Holding(name="Apple", ticker="AAPL")) == []
