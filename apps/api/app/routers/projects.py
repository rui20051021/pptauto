from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db
from ..deps import get_current_user
from ..services.projects import ProjectService
from ..tasks import job_runner


router = APIRouter(prefix="/projects", tags=["projects"])


def _resolve_project_run(db: Session, project_id: str, run_id: str | None) -> models.GenerationRun | None:
    if run_id:
        run = db.scalar(
            select(models.GenerationRun).where(
                models.GenerationRun.id == run_id,
                models.GenerationRun.project_id == project_id,
            )
        )
        if run is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到对应的生成任务")
        return run

    return db.scalar(
        select(models.GenerationRun).where(models.GenerationRun.project_id == project_id).order_by(desc(models.GenerationRun.created_at))
    )


@router.get("", response_model=list[schemas.ProjectRead])
def list_projects(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[models.Project]:
    result = db.scalars(select(models.Project).where(models.Project.user_id == current_user.id).order_by(desc(models.Project.created_at)))
    return list(result)


@router.post("", response_model=schemas.ProjectRead, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: schemas.ProjectCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> models.Project:
    service = ProjectService(db)
    return service.create_project(current_user, payload.name, payload.description, payload.canvas_format, payload.template_mode)


@router.get("/{project_id}", response_model=schemas.ProjectDetail)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> schemas.ProjectDetail:
    service = ProjectService(db)
    project = service.ensure_project_owner(project_id, current_user.id)
    latest_run = db.scalar(
        select(models.GenerationRun).where(models.GenerationRun.project_id == project.id).order_by(desc(models.GenerationRun.created_at))
    )
    return schemas.ProjectDetail(
        **schemas.ProjectRead.model_validate(project).model_dump(),
        sources=[schemas.SourceRead.model_validate(source) for source in project.sources],
        latest_run=schemas.RunRead.model_validate(latest_run) if latest_run else None,
    )


@router.get("/{project_id}/runs", response_model=list[schemas.RunRead])
def list_project_runs(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[models.GenerationRun]:
    service = ProjectService(db)
    project = service.ensure_project_owner(project_id, current_user.id)
    result = db.scalars(
        select(models.GenerationRun)
        .where(models.GenerationRun.project_id == project.id)
        .order_by(desc(models.GenerationRun.created_at))
    )
    return list(result)


@router.get("/{project_id}/summary", response_model=schemas.ProjectSummary)
def get_project_summary(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> schemas.ProjectSummary:
    service = ProjectService(db)
    project = service.ensure_project_owner(project_id, current_user.id)

    latest_run = db.scalar(
        select(models.GenerationRun).where(models.GenerationRun.project_id == project.id).order_by(desc(models.GenerationRun.created_at))
    )
    source_count = db.scalar(select(func.count()).select_from(models.ProjectSource).where(models.ProjectSource.project_id == project.id)) or 0
    run_count = db.scalar(select(func.count()).select_from(models.GenerationRun).where(models.GenerationRun.project_id == project.id)) or 0
    if latest_run:
        slide_count = (
            db.scalar(
                select(func.count())
                .select_from(models.Slide)
                .where(models.Slide.project_id == project.id, models.Slide.run_id == latest_run.id)
            )
            or 0
        )
        artifact_count = (
            db.scalar(
                select(func.count())
                .select_from(models.Artifact)
                .where(
                    models.Artifact.project_id == project.id,
                    or_(models.Artifact.run_id == latest_run.id, models.Artifact.run_id.is_(None)),
                )
            )
            or 0
        )
        artifact_type_counts = {
            artifact_type: total
            for artifact_type, total in db.execute(
                select(models.Artifact.artifact_type, func.count())
                .where(
                    models.Artifact.project_id == project.id,
                    or_(models.Artifact.run_id == latest_run.id, models.Artifact.run_id.is_(None)),
                )
                .group_by(models.Artifact.artifact_type)
            ).all()
        }
    else:
        slide_count = 0
        artifact_count = 0
        artifact_type_counts = {}

    return schemas.ProjectSummary(
        project_id=project.id,
        source_count=source_count,
        slide_count=slide_count,
        artifact_count=artifact_count,
        run_count=run_count,
        artifact_type_counts=artifact_type_counts,
        latest_run=schemas.RunRead.model_validate(latest_run) if latest_run else None,
    )


@router.post("/{project_id}/sources", response_model=list[schemas.SourceRead])
def upload_sources(
    project_id: str,
    urls: list[str] = Form(default=[]),
    files: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[schemas.SourceRead]:
    service = ProjectService(db)
    project = service.ensure_project_owner(project_id, current_user.id)
    if not files and not urls:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请至少上传一个文件或填写一个链接")
    sources = service.save_uploaded_sources(project, files, urls)
    return [schemas.SourceRead.model_validate(item) for item in sources]


@router.post("/{project_id}/wizard", response_model=schemas.ProjectRead)
def save_wizard(
    project_id: str,
    payload: schemas.WizardSelections,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> models.Project:
    service = ProjectService(db)
    project = service.ensure_project_owner(project_id, current_user.id)
    project.wizard_config = payload.model_dump()
    project.canvas_format = payload.canvas_format
    project.template_mode = payload.template_mode
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.post("/{project_id}/generate", response_model=schemas.RunRead, status_code=status.HTTP_202_ACCEPTED)
def generate_project(
    project_id: str,
    payload: schemas.GenerateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> models.GenerationRun:
    service = ProjectService(db)
    project = service.ensure_project_owner(project_id, current_user.id)
    if not project.wizard_config:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请先完成并保存生成向导")
    additional_instructions = (project.wizard_config or {}).get("additional_instructions", "")
    if not project.sources and not str(additional_instructions).strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请先上传素材或填写生成要求")

    run = models.GenerationRun(
        project_id=project.id,
        status="queued",
        current_stage="queued",
        request_payload={"wizard": project.wizard_config, "rerun_from_stage": payload.rerun_from_stage},
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    job_runner.enqueue(run.id)
    return run


@router.get("/{project_id}/slides", response_model=list[schemas.SlideRead])
def list_slides(
    project_id: str,
    run_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[schemas.SlideRead]:
    service = ProjectService(db)
    project = service.ensure_project_owner(project_id, current_user.id)
    target_run = _resolve_project_run(db, project.id, run_id)
    if target_run is None:
        return []
    slides = list(
        db.scalars(
            select(models.Slide)
            .where(models.Slide.project_id == project.id, models.Slide.run_id == target_run.id)
            .order_by(models.Slide.page_number)
        )
    )
    return [
        schemas.SlideRead(
            id=slide.id,
            page_number=slide.page_number,
            title=slide.title,
            preview_url=f"/api/artifacts/{slide.preview_artifact_id}/download?inline=true" if slide.preview_artifact_id else "",
            notes_storage_key=slide.notes_storage_key,
        )
        for slide in slides
    ]


@router.get("/{project_id}/artifacts", response_model=list[schemas.ArtifactRead])
def list_artifacts(
    project_id: str,
    run_id: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> list[schemas.ArtifactRead]:
    service = ProjectService(db)
    project = service.ensure_project_owner(project_id, current_user.id)
    target_run = _resolve_project_run(db, project.id, run_id)
    if target_run is None:
        artifacts = list(
            db.scalars(
                select(models.Artifact)
                .where(models.Artifact.project_id == project.id, models.Artifact.run_id.is_(None))
                .order_by(desc(models.Artifact.created_at))
            )
        )
    else:
        artifacts = list(
            db.scalars(
                select(models.Artifact)
                .where(
                    models.Artifact.project_id == project.id,
                    or_(models.Artifact.run_id == target_run.id, models.Artifact.run_id.is_(None)),
                )
                .order_by(desc(models.Artifact.created_at))
            )
        )
    return [
        schemas.ArtifactRead(
            id=artifact.id,
            artifact_type=artifact.artifact_type,
            filename=artifact.filename,
            content_type=artifact.content_type,
            size_bytes=artifact.size_bytes,
            created_at=artifact.created_at,
            download_url=f"/api/artifacts/{artifact.id}/download",
        )
        for artifact in artifacts
    ]
