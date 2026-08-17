"""FastAPI entry point for the family asset backend."""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import date
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from .ai import analyze_portfolio, portfolio_prompt
from .auth import Viewer, authenticate, current_user, issue_token, login_rate_limiter, require_admin
from .config import settings
from .database import engine, get_db, init_db
from .history import create_portfolio_snapshot
from .importer import import_upload
from .market import latest_exchange_rate, normalize_user_symbol, refresh_exchange_rate, refresh_holding_quote, refresh_market
from .models import AlertEvent, Debt, FamilyEvent, Holding, Transaction
from .news import search_company_news
from .opendart import build_holding_report
from .prompts import build_stock_prompts
from .scheduler import start_auto_refresh, stop_auto_refresh
from .state import build_state, integrations, serialize_transaction
from .telegram import send_telegram_message


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings.validate_security()
    init_db()
    scheduler_task = start_auto_refresh()
    try:
        yield
    finally:
        await stop_auto_refresh(scheduler_task)


app = FastAPI(title="모아 자산 API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HoldingPatch(BaseModel):
    ticker: str | None = Field(default=None, max_length=40)
    quantity: float | None = Field(default=None, ge=0)
    average_price_krw: float | None = Field(default=None, gt=0)
    target_price: float | None = Field(default=None, ge=0)
    target_alert_enabled: bool | None = None


class HoldingCreate(BaseModel):
    owner: str = Field(default="공통", min_length=1, max_length=30)
    asset_type: str = Field(default="주식", min_length=1, max_length=40)
    broker: str = Field(default="직접 입력", max_length=120)
    name: str = Field(min_length=1, max_length=300)
    ticker: str = Field(default="", max_length=40)
    quantity: float = Field(gt=0)
    principal: float = Field(default=0, ge=0)
    average_price: float = Field(default=0, ge=0)
    average_price_currency: str = Field(default="KRW", max_length=10)


class DebtCreate(BaseModel):
    owner: str = Field(default="공통", min_length=1, max_length=30)
    debt_type: str = Field(default="주택담보대출", min_length=1, max_length=80)
    provider: str = Field(default="", max_length=120)
    name: str = Field(min_length=1, max_length=300)
    principal: float = Field(default=0, ge=0)
    balance: float = Field(gt=0)
    interest_rate: float = Field(default=0, ge=0, le=100)


class AnalysisPayload(BaseModel):
    prompt: str = Field(default="", max_length=16000)


class LoginPayload(BaseModel):
    owner: str = Field(min_length=1, max_length=30)
    password: str = Field(min_length=1, max_length=300)


class EventCreate(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()), min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=300)
    date: str = Field(min_length=10, max_length=10)
    time: str = Field(default="", max_length=20)
    owner: str = Field(max_length=30)
    color: str = Field(default="mint", max_length=30)
    googleEventId: str = Field(default="", max_length=300)


@app.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, object]:
    db.execute(text("SELECT 1"))
    return {"ok": True, "database": "sqlite", "version": app.version}


@app.post("/api/auth/login")
def login(payload: LoginPayload, x_client_ip: str = Header(default="unknown", max_length=80)) -> dict[str, object]:
    client_id = x_client_ip.strip() or "unknown"
    retry_after = login_rate_limiter.retry_after(client_id)
    if retry_after:
        raise HTTPException(
            status_code=429,
            detail=f"로그인 시도가 너무 많습니다. {max(1, retry_after // 60)}분 후 다시 시도해 주세요.",
            headers={"Retry-After": str(retry_after)},
        )
    viewer = authenticate(payload.owner.strip(), payload.password)
    if not viewer:
        login_rate_limiter.record_failure(client_id)
        raise HTTPException(status_code=401, detail="이름 또는 비밀번호가 맞지 않습니다.")
    login_rate_limiter.record_success(client_id)
    return {"token": issue_token(viewer), "viewer": {"owner": viewer.owner, "role": viewer.role}}


@app.get("/api/auth/me")
def auth_me(viewer: Viewer = Depends(current_user)) -> dict[str, str]:
    return {"owner": viewer.owner, "role": viewer.role}


@app.get("/api/state")
def state(viewer: Viewer = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, object]:
    return build_state(db, owner=None if viewer.is_admin else viewer.owner, role=viewer.role)


