from types import SimpleNamespace

import httpx

from backend.app.models import Holding
from backend.app.news import normalize_news_items, search_company_news


def test_normalizes_naver_news_markup_and_links():
    items = normalize_news_items({"items": [{"title": "<b>삼성전자</b> 실적 발표", "description": "영업이익이 <b>증가</b>했다.", "originallink": "https://news.example.com/1", "link": "https://n.news.naver.com/1", "pubDate": "Tue, 04 Aug 2026 09:00:00 +0900"}]})
    assert items[0]["title"] == "삼성전자 실적 발표"
    assert items[0]["summary"] == "영업이익이 증가했다."
    assert items[0]["url"] == "https://news.example.com/1"


def test_calls_api_hub_with_new_auth_headers(monkeypatch):
    monkeypatch.setattr("backend.app.news.settings", SimpleNamespace(naver_api_hub_client_id="hub-id", naver_api_hub_client_secret="hub-secret", naver_client_id="", naver_client_secret=""))

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/search/v1/news"
        assert request.headers["X-NCP-APIGW-API-KEY-ID"] == "hub-id"
        return httpx.Response(200, json={"items": []})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        result = search_company_news(Holding(name="삼성전자", ticker="005930.KS"), client)
    assert result["configured"] is True
    assert result["provider"] == "NAVER API HUB"
