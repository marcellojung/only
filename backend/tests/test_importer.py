from io import BytesIO

from openpyxl import Workbook

from backend.app.importer import parse_upload


def test_parses_bank_salad_ledger_and_holdings():
    workbook = Workbook()
    status = workbook.active
    status.title = "뱅샐현황"
    status.append([None, "3.재무현황"])
    status.append([None, "항목", "상품명", None, "금액", "항목", "상품명", None, "금액"])
    status.append([None, "부동산", "우리 집", None, 1_000_000_000, "장기대출", "주택대출", None, 300_000_000])
    status.append([None, "4.신용현황"])
    status.append([None, "5.투자현황"])
    status.append([None, "투자상품종류", "금융사", "상품명", None, "투자원금", "평가금액", "수익률"])
    status.append([None, "주식", "증권사", "삼성전자", None, 1_000_000, 1_100_000, 10])
    status.append([None, "6.대출현황"])
    status.append([None, "대출종류", "금융사", "상품명", None, "대출원금", "대출잔액", "대출금리"])
    status.append([None, "은행 대출", "은행", "주택대출", None, 300_000_000, 290_000_000, 3.5])
    ledger = workbook.create_sheet("가계부 내역")
    ledger.append(["날짜", "시간", "타입", "대분류", "소분류", "내용", "금액", "화폐", "결제수단", "메모"])
    ledger.append(["2026-08-03", "12:00", "지출", "식비", "외식", "식당", -20_000, "KRW", "카드", ""])
    buffer = BytesIO()
    workbook.save(buffer)

    parsed = parse_upload(buffer.getvalue(), "bank-salad.xlsx")

    assert len(parsed["transactions"]) == 1
    assert parsed["transactions"][0]["amount"] == 20_000
    assert len(parsed["assets"]) == 1
    assert parsed["holdings"][0]["name"] == "삼성전자"
    assert parsed["debts"][0]["balance"] == 290_000_000


def test_parses_generic_stock_csv():
    content = "종목명,종목코드,보유수량,평균단가,현재가,통화,증권사\n삼성전자,005930.KS,10,70000,80000,KRW,테스트증권\n".encode("utf-8-sig")
    parsed = parse_upload(content, "holdings.csv")
    assert parsed["transactions"] == []
    assert len(parsed["holdings"]) == 1
    assert parsed["holdings"][0]["ticker"] == "005930.KS"
    assert parsed["holdings"][0]["market_value"] == 800_000