@app.get("/api/transactions")
def transactions(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=1000, ge=1, le=10000),
    _viewer: Viewer = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    total = db.scalar(select(func.count(Transaction.id))) or 0
    items = list(
        db.scalars(
            select(Transaction)
            .order_by(Transaction.transaction_date.desc(), Transaction.id.desc())
            .offset(offset)
            .limit(limit)
        )
    )
    return {
        "items": [serialize_transaction(item) for item in items],
        "offset": offset,
        "limit": limit,
        "total": total,
        "has_more": offset + len(items) < total,
    }


@app.post("/api/import", dependencies=[Depends(require_admin)])
async def upload_import(
    file: UploadFile = File(...),
    owner: str = Query(default="공통", max_length=30),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    filename = file.filename or "upload.xlsx"
    content = await file.read()
    if len(content) > 40 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="40MB 이하 파일만 올릴 수 있습니다.")
    try:
        return import_upload(db, content, filename, owner.strip() or "공통")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"파일 처리 실패: {type(exc).__name__}") from exc


@app.post("/api/market/refresh", dependencies=[Depends(require_admin)])
def market_refresh(db: Session = Depends(get_db)) -> dict[str, object]:
    try:
        return refresh_market(db)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail=f"시세 갱신 실패: {type(exc).__name__}") from exc


@app.post("/api/exchange-rate/refresh", dependencies=[Depends(require_admin)])
def exchange_refresh(db: Session = Depends(get_db)) -> dict[str, object]:
    try:
        record = refresh_exchange_rate(db)
        db.commit()
        return {"pair": record.pair, "rate": record.rate, "source": record.source, "updated_at": record.captured_at.isoformat()}
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail=f"환율 갱신 실패: {type(exc).__name__}") from exc


@app.post("/api/holdings", dependencies=[Depends(require_admin)])
def create_holding(payload: HoldingCreate, db: Session = Depends(get_db)) -> dict[str, object]:
    supported = {"주식", "ETF", "펀드", "코인", "암호화폐"}
    if payload.asset_type not in supported:
        raise HTTPException(status_code=400, detail="지원하지 않는 자산 유형입니다.")
    symbol = normalize_user_symbol(payload.asset_type, payload.ticker, payload.name)
    if payload.asset_type in {"코인", "암호화폐"} and not symbol:
        raise HTTPException(status_code=400, detail="코인 심볼을 입력해 주세요.")
    average_currency = payload.average_price_currency.strip().upper()
    if average_currency not in {"KRW", "USD"}:
        raise HTTPException(status_code=400, detail="평단 통화는 KRW 또는 USD만 지원합니다.")
    principal = payload.principal
    if payload.average_price:
        fx = 1.0
        if average_currency == "USD":
            exchange = latest_exchange_rate(db)
            if not exchange:
                try:
                    exchange = refresh_exchange_rate(db)
                except Exception as exc:
                    raise HTTPException(status_code=502, detail="USD 평단 환산에 필요한 환율을 가져오지 못했습니다.") from exc
            fx = exchange.rate
        principal = payload.quantity * payload.average_price * fx
    holding = Holding(
        owner=payload.owner.strip(),
        source_key=f"manual:{uuid4().hex}",
        asset_type="코인" if payload.asset_type == "암호화폐" else payload.asset_type,
        broker=payload.broker.strip(),
        name=payload.name.strip(),
        ticker=symbol,
        ticker_source="user" if symbol else "",
        currency="KRW",
        principal=principal,
        market_value=principal,
        quantity=payload.quantity,
        quantity_source="user",
        price_source="manual",
        is_active=True,
    )
    db.add(holding)
    db.flush()
    quote_updated = refresh_holding_quote(db, holding)
    create_portfolio_snapshot(db, source="holding_create")
    db.commit()
    return {"ok": True, "holding_id": holding.id, "quote_updated": quote_updated, "ticker": holding.ticker, "principal": holding.principal}


@app.post("/api/debts", dependencies=[Depends(require_admin)])
def create_debt(payload: DebtCreate, db: Session = Depends(get_db)) -> dict[str, object]:
    debt = Debt(
        owner=payload.owner.strip(),
        source_key=f"manual:{uuid4().hex}",
        debt_type=payload.debt_type.strip(),
        provider=payload.provider.strip(),
        name=payload.name.strip(),
        principal=payload.principal or payload.balance,
        balance=payload.balance,
        interest_rate=payload.interest_rate,
        is_active=True,
    )
    db.add(debt)
    db.flush()
    create_portfolio_snapshot(db, source="debt_create")
    db.commit()
    return {"ok": True, "debt_id": debt.id, "balance": debt.balance}


