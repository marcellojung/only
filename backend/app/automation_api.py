"""Administrator-only automation controls and explicit preview/send flow."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .auth import require_admin
from .automations import alert_history, automation_state, create_preview, save_setting, send_preview
from .database import get_db

router = APIRouter(prefix="/api/automations", dependencies=[Depends(require_admin)])


class SettingPayload(BaseModel):
    enabled: bool
    times: str = Field(default="", max_length=150)


class PreviewPayload(BaseModel):
    kind: str = Field(max_length=40)
    holding_id: int | None = Field(default=None, gt=0)


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
        return create_preview(db, payload.kind, payload.holding_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/previews/{preview_id}/send")
def send(preview_id: str, db: Session = Depends(get_db)) -> dict:
    try:
        return send_preview(db, preview_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
