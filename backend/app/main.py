"""FastAPI entry point for the family asset backend."""

from __future__ import annotations

from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .ai import analyze_portfolio, portfolio_prompt
from .config import settings
from .database import engine, get_db, init_db
from .history import create_portfolio_snapshot
from .importer import import_upload
from .market import normalize_user_symbol, refresh_exchange_rate, refresh_holding_quote, refresh_market
from .models import AlertEvent, Debt, Holding
from .news import search_company_news
from .opendart import build_holding_report
from .prompts import build_stock_prompts
from .scheduler import start_auto_refresh, stop_auto_refresh
from .state import build_state, integrations
from .telegram import send_telegram_message


@asynccontextmanager
async def lifespan(_app: FastAPI):
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


def authorize(x_app_key: str = Header(default="")) -> None:
    if settings.access_key and x_app_key != settings.access_key:
        raise HTTPException(status_code=401, detail="unauthorized")


class HoldingPatch(BaseModel):
    ticker: str | None = Field(default=None, max_length=40)
    quantity: float | None = Field(default=None, ge=0)
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


@app.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, object]:
    db.execute(text("SELECT 1"))
    return {"ok": True, "database": "sqlite", "version": app.version}


@app.get("/api/state", dependencies=[Depends(authorize)])
def state(db: Session = Depends(get_db)) -> dict[str, object]:
    return build_state(db)


@app.post("/api/import", dependencies=[Depends(authorize)])
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


@app.post("/api/market/refresh", dependencies=[Depends(authorize)])
def market_refresh(db: Session = Depends(get_db)) -> dict[str, object]:
    try:
        return refresh_market(db)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail=f"시세 갱신 실패: {type(exc).__name__}") from exc


@app.post("/api/exchange-rate/refresh", dependencies=[Depends(authorize)])
def exchange_refresh(db: Session = Depends(get_db)) -> dict[str, object]:
    try:
        record = refresh_exchange_rate(db)
        db.commit()
        return {"pair": record.pair, "rate": record.rate, "source": record.source, "updated_at": record.captured_at.isoformat()}
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail=f"환율 갱신 실패: {type(exc).__name__}") from exc


@app.post("/api/holdings", dependencies=[Depends(authorize)])
def create_holding(payload: HoldingCreate, db: Session = Depends(get_db)) -> dict[str, object]:
    supported = {"주식", "ETF", "펀드", "코인", "암호화폐"}
    if payload.asset_type not in supported:
        raise HTTPException(status_code=400, detail="지원하지 않는 자산 유형입니다.")
    symbol = normalize_user_symbol(payload.asset_type, payload.ticker, payload.name)
    if payload.asset_type in {"코인", "암호화폐"} and not symbol:
        raise HTTPException(status_code=400, detail="코인 심볼을 입력해 주세요.")
    holding = Holding(
        owner=payload.owner.strip(),
        source_key=f"manual:{uuid4().hex}",
        asset_type="코인" if payload.asset_type == "암호화폐" else payload.asset_type,
        broker=payload.broker.strip(),
        name=payload.name.strip(),
        ticker=symbol,
        ticker_source="user" if symbol else "",
        currency="KRW",
        principal=payload.principal,
        market_value=payload.principal,
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
    return {"ok": True, "holding_id": holding.id, "quote_updated": quote_updated, "ticker": holding.ticker}


@app.post("/api/debts", dependencies=[Depends(authorize)])
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


@app.patch("/api/holdings/{holding_id}", dependencies=[Depends(authorize)])
def update_holding(holding_id: int, payload: HoldingPatch, db: Session = Depends(get_db)) -> dict[str, object]:
    holding = db.get(Holding, holding_id)
    if not holding or not holding.is_active:
        raise HTTPException(status_code=404, detail="보유 종목을 찾을 수 없습니다.")
    values = payload.model_dump(exclude_unset=True)
    previous_target = holding.target_price
    for key, value in values.items():
        if key == "ticker" and isinstance(value, str):
            value = normalize_user_symbol(holding.asset_type, value, holding.name)
            holding.ticker_source = "user"
        if key == "quantity" and value is not None:
            holding.quantity_source = "user"
        setattr(holding, key, value)
    if "target_price" in values and holding.target_price != previous_target:
        holding.target_alert_sent_at = None
    create_portfolio_snapshot(db, source="holding_update")
    db.commit()
    return {"ok": True, "holding_id": holding.id}


@app.get("/api/holdings/{holding_id}/report", dependencies=[Depends(authorize)])
def holding_report(holding_id: int, db: Session = Depends(get_db)) -> dict[str, object]:
    holding = db.get(Holding, holding_id)
    if not holding or not holding.is_active:
        raise HTTPException(status_code=404, detail="보유 종목을 찾을 수 없습니다.")
    report = build_holding_report(holding)
    report["news"] = search_company_news(holding)
    report["prompts"] = build_stock_prompts(holding, report)
    return report


@app.post("/api/ai/analyze", dependencies=[Depends(authorize)])
def ai_analysis(payload: AnalysisPayload, db: Session = Depends(get_db)) -> dict[str, object]:
    return analyze_portfolio(db, payload.prompt)


@app.get("/api/ai/prompt", dependencies=[Depends(authorize)])
def ai_prompt(db: Session = Depends(get_db)) -> dict[str, object]:
    return portfolio_prompt(db)


@app.get("/api/integrations/status", dependencies=[Depends(authorize)])
def integration_status(probe: bool = False, db: Session = Depends(get_db)) -> dict[str, object]:
    return integrations(db, probe=probe)


@app.post("/api/telegram/test", dependencies=[Depends(authorize)])
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
