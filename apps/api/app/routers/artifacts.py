from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..deps import get_current_user_for_artifact
from ..services.storage import get_storage


router = APIRouter(prefix="/artifacts", tags=["artifacts"])


def _content_disposition(filename: str, inline: bool) -> str:
    disposition = "inline" if inline else "attachment"
    safe_ascii = "".join(char if ord(char) < 128 else "_" for char in filename) or "download.bin"
    encoded = quote(filename, safe="")
    return f"{disposition}; filename=\"{safe_ascii}\"; filename*=UTF-8''{encoded}"


@router.get("/{artifact_id}/download")
def download_artifact(
    artifact_id: str,
    inline: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user_for_artifact),
):
    artifact = db.get(models.Artifact, artifact_id)
    if not artifact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到对应的产物文件")
    project = db.get(models.Project, artifact.project_id)
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到对应的产物文件")
    storage = get_storage()
    content = storage.read_bytes(artifact.storage_key)
    headers = {"Content-Disposition": _content_disposition(artifact.filename, inline)}
    return Response(content=content, media_type=artifact.content_type, headers=headers)
