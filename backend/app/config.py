"""Runtime configuration loaded from the project env files."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[2]


def _load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value.replace("\\n", "\n")


_load_env(PROJECT_DIR / ".env.local")
_load_env(PROJECT_DIR / ".env")
_load_env(PROJECT_DIR / "backend" / ".env")


def _data_dir() -> Path:
    raw = os.getenv("APP_DATA_DIR", "").strip()
    if not raw or (os.name != "nt" and ":\\" in raw):
        return PROJECT_DIR / "data"
    return Path(raw).expanduser()


@dataclass(frozen=True)
class Settings:
    project_dir: Path = PROJECT_DIR
    data_dir: Path = _data_dir()
    access_key: str = os.getenv("APP_ACCESS_KEY", "")
    backend_url: str = os.getenv("BACKEND_PUBLIC_URL", "http://127.0.0.1:8000")
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-5.4-mini")
    opendart_api_key: str = os.getenv("OPENDART_API_KEY", "")
    naver_api_hub_client_id: str = os.getenv("NAVER_API_HUB_CLIENT_ID", "")
    naver_api_hub_client_secret: str = os.getenv("NAVER_API_HUB_CLIENT_SECRET", "")
    naver_client_id: str = os.getenv("NAVER_CLIENT_ID", "")
    naver_client_secret: str = os.getenv("NAVER_CLIENT_SECRET", "")
    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    telegram_chat_id: str = os.getenv("TELEGRAM_CHAT_ID", "")
    google_calendar_id: str = os.getenv("GOOGLE_CALENDAR_ID", "")
    google_service_account_email: str = os.getenv("GOOGLE_SERVICE_ACCOUNT_EMAIL", "")

    @property
    def database_url(self) -> str:
        explicit = os.getenv("DATABASE_URL", "").strip()
        if explicit:
            return explicit
        return f"sqlite:///{(self.data_dir / 'family-assets.db').as_posix()}"


settings = Settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)
