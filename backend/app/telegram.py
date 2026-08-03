"""Telegram Bot API helpers."""

from __future__ import annotations

import httpx

from .config import settings


def telegram_configured() -> bool:
    return bool(settings.telegram_bot_token and settings.telegram_chat_id)


def send_telegram_message(text: str) -> dict[str, object]:
    if not telegram_configured():
        return {"ok": False, "message": "텔레그램 봇 토큰과 채팅 ID를 설정해 주세요."}
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    try:
        response = httpx.post(
            url,
            json={"chat_id": settings.telegram_chat_id, "text": text[:4000]},
            timeout=15,
        )
        payload = response.json()
    except Exception as exc:
        return {"ok": False, "message": f"텔레그램 전송 실패: {type(exc).__name__}"}
    return {
        "ok": bool(response.is_success and payload.get("ok")),
        "message": "텔레그램 전송 완료" if payload.get("ok") else payload.get("description", "텔레그램 전송 실패"),
    }


def probe_telegram() -> dict[str, object]:
    if not telegram_configured():
        return {"configured": False, "connected": False, "message": "설정 필요"}
    try:
        response = httpx.get(
            f"https://api.telegram.org/bot{settings.telegram_bot_token}/getMe",
            timeout=8,
        )
        payload = response.json()
        connected = bool(response.is_success and payload.get("ok"))
        return {
            "configured": True,
            "connected": connected,
            "message": "연결됨" if connected else payload.get("description", "연결 실패"),
        }
    except Exception as exc:
        return {"configured": True, "connected": False, "message": f"확인 실패: {type(exc).__name__}"}