@app.post("/api/events", dependencies=[Depends(require_admin)])
def create_event(payload: EventCreate, db: Session = Depends(get_db)) -> dict[str, object]:
    if payload.owner not in {"공통", "성근", "지우", "윤재"}:
        raise HTTPException(status_code=400, detail="일정 소유자를 확인해 주세요.")
    try:
        event_date = date.fromisoformat(payload.date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="일정 날짜를 확인해 주세요.") from exc
    item = db.scalar(select(FamilyEvent).where(FamilyEvent.event_key == payload.id))
    if not item:
        item = FamilyEvent(event_key=payload.id)
        db.add(item)
    item.owner = payload.owner
    item.title = payload.title.strip()
    item.event_date = event_date
    item.event_time = payload.time
    item.color = payload.color
    item.google_event_id = payload.googleEventId
    db.commit()
    return {
        "ok": True,
        "event": {
            "id": item.event_key,
            "title": item.title,
            "date": item.event_date.isoformat(),
            "time": item.event_time,
            "owner": item.owner,
            "color": item.color,
            "googleEventId": item.google_event_id,
        },
    }


@app.delete("/api/events/{event_key}", dependencies=[Depends(require_admin)])
def delete_event(event_key: str, db: Session = Depends(get_db)) -> dict[str, object]:
    item = db.scalar(select(FamilyEvent).where(FamilyEvent.event_key == event_key))
    if not item:
        raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")
    db.delete(item)
    db.commit()
    return {"ok": True, "deleted": True}


@app.patch("/api/holdings/{holding_id}", dependencies=[Depends(require_admin)])
def update_holding(holding_id: int, payload: HoldingPatch, db: Session = Depends(get_db)) -> dict[str, object]:
    holding = db.get(Holding, holding_id)
    if not holding or not holding.is_active:
        raise HTTPException(status_code=404, detail="보유 종목을 찾을 수 없습니다.")
    values = payload.model_dump(exclude_unset=True)
    average_price_krw = values.pop("average_price_krw", None)
    previous_target = holding.target_price
    for key, value in values.items():
        if key == "ticker" and isinstance(value, str):
            value = normalize_user_symbol(holding.asset_type, value, holding.name)
            holding.ticker_source = "user"
        if key == "quantity" and value is not None:
            holding.quantity_source = "user"
        setattr(holding, key, value)
    if average_price_krw is not None:
        if not holding.quantity:
            raise HTTPException(status_code=400, detail="평단을 저장하려면 보유 수량이 필요합니다.")
        holding.principal = average_price_krw * holding.quantity
    if "target_price" in values and holding.target_price != previous_target:
        holding.target_alert_sent_at = None
    create_portfolio_snapshot(db, source="holding_update")
    db.commit()
    return {"ok": True, "holding_id": holding.id}


@app.get("/api/holdings/{holding_id}/report")
def holding_report(holding_id: int, viewer: Viewer = Depends(current_user), db: Session = Depends(get_db)) -> dict[str, object]:
    holding = db.get(Holding, holding_id)
    if not holding or not holding.is_active or (not viewer.is_admin and holding.owner != viewer.owner):
        raise HTTPException(status_code=404, detail="보유 종목을 찾을 수 없습니다.")
    report = build_holding_report(holding)
    report["news"] = search_company_news(holding)
    report["prompts"] = build_stock_prompts(holding, report)
    return report


@app.post("/api/ai/analyze", dependencies=[Depends(require_admin)])
def ai_analysis(payload: AnalysisPayload, db: Session = Depends(get_db)) -> dict[str, object]:
    return analyze_portfolio(db, payload.prompt)


@app.get("/api/ai/prompt", dependencies=[Depends(require_admin)])
def ai_prompt(db: Session = Depends(get_db)) -> dict[str, object]:
    return portfolio_prompt(db)


@app.get("/api/integrations/status", dependencies=[Depends(require_admin)])
def integration_status(probe: bool = False, db: Session = Depends(get_db)) -> dict[str, object]:
    return integrations(db, probe=probe)


@app.post("/api/telegram/test", dependencies=[Depends(require_admin)])
def telegram_test(db: Session = Depends(get_db)) -> dict[str, object]:
    message = "[모아] 텔레그램 목표가 알림 연결 테스트입니다."
    result = send_telegram_message(message)
    db.add(
        AlertEvent(
            alert_type="connection_test",
            message=message,
            success=bool(result["ok"]),
            response_message=str(result["message"]),
        )
    )
    db.commit()
    return result
