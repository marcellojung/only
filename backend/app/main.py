"""FastAPI entry point for the family asset backend."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .ai import analyze_portfolio
from .config import settings
from .database import engine, get_db, init_db
from .history import create_portfolio_snapshot
from .importer import import_upload
from .market import refresh_exchange_rate, refresh_market
from .models import AlertEvent, Holding
from .state import build_state, integrations
from .telegram import send_telegram_message


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="온리 자산 API", version="1.0.0", lifespan=lifespan)
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


class AnalysisPayload(BaseModel):
    prompt: str = Field(default="", max_length=4000)


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


@app.patch("/api/holdings/{holding_id}", dependencies=[Depends(authorize)])
def update_holding(holding_id: int, payload: HoldingPatch, db: Session = Depends(get_db)) -> dict[str, object]:
    holding = db.get(Holding, holding_id)
    if not holding or not holding.is_active:
        raise HTTPException(status_code=404, detail="보유 종목을 찾을 수 없습니다.")
    values = payload.model_dump(exclude_unset=True)
    previous_target = holding.target_price
    for key, value in values.items():
        if key == "ticker" and isinstance(value, str):
            value = value.strip().upper()
            holding.ticker_source = "user"
        if key == "quantity" and value is not None:
            holding.quantity_source = "user"
        setattr(holding, key, value)
    if "target_price" in values and holding.target_price != previous_target:
        holding.target_alert_sent_at = None
    create_portfolio_snapshot(db, source="holding_update")
    db.commit()
    return {"ok": True, "holding_id": holding.id}


@app.post("/api/ai/analyze", dependencies=[Depends(authorize)])
def ai_analysis(payload: AnalysisPayload, db: Session = Depends(get_db)) -> dict[str, object]:
    return analyze_portfolio(db, payload.prompt)


@app.get("/api/integrations/status", dependencies=[Depends(authorize)])
def integration_status(probe: bool = False, db: Session = Depends(get_db)) -> dict[str, object]:
    return integrations(db, probe=probe)


@app.post("/api/telegram/test", dependencies=[Depends(authorize)])
def telegram_test(db: Session = Depends(get_db)) -> dict[str, object]:
    message = "[온리] 텔레그램 목표가 알림 연결 테스트입니다."
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
