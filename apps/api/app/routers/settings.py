from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from .. import models, schemas
from ..deps import get_current_user
from ..services.model_integration import (
    model_integration_payload,
    resolve_model_integration,
    test_model_integration,
    update_model_integration,
)


router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/model", response_model=schemas.ModelIntegrationRead)
def get_model_integration(_: models.User = Depends(get_current_user)) -> schemas.ModelIntegrationRead:
    resolved = resolve_model_integration()
    return schemas.ModelIntegrationRead(**model_integration_payload(resolved))


@router.put("/model", response_model=schemas.ModelIntegrationRead)
def save_model_integration(
    payload: schemas.ModelIntegrationUpdate,
    _: models.User = Depends(get_current_user),
) -> schemas.ModelIntegrationRead:
    resolved = update_model_integration(
        provider=payload.provider,
        model_name=payload.model_name,
        base_url=payload.base_url,
        api_key=payload.api_key,
        clear_api_key=payload.clear_api_key,
    )
    return schemas.ModelIntegrationRead(**model_integration_payload(resolved))


@router.post("/model/test", response_model=schemas.ModelIntegrationTestRead)
def verify_model_integration(_: models.User = Depends(get_current_user)) -> schemas.ModelIntegrationTestRead:
    try:
        resolved, reply = test_model_integration()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - external network
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"连接外部 AI 失败：{exc}") from exc

    return schemas.ModelIntegrationTestRead(
        success=True,
        requested_provider=resolved.requested_provider,
        effective_provider=resolved.effective_provider,
        model_name=resolved.model_name,
        base_url=resolved.base_url,
        wire_api=resolved.wire_api,
        reply=reply,
    )
