"""Administrator-only automation controls and explicit preview/send flow."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy.orm import Session

from .auth import require_admin
from .automations import alert_history, automation_state, create_preview, save_setting, send_preview
from .database import get_db
from .price_alerts import price_rules, save_price_rules
from .research_alerts import keywords, save_keywords

router = APIRouter(prefix="/api/automations", dependencies=[Depends(require_admin)])


class SettingPayload(BaseModel):
    enabled: bool
    times: str = Field(default="", max_length=150)


class PreviewPayload(BaseModel):
    kind: str = Field(max_length=40)
    holding_id: int | None = Field(default=None, gt=0)
    app_url: HttpUrl | None = None


class PriceRulesPayload(BaseModel):
    stop_loss: float = Field(default=0, ge=0, allow_inf_nan=False)
    buy_below: float = Field(default=0, ge=0, allow_inf_nan=False)
    change_percent: float = Field(default=0, ge=0, le=1000, allow_inf_nan=False)
    rearm: bool = False


class ResearchPayload(BaseModel):
    keywords: str = Field(default="", max_length=300)


@router.get("/research/settings")
def get_research_settings(db: Session = Depends(get_db)) -> dict:
    return {"keywords": keywords(db)}


@router.put("/research/settings")
def put_research_settings(payload: ResearchPayload, db: Session = Depends(get_db)) -> dict:
    return save_keywords(db, payload.keywords)


@router.get("/holdings/{holding_id}/price-rules")
def get_price_rules(holding_id: int, db: Session = Depends(get_db)) -> dict:
    try:
        return price_rules(db, holding_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/holdings/{holding_id}/price-rules")
def put_price_rules(holding_id: int, payload: PriceRulesPayload, db: Session = Depends(get_db)) -> dict:
    try:
        return save_price_rules(db, holding_id, payload.model_dump(exclude={"rearm"}), payload.rearm)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("")
def get_automations(db: Session = Depends(get_db)) -> dict:
    return automation_state(db)


@router.put("/{key}/settings")
def update_settings(key: str, payload: SettingPayload, db: Session = Depends(get_db)) -> dict:
    try:
        return save_setting(db, key, payload.enabled, payload.times)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/history")
def history(db: Session = Depends(get_db)) -> dict:
    return alert_history(db)


@router.post("/previews")
def preview(payload: PreviewPayload, db: Session = Depends(get_db)) -> dict:
    try:
        return create_preview(db, payload.kind, payload.holding_id, str(payload.app_url) if payload.app_url else "")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/previews/{preview_id}/send")
def send(preview_id: str, db: Session = Depends(get_db)) -> dict:
    try:
        return send_preview(db, preview_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
