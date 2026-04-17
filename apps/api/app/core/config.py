from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


REPO_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="PPT_UI_",
        env_file=(
            REPO_ROOT / ".env",
            REPO_ROOT / "apps" / "api" / ".env",
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "PPT Master SaaS"
    api_prefix: str = "/api"
    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 60 * 24
    database_url: str = f"sqlite:///{(REPO_ROOT / 'var' / 'ppt_master_ui.db').as_posix()}"
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8080",
            "http://127.0.0.1:8080",
        ]
    )
    storage_backend: str = "local"
    local_storage_root: Path = REPO_ROOT / "var" / "storage"
    workspace_root: Path = REPO_ROOT / "var" / "workspaces"
    temp_upload_root: Path = REPO_ROOT / "var" / "uploads"
    s3_bucket: str | None = None
    s3_region: str | None = None
    s3_endpoint_url: str | None = None
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    model_provider: str = "mock"
    model_name: str = "gpt-4.1-mini"
    model_api_key: str | None = None
    model_base_url: str | None = None
    model_runtime_config_path: Path = REPO_ROOT / "var" / "model_runtime_config.json"
    job_inline: bool = False
    log_source_excerpt_chars: int = 6000


settings = Settings()
