"""Receive and answer commands from the configured Telegram chat."""

from __future__ import annotations

import asyncio
import math
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .automations import asset_brief, market_brief
from .config import settings
from .database import SessionLocal
from .market import ALIASES, refresh_market
from .models import Holding, TelegramBotState, WatchItem
from .telegram import answer_callback_query, command_keyboard, get_telegram_updates, register_telegram_commands, send_telegram_message, telegram_configured


HELP_TEXT = """[모아 텔레그램 사용법]

• 현재 조회 — 저장된 현재 자산을 조회합니다.
• 아침 브리핑 — 시장 지표와 주요 뉴스를 조회합니다.
• refresh — 보유·관심 종목 시세를 갱신합니다.
• watch — 관심종목 목록과 등록 사용법을 표시합니다.
• stock — 보유 종목 목표가 알림 목록을 표시합니다.
• help — 이 사용법을 다시 표시합니다.

등록 예시
• watch AAPL 250
• watch 005930.KS 250000
• stock 삼성전자 250000

삭제·해제
• watch 삭제 AAPL
• stock 삼성전자 해제

/current · /morning · /refresh · /watch · /stock · /help"""


def normalize_command(text: str) -> str:
    value = " ".join(text.strip().lower().split())
    if value.startswith("/"):
        value = value[1:].split("@", 1)[0]
    return value.replace(" ", "")


def command_parts(text: str) -> tuple[str, list[str]]:
    values = text.strip().split()
    if not values:
        return "", []
    command = values[0].lower()
    if command.startswith("/"):
        command = command[1:].split("@", 1)[0]
    return command, values[1:]


def _number(value: str) -> float | None:
    try:
        number = float(value.replace(",", ""))
    except ValueError:
        return None
    return number if math.isfinite(number) and number > 0 else None


def _price(value: float | None, currency: str) -> str:
    if value is None:
        return "조회 전"
    digits = 0 if currency == "KRW" else 2
    return f"{value:,.{digits}f} {currency}"


def _watch_ticker(value: str) -> str:
    raw = value.strip()
    if raw in ALIASES:
        return ALIASES[raw]
    ticker = raw.upper()
    if len(ticker) == 6 and ticker.isdigit():
        return f"{ticker}.KS"
    return ticker


def watch_page(db: Session) -> str:
    items = list(db.scalars(select(WatchItem).where(WatchItem.is_active.is_(True)).order_by(WatchItem.ticker)))
    lines = ["[관심종목]", ""]
    if items:
        lines.extend(
            f"• {item.ticker}: 현재 {_price(item.current_price, item.currency)} / 목표 {_price(item.target_price, item.currency)}"
            for item in items
        )
    else:
        lines.append("등록된 관심종목이 없습니다.")
    lines.extend(["", "등록: watch 티커 목표가", "삭제: watch 삭제 티커", "예: watch AAPL 250"])
    return "\n".join(lines)


def watch_command(db: Session, args: list[str]) -> str:
    if not args:
        return watch_page(db)
    delete_words = {"삭제", "해제", "delete", "remove", "off"}
    if args[0].lower() in delete_words:
        if len(args) < 2:
            return "삭제할 티커를 입력해 주세요. 예: watch 삭제 AAPL"
        ticker = _watch_ticker(args[1])
        item = db.scalar(select(WatchItem).where(WatchItem.ticker == ticker, WatchItem.is_active.is_(True)))
        if item is None:
            return f"관심종목에서 {ticker}를 찾지 못했습니다."
        item.is_active = False
        db.commit()
        return f"관심종목에서 {ticker}를 삭제했습니다."
    if len(args) >= 2 and args[-1].lower() in delete_words:
        return watch_command(db, ["삭제", args[0]])
    if len(args) < 2:
        ticker = _watch_ticker(args[0])
        item = db.scalar(select(WatchItem).where(WatchItem.ticker == ticker, WatchItem.is_active.is_(True)))
        return watch_page(db) if item is None else f"[관심종목] {ticker}\n현재 {_price(item.current_price, item.currency)}\n목표 {_price(item.target_price, item.currency)}"
    ticker = _watch_ticker(args[0])
    target = _number(args[1])
    if not ticker or target is None:
        return "티커와 0보다 큰 목표가를 확인해 주세요. 예: watch AAPL 250"
    item = db.scalar(select(WatchItem).where(WatchItem.ticker == ticker))
    if item is None:
        currency = "KRW" if ticker.endswith((".KS", ".KQ", "-KRW")) else "USD"
        item = WatchItem(ticker=ticker, target_price=target, currency=currency)
        db.add(item)
    else:
        item.target_price = target
        item.alert_sent_at = None
        item.is_active = True
    db.commit()
    return f"관심종목을 등록했습니다.\n{ticker} · 목표 {_price(target, item.currency)}"


def _find_holding(db: Session, query: str) -> tuple[Holding | None, str]:
    holdings = list(db.scalars(select(Holding).where(Holding.is_active.is_(True))))
    lowered = query.strip().lower()
    exact = [item for item in holdings if item.name.lower() == lowered or item.ticker.lower() == lowered]
    matches = exact or [item for item in holdings if lowered in item.name.lower() or lowered in item.ticker.lower()]
    if len(matches) == 1:
        return matches[0], ""
    if not matches:
        return None, f"보유 종목에서 '{query}'을 찾지 못했습니다."
    labels = ", ".join(f"{item.name}({item.ticker})" for item in matches[:8])
    return None, f"종목을 하나로 특정해 주세요: {labels}"


