"""Google Calendar 조회 도우미입니다.

사용법:
1) 필요한 패키지 설치: pip install google-api-python-client google-auth
2) 환경변수에 `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_CALENDAR_ID` 설정
3) 실행: python backend/app/google_calendar.py
"""
from __future__ import annotations

import os
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build

LOGGER = logging.getLogger(__name__)


def _get_env(name: str) -> str:
    v = os.environ.get(name)
    if not v:
        raise RuntimeError(f"환경변수 {name} 이(가) 설정되어 있지 않습니다.")
    return v


def _normalize_private_key(raw: str) -> str:
    # .env 파일에 "-----BEGIN...\n...\n" 형태로 저장된 경우를 처리
    if raw.startswith('"') and raw.endswith('"'):
        raw = raw[1:-1]
    return raw.replace('\\n', "\n")


def get_calendar_service() -> object:
    """환경변수에서 서비스 계정 정보를 읽어 `googleapiclient` 서비스 객체를 반환합니다."""
    client_email = _get_env("GOOGLE_SERVICE_ACCOUNT_EMAIL")
    raw_key = _get_env("GOOGLE_PRIVATE_KEY")
    private_key = _normalize_private_key(raw_key)

    info = {
        "type": "service_account",
        "client_email": client_email,
        "private_key": private_key,
        "token_uri": "https://oauth2.googleapis.com/token",
    }

    scopes = ["https://www.googleapis.com/auth/calendar.readonly"]
    creds = Credentials.from_service_account_info(info, scopes=scopes)
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)
    return service


def list_upcoming_events(calendar_id: Optional[str] = None, max_results: int = 10) -> List[Dict[str, Any]]:
    """지정한 캘린더에서 향후 이벤트를 조회합니다."""
    if calendar_id is None:
        calendar_id = _get_env("GOOGLE_CALENDAR_ID")

    service = get_calendar_service()
    now = datetime.now(timezone.utc).isoformat()
    events = (
        service.events()
        .list(
            calendarId=calendar_id,
            timeMin=now,
            maxResults=max_results,
            singleEvents=True,
            orderBy="startTime",
        )
        .execute()
    )
    return events.get("items", [])


def pretty_print_events(events: List[Dict[str, Any]]) -> None:
    if not events:
        print("향후 이벤트가 없습니다.")
        return
    for e in events:
        start = e.get("start", {}).get("dateTime") or e.get("start", {}).get("date")
        summary = e.get("summary", "(제목 없음)")
        print(f"- {start}  {summary}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    try:
        ev = list_upcoming_events(max_results=20)
        pretty_print_events(ev)
    except Exception as exc:  # pragma: no cover - CLI helper
        LOGGER.exception("Google Calendar 조회 중 오류가 발생했습니다: %s", exc)
        raise
