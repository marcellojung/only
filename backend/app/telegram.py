"""Telegram Bot API helpers."""

from __future__ import annotations

import httpx

from .config import settings


def telegram_configured() -> bool:
    return bool(settings.telegram_bot_token and settings.telegram_chat_id)


def command_keyboard() -> dict[str, object]:
    return {
        "inline_keyboard": [
            [
                {"text": "현재 조회", "callback_data": "current"},
                {"text": "아침 브리핑", "callback_data": "morning"},
            ],
            [
                {"text": "시세 갱신", "callback_data": "refresh"},
                {"text": "관심종목", "callback_data": "watch"},
            ],
            [
                {"text": "종목 알림", "callback_data": "stock"},
                {"text": "사용법", "callback_data": "help"},
            ],
        ]
    }


def send_telegram_message(text: str, reply_markup: dict[str, object] | None = None) -> dict[str, object]:
    if not telegram_configured():
        return {"ok": False, "message": "텔레그램 봇 토큰과 채팅 ID를 설정해 주세요."}
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    sent = 0
    parts = split_message(text)
    for index, part in enumerate(parts):
        try:
            body: dict[str, object] = {"chat_id": settings.telegram_chat_id, "text": part}
            if reply_markup and index == len(parts) - 1:
                body["reply_markup"] = reply_markup
            response = httpx.post(url, json=body, timeout=15)
            payload = response.json()
        except Exception as exc:
            return {"ok": False, "uncertain": True, "message": f"{sent}개 전송 확인 후 응답 확인 실패 ({type(exc).__name__}). 텔레그램에서 확인해 주세요."}
        if not response.is_success or not payload.get("ok"):
            return {"ok": False, "uncertain": sent > 0, "message": f"{sent}개 전송 완료 · {payload.get('description', '텔레그램 전송 실패')}"}
        sent += 1
    return {"ok": True, "message": f"텔레그램 전송 완료 ({sent}개 메시지)"}


def get_telegram_updates(offset: int | None = None, timeout: int = 20) -> list[dict[str, object]]:
    if not telegram_configured():
        return []
    params: dict[str, object] = {"timeout": timeout, "allowed_updates": '["message","callback_query"]'}
    if offset is not None:
        params["offset"] = offset
    response = httpx.get(
        f"https://api.telegram.org/bot{settings.telegram_bot_token}/getUpdates",
        params=params,
        timeout=timeout + 5,
    )
    payload = response.json()
    if not response.is_success or not payload.get("ok"):
        raise RuntimeError(payload.get("description", "텔레그램 메시지 조회 실패"))
    return [item for item in payload.get("result", []) if isinstance(item, dict)]


def answer_callback_query(callback_query_id: str) -> None:
    if not telegram_configured() or not callback_query_id:
        return
    httpx.post(
        f"https://api.telegram.org/bot{settings.telegram_bot_token}/answerCallbackQuery",
        json={"callback_query_id": callback_query_id},
        timeout=8,
    )


def register_telegram_commands() -> bool:
    if not telegram_configured():
        return False
    response = httpx.post(
        f"https://api.telegram.org/bot{settings.telegram_bot_token}/setMyCommands",
        json={
            "commands": [
                {"command": "current", "description": "현재 자산 조회"},
                {"command": "morning", "description": "아침 브리핑"},
                {"command": "refresh", "description": "시세 갱신"},
                {"command": "watch", "description": "관심종목 관리"},
                {"command": "stock", "description": "보유 종목 목표가 알림"},
                {"command": "help", "description": "사용법 보기"},
            ]
        },
        timeout=10,
    )
    payload = response.json()
    return bool(response.is_success and payload.get("ok"))


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