def stock_page(db: Session) -> str:
    holdings = list(db.scalars(select(Holding).where(Holding.is_active.is_(True)).order_by(Holding.market_value.desc())))
    lines = ["[보유 종목 목표가 알림]", ""]
    if holdings:
        lines.extend(
            f"• {item.name} ({item.ticker or '티커 없음'}): 현재 {_price(item.current_price, item.currency)} / 목표 {_price(item.target_price, item.currency) if item.target_price else '미설정'}"
            for item in holdings
        )
    else:
        lines.append("등록된 보유 종목이 없습니다.")
    lines.extend(["", "등록: stock 종목명 목표가", "조회: stock 종목명", "해제: stock 종목명 해제"])
    return "\n".join(lines)


def stock_command(db: Session, args: list[str]) -> str:
    if not args:
        return stock_page(db)
    off_words = {"삭제", "해제", "off", "disable"}
    disable = args[-1].lower() in off_words
    target = _number(args[-1]) if len(args) >= 2 else None
    query_parts = args[:-1] if disable or target is not None else args
    query = " ".join(query_parts).strip()
    if not query:
        return "종목명 또는 티커를 입력해 주세요. 예: stock 삼성전자 250000"
    holding, error = _find_holding(db, query)
    if holding is None:
        return error
    if disable:
        holding.target_price = 0
        holding.target_alert_enabled = False
        holding.target_alert_sent_at = None
        db.commit()
        return f"{holding.name} 목표가 알림을 해제했습니다."
    if target is not None:
        holding.target_price = target
        holding.target_alert_enabled = True
        holding.target_alert_sent_at = None
        db.commit()
        return f"{holding.name} 목표가 알림을 등록했습니다.\n현재 {_price(holding.current_price, holding.currency)} / 목표 {_price(target, holding.currency)}"
    status = _price(holding.target_price, holding.currency) if holding.target_price and holding.target_alert_enabled else "미설정"
    return f"[종목 목표가 알림]\n{holding.name} ({holding.ticker or '티커 없음'})\n현재 {_price(holding.current_price, holding.currency)}\n목표 {status}"


def command_response(db: Session, text: str) -> str:
    head, args = command_parts(text)
    if head == "refresh":
        result = refresh_market(db)
        return f"[시세 갱신 완료]\n보유 종목 {result['updated']}개 · 관심종목 {result['watch_updated']}개\n건너뜀 {result['skipped']}개 · 알림 {result['alerts_sent']}개"
    if head == "watch":
        return watch_command(db, args)
    if head == "stock":
        return stock_command(db, args)
    command = normalize_command(text)
    if command in {"현재", "현재조회", "현재자산", "현재자산조회", "current"}:
        return asset_brief(db, title="모아 현재 자산 조회")
    if command in {"아침", "아침브리핑", "모닝브리핑", "morning"}:
        return market_brief()
    if command in {"help", "도움말", "사용법", "start"}:
        return HELP_TEXT
    return "지원하지 않는 명령입니다. 아래 버튼을 누르거나 help를 입력해 주세요."


def _incoming(update: dict[str, Any]) -> tuple[str, str, str] | None:
    message = update.get("message")
    if isinstance(message, dict):
        chat = message.get("chat")
        text = message.get("text")
        if isinstance(chat, dict) and isinstance(text, str):
            return str(chat.get("id", "")), text, ""
    callback = update.get("callback_query")
    if isinstance(callback, dict):
        callback_message = callback.get("message")
        chat = callback_message.get("chat") if isinstance(callback_message, dict) else None
        data = callback.get("data")
        callback_id = callback.get("id")
        if isinstance(chat, dict) and isinstance(data, str) and isinstance(callback_id, str):
            return str(chat.get("id", "")), data, callback_id
    return None


def process_updates(db: Session, updates: list[dict[str, Any]]) -> int:
    state = db.get(TelegramBotState, 1)
    if state is None:
        state = TelegramBotState(id=1, last_update_id=0)
        db.add(state)
        db.commit()
    processed = 0
    for update in sorted(updates, key=lambda item: int(item.get("update_id", 0))):
        update_id = int(update.get("update_id", 0))
        if update_id <= state.last_update_id:
            continue
        # Claim before the reply so a restart cannot send the same response twice.
        state.last_update_id = update_id
        db.commit()
        incoming = _incoming(update)
        if incoming and incoming[0] == str(settings.telegram_chat_id):
            send_telegram_message(command_response(db, incoming[1]), reply_markup=command_keyboard())
            if incoming[2]:
                answer_callback_query(incoming[2])
            processed += 1
    return processed


def poll_telegram_once() -> int:
    with SessionLocal() as db:
        state = db.get(TelegramBotState, 1)
        if state is None:
            # A first start acknowledges old Telegram backlog without replaying it.
            backlog = get_telegram_updates(timeout=0)
            last_update_id = max((int(item.get("update_id", 0)) for item in backlog), default=0)
            db.add(TelegramBotState(id=1, last_update_id=last_update_id))
            db.commit()
            return 0
        updates = get_telegram_updates(offset=state.last_update_id + 1)
        return process_updates(db, updates)


async def telegram_command_loop() -> None:
    if not telegram_configured():
        return
    try:
        await asyncio.to_thread(register_telegram_commands)
    except Exception:
        pass
    while True:
        try:
            await asyncio.to_thread(poll_telegram_once)
        except asyncio.CancelledError:
            raise
        except Exception:
            await asyncio.sleep(5)


def start_telegram_commands() -> asyncio.Task[None] | None:
    if not telegram_configured():
        return None
    return asyncio.create_task(telegram_command_loop(), name="telegram-command-listener")


async def stop_telegram_commands(task: asyncio.Task[None] | None) -> None:
    if task is None:
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
