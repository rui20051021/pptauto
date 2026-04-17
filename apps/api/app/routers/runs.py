from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db
from ..deps import get_current_user


router = APIRouter(prefix="/runs", tags=["runs"])


@router.get("/{run_id}", response_model=schemas.RunRead)
def get_run(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> models.GenerationRun:
    run = db.get(models.GenerationRun, run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到对应的任务")
    project = db.get(models.Project, run.project_id)
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到对应的任务")
    return run


@router.get("/{run_id}/logs", response_model=list[schemas.RunLogRead])
def get_run_logs(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[models.RunLog]:
    run = db.get(models.GenerationRun, run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到对应的任务")
    project = db.get(models.Project, run.project_id)
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到对应的任务")
    return list(db.scalars(select(models.RunLog).where(models.RunLog.run_id == run_id).order_by(models.RunLog.id)))
