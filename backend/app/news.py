"""Recent company news from NAVER Search API / NAVER API HUB."""

from __future__ import annotations

import html
import re
from email.utils import parsedate_to_datetime
from typing import Any

import httpx

from .config import settings
from .models import Holding


_TAG_RE = re.compile(r"<[^>]+>")


def _plain_text(value: Any) -> str:
    return html.unescape(_TAG_RE.sub("", str(value or ""))).strip()


def normalize_news_items(payload: dict[str, Any]) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in payload.get("items") or []:
        link = str(item.get("originallink") or item.get("link") or "").strip()
        title = _plain_text(item.get("title"))
        if not link or not title or link in seen:
            continue
        seen.add(link)
        published_at = ""
        if item.get("pubDate"):
            try:
                published_at = parsedate_to_datetime(str(item["pubDate"])).isoformat()
            except (TypeError, ValueError, OverflowError):
                published_at = str(item["pubDate"])
        items.append({
            "title": title,
            "summary": _plain_text(item.get("description")),
            "url": link,
            "naver_url": str(item.get("link") or link),
            "published_at": published_at,
        })
    return items[:10]


def _connection() -> tuple[str, dict[str, str], str] | None:
    if settings.naver_api_hub_client_id and settings.naver_api_hub_client_secret:
        return (
            "https://naverapihub.apigw.ntruss.com/search/v1/news",
            {
                "X-NCP-APIGW-API-KEY-ID": settings.naver_api_hub_client_id,
                "X-NCP-APIGW-API-KEY": settings.naver_api_hub_client_secret,
            },
            "NAVER API HUB",
        )
    if settings.naver_client_id and settings.naver_client_secret:
        return (
            "https://openapi.naver.com/v1/search/news.json",
            {"X-Naver-Client-Id": settings.naver_client_id, "X-Naver-Client-Secret": settings.naver_client_secret},
            "NAVER Developers",
        )
    return None


def search_company_news(holding: Holding, client: httpx.Client | None = None) -> dict[str, Any]:
    connection = _connection()
    if connection is None:
        return {"configured": False, "provider": "NAVER API HUB", "message": "NAVER API HUB 키를 설정하면 최신 종목 뉴스가 표시됩니다.", "items": []}
    url, headers, provider = connection
    owns_client = client is None
    if client is None:
        client = httpx.Client(timeout=12, follow_redirects=True)
    try:
        response = client.get(url, headers=headers, params={"query": f"{holding.name} {holding.ticker.split('.')[0]} 주식", "display": 10, "start": 1, "sort": "date"})
        response.raise_for_status()
        items = normalize_news_items(response.json())
        return {"configured": True, "provider": provider, "message": f"{len(items)}건의 최신 뉴스를 찾았습니다." if items else "최근 뉴스를 찾지 못했습니다.", "items": items}
    except (httpx.HTTPError, ValueError) as exc:
        return {"configured": True, "provider": provider, "message": f"네이버 뉴스 조회 실패: {type(exc).__name__}", "items": []}
    finally:
        if owns_client:
            client.close()
