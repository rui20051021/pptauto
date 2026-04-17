from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserRead(BaseModel):
    id: str
    email: EmailStr
    full_name: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    canvas_format: str = "ppt169"
    template_mode: Literal["free", "template"] = "free"


class WizardSelections(BaseModel):
    canvas_format: str = "ppt169"
    page_count: int = Field(ge=3, le=50)
    target_audience: str
    use_case: str
    style_objective: Literal["general", "consulting", "top_consulting"] = "general"
    color_scheme: list[str] = Field(default_factory=list, min_length=0, max_length=6)
    template_mode: Literal["free", "template"] = "free"
    template_name: str | None = None
    icon_strategy: Literal["builtin", "emoji", "ai", "custom"] = "builtin"
    icon_library: Literal["chunk", "tabler-filled", "tabler-outline"] = "chunk"
    typography_title_font: str = "Microsoft YaHei"
    typography_body_font: str = "Calibri"
    body_font_size: int = Field(default=24, ge=14, le=32)
    image_strategy: Literal["none", "existing", "ai", "placeholder"] = "none"
    theme_mode: Literal["light", "dark"] = "light"
    accent_tone: str = "professional"
    additional_instructions: str | None = None


class ProjectRead(BaseModel):
    id: str
    name: str
    slug: str
    description: str | None
    canvas_format: str
    template_mode: str
    wizard_config: dict | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SourceRead(BaseModel):
    id: str
    source_type: str
    original_name: str
    content_type: str | None
    size_bytes: int | None
    source_url: str | None
    storage_key: str
    normalized_markdown_key: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class RunRead(BaseModel):
    id: str
    project_id: str
    status: str
    current_stage: str
    error_message: str | None
    request_payload: dict | None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class RunLogRead(BaseModel):
    id: int
    stage: str
    level: str
    message: str
    details: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SlideRead(BaseModel):
    id: str
    page_number: int
    title: str
    preview_url: str
    notes_storage_key: str | None


class ArtifactRead(BaseModel):
    id: str
    artifact_type: str
    filename: str
    content_type: str
    size_bytes: int | None
    created_at: datetime
    download_url: str


class ProjectDetail(ProjectRead):
    sources: list[SourceRead]
    latest_run: RunRead | None = None


class ProjectSummary(BaseModel):
    project_id: str
    source_count: int
    slide_count: int
    artifact_count: int
    run_count: int
    artifact_type_counts: dict[str, int] = Field(default_factory=dict)
    latest_run: RunRead | None = None


class GenerateRequest(BaseModel):
    rerun_from_stage: str | None = None


class ModelIntegrationRead(BaseModel):
    requested_provider: str
    effective_provider: str
    model_name: str
    base_url: str | None
    wire_api: str | None = None
    configured: bool
    using_external_ai: bool
    api_key_masked: str | None
    source: str
    warning_code: str | None = None


class ModelIntegrationUpdate(BaseModel):
    provider: Literal["mock", "openai"] | None = None
    model_name: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    clear_api_key: bool = False


class ModelIntegrationTestRead(BaseModel):
    success: bool
    requested_provider: str
    effective_provider: str
    model_name: str
    base_url: str | None
    wire_api: str | None = None
    reply: str
