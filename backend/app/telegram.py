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
    sent = 0
    for part in split_message(text):
        try:
            response = httpx.post(url, json={"chat_id": settings.telegram_chat_id, "text": part}, timeout=15)
            payload = response.json()
        except Exception as exc:
            return {"ok": False, "uncertain": True, "message": f"{sent}개 전송 확인 후 응답 확인 실패 ({type(exc).__name__}). 텔레그램에서 확인해 주세요."}
        if not response.is_success or not payload.get("ok"):
            return {"ok": False, "uncertain": sent > 0, "message": f"{sent}개 전송 완료 · {payload.get('description', '텔레그램 전송 실패')}"}
        sent += 1
    return {"ok": True, "message": f"텔레그램 전송 완료 ({sent}개 메시지)"}


def split_message(text: str) -> list[str]:
    """Keep every character, including emoji, within a UTF-16-safe limit."""
    parts, buffer, units = [], [], 0
    for char in text:
        size = 2 if ord(char) > 0xFFFF else 1
        if units + size > 3500:
            parts.append("".join(buffer))
            buffer, units = [], 0
        buffer.append(char)
        units += size
    if buffer:
        parts.append("".join(buffer))
    return parts or ["(내용 없음)"]


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
