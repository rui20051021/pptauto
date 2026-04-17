from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..core.config import settings
from .ppt_master_bridge import PPTMasterBridge
from .storage import get_storage


def slugify(value: str) -> str:
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug or "project"


class ProjectService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.storage = get_storage()
        self.bridge = PPTMasterBridge()
        settings.workspace_root.mkdir(parents=True, exist_ok=True)
        settings.temp_upload_root.mkdir(parents=True, exist_ok=True)

    def create_project(self, user: models.User, name: str, description: str | None, canvas_format: str, template_mode: str) -> models.Project:
        slug = slugify(name)
        exists = self.db.scalar(select(models.Project).where(models.Project.user_id == user.id, models.Project.slug == slug))
        if exists:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="同名项目已存在，请更换项目名称")

        owner_dir = settings.workspace_root / user.id
        workspace = self.bridge.create_project_workspace(slug, canvas_format, owner_dir)
        project = models.Project(
            user_id=user.id,
            name=name,
            slug=slug,
            description=description,
            canvas_format=canvas_format,
            template_mode=template_mode,
            workspace_path=str(workspace),
        )
        self.db.add(project)
        self.db.commit()
        self.db.refresh(project)
        return project

    def ensure_project_owner(self, project_id: str, user_id: str) -> models.Project:
        project = self.db.get(models.Project, project_id)
        if not project or project.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="找不到对应的项目")
        return project

    def save_uploaded_sources(self, project: models.Project, files: list[UploadFile], urls: list[str]) -> list[models.ProjectSource]:
        created: list[models.ProjectSource] = []
        workspace = Path(project.workspace_path)
        temp_dir = settings.temp_upload_root / project.id
        temp_dir.mkdir(parents=True, exist_ok=True)

        for upload in files:
            temp_path = temp_dir / upload.filename
            with temp_path.open("wb") as handle:
                shutil.copyfileobj(upload.file, handle)

            raw_key = f"projects/{project.id}/sources/raw/{upload.filename}"
            stored = self.storage.put_file(temp_path, raw_key, upload.content_type or "application/octet-stream")
            summary = self.bridge.import_sources(workspace, [str(temp_path)], move=True)
            normalized = summary["markdown"][0] if summary["markdown"] else None
            source = models.ProjectSource(
                project_id=project.id,
                source_type="file",
                original_name=upload.filename,
                content_type=upload.content_type,
                size_bytes=stored.size_bytes,
                storage_key=stored.key,
                normalized_markdown_key=self._sync_normalized(project, normalized),
            )
            self.db.add(source)
            self.db.commit()
            self.db.refresh(source)
            created.append(source)

        for url in urls:
            summary = self.bridge.import_sources(workspace, [url], move=True)
            normalized = summary["markdown"][0] if summary["markdown"] else None
            archive_path = summary["archived"][0] if summary["archived"] else None
            key = ""
            if archive_path:
                archive = Path(archive_path)
                key = f"projects/{project.id}/sources/raw/{archive.name}"
                self.storage.put_file(archive, key, "text/plain")
            source = models.ProjectSource(
                project_id=project.id,
                source_type="url",
                original_name=url,
                content_type="text/uri-list",
                size_bytes=None,
                storage_key=key,
                normalized_markdown_key=self._sync_normalized(project, normalized),
                source_url=url,
            )
            self.db.add(source)
            self.db.commit()
            self.db.refresh(source)
            created.append(source)
        return created

    def _sync_normalized(self, project: models.Project, normalized_path: str | None) -> str | None:
        if not normalized_path:
            return None
        path = Path(normalized_path)
        key = f"projects/{project.id}/sources/normalized/{path.name}"
        self.storage.put_file(path, key, "text/markdown")
        return key
