"""Small signed-session authentication for the private family application."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import threading
import time
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException

from .config import settings


class LoginRateLimiter:
    def __init__(self, maximum: int = 8, window_seconds: int = 15 * 60):
        self.maximum = maximum
        self.window_seconds = window_seconds
        self._attempts: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def retry_after(self, client_id: str, now: float | None = None) -> int:
        current = time.monotonic() if now is None else now
        with self._lock:
            attempts = [stamp for stamp in self._attempts.get(client_id, []) if current - stamp < self.window_seconds]
            self._attempts[client_id] = attempts
            if len(attempts) < self.maximum:
                return 0
            return max(1, int(self.window_seconds - (current - attempts[0])))

    def record_failure(self, client_id: str, now: float | None = None) -> None:
        current = time.monotonic() if now is None else now
        with self._lock:
            attempts = [stamp for stamp in self._attempts.get(client_id, []) if current - stamp < self.window_seconds]
            attempts.append(current)
            self._attempts[client_id] = attempts

    def record_success(self, client_id: str) -> None:
        with self._lock:
            self._attempts.pop(client_id, None)


login_rate_limiter = LoginRateLimiter()


@dataclass(frozen=True)
class Viewer:
    owner: str
    role: str

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def family_accounts() -> dict[str, tuple[str, str]]:
    accounts = {"성근": ("admin", settings.admin_password)}
    if settings.jiwoo_guest_password:
        accounts["지우"] = ("guest", settings.jiwoo_guest_password)
    if settings.yoonjae_guest_password:
        accounts["윤재"] = ("guest", settings.yoonjae_guest_password)
    return accounts


def issue_token(viewer: Viewer, expires_in: int = 60 * 60 * 24 * 7) -> str:
    payload = _encode(json.dumps({"sub": viewer.owner, "role": viewer.role, "exp": int(time.time()) + expires_in}, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    signature = _encode(hmac.new(settings.auth_secret.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest())
    return f"{payload}.{signature}"


def verify_token(token: str) -> Viewer | None:
    try:
        payload, signature = token.split(".", 1)
        expected = _encode(hmac.new(settings.auth_secret.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return None
        data = json.loads(_decode(payload))
        if int(data["exp"]) < int(time.time()) or data["role"] not in {"admin", "guest"}:
            return None
        return Viewer(owner=str(data["sub"]), role=str(data["role"]))
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


def authenticate(owner: str, password: str) -> Viewer | None:
    account = family_accounts().get(owner)
    if not account or not account[1] or not hmac.compare_digest(password, account[1]):
        return None
    return Viewer(owner=owner, role=account[0])


def current_user(x_app_key: str = Header(default="")) -> Viewer:
    viewer = verify_token(x_app_key)
    if viewer:
        return viewer
    # Existing installations can keep using APP_ACCESS_KEY during migration.
    if settings.public_access_mode != "funnel" and settings.access_key and hmac.compare_digest(x_app_key, settings.access_key):
        return Viewer(owner="성근", role="admin")
    if settings.public_access_mode != "funnel" and not any((settings.admin_password, settings.access_key, settings.jiwoo_guest_password, settings.yoonjae_guest_password)):
        return Viewer(owner="성근", role="admin")
    raise HTTPException(status_code=401, detail="unauthorized")


def require_admin(viewer: Viewer = Depends(current_user)) -> Viewer:
    if not viewer.is_admin:
        raise HTTPException(status_code=403, detail="admin only")
    return viewer
