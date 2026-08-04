from backend.app.models import Holding
from backend.app.prompts import build_stock_prompts


def test_builds_two_copy_ready_stock_prompts_with_report_context():
    prompts = build_stock_prompts(Holding(name="삼성전자", ticker="005930.KS"), {"dart": {"basis": "2025년 사업보고서", "metrics": [{"label": "매출액", "current": 100_000, "change_rate": 0.2}], "ratios": [{"label": "영업이익률", "value": 0.15}]}})
    assert [item["id"] for item in prompts] == ["basic", "gowalter"]
    assert "삼성전자 (005930.KS)" in prompts[0]["text"]
    assert "내가 틀릴 수 있는 이유" in prompts[1]["text"]
