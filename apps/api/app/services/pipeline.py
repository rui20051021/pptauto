from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .. import models
from .models_gateway import ModelGateway
from .ppt_master_bridge import PPTMasterBridge
from .storage import get_storage


STAGES = {
    "source_ingest": "source_ingest",
    "design_spec": "design_spec",
    "image_generation": "image_generation",
    "slide_svg_generation": "slide_svg_generation",
    "svg_finalize": "svg_finalize",
    "pptx_export": "pptx_export",
    "completed": "completed",
}


class RunLogger:
    def __init__(self, db: Session, run: models.GenerationRun) -> None:
        self.db = db
        self.run = run

    def set_stage(self, stage: str) -> None:
        self.run.current_stage = stage
        self.run.status = "running"
        self.db.add(self.run)
        self.db.commit()

    def log(self, stage: str, message: str, level: str = "info", details: dict | None = None) -> None:
        self.db.add(models.RunLog(run_id=self.run.id, stage=stage, level=level, message=message, details=details))
        self.db.commit()


class GenerationPipeline:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.bridge = PPTMasterBridge()
        self.storage = get_storage()
        self.gateway = ModelGateway()

    def run(self, run_id: str) -> None:
        run = self.db.get(models.GenerationRun, run_id)
        if not run:
            raise RuntimeError(f"找不到任务：{run_id}")
        project = self.db.get(models.Project, run.project_id)
        if not project:
            raise RuntimeError(f"找不到项目：{run.project_id}")

        logger = RunLogger(self.db, run)
        try:
            self._stage_source_ingest(project, logger)
            plan = self._stage_design_spec(project, run, logger)
            self._stage_image_generation(project, run, logger)
            self._stage_slide_generation(project, run, logger, plan)
            self._stage_finalize(project, logger)
            self._stage_export(project, run, logger)
            run.status = "completed"
            run.current_stage = STAGES["completed"]
            run.completed_at = datetime.now(timezone.utc)
            self.db.add(run)
            self.db.commit()
            logger.log(STAGES["completed"], "生成完成")
        except Exception as exc:
            run.status = "failed"
            run.error_message = str(exc)
            self.db.add(run)
            self.db.commit()
            logger.log(run.current_stage or "unknown", f"生成失败：{exc}", level="error")
            raise

    def _workspace(self, project: models.Project) -> Path:
        return Path(project.workspace_path)

    def _stage_source_ingest(self, project: models.Project, logger: RunLogger) -> None:
        logger.set_stage(STAGES["source_ingest"])
        if project.sources:
            logger.log(STAGES["source_ingest"], f"已校验 {len(project.sources)} 份素材")
            return

        additional_instructions = ((project.wizard_config or {}).get("additional_instructions") or "").strip()
        if additional_instructions:
            logger.log(STAGES["source_ingest"], "未上传素材，将仅根据文字要求生成")
            return

        raise RuntimeError("项目下没有任何素材，也没有可用的文字生成要求")

    def _stage_design_spec(self, project: models.Project, run: models.GenerationRun, logger: RunLogger):
        logger.set_stage(STAGES["design_spec"])
        wizard = project.wizard_config
        if not wizard:
            raise RuntimeError("缺少向导配置")
        source_text = self._collect_markdown(project)
        plan = self.gateway.build_design_plan(project.name, wizard, source_text)
        spec_path = self._workspace(project) / "design_spec.md"
        spec_path.write_text(self.gateway.render_design_spec(project.name, wizard, plan), encoding="utf-8")
        self._upsert_artifact(project, run, "design_spec", spec_path, f"projects/{project.id}/runs/{run.id}/design_spec.md")
        planner = dict(self.gateway.last_build_details)
        run.request_payload = {"wizard": wizard, "plan": plan.model_dump(), "planner": planner}
        self.db.add(run)
        self.db.commit()
        planner_label = planner.get("planner_label", "规划器")
        logger.log(STAGES["design_spec"], f"已生成设计规范，共规划 {len(plan.slides)} 页（{planner_label}）", details=planner)
        return plan

    def _stage_image_generation(self, project: models.Project, run: models.GenerationRun, logger: RunLogger) -> None:
        logger.set_stage(STAGES["image_generation"])
        images = self.gateway.maybe_generate_images(project.wizard_config or {}, self._workspace(project))
        for image in images:
            self._upsert_artifact(project, run, "generated_image", image.path, f"projects/{project.id}/runs/{run.id}/images/{image.filename}")
        logger.log(STAGES["image_generation"], f"已生成 {len(images)} 张图片资源")

    def _stage_slide_generation(self, project: models.Project, run: models.GenerationRun, logger: RunLogger, plan) -> None:
        logger.set_stage(STAGES["slide_svg_generation"])
        workspace = self._workspace(project)
        svg_output = workspace / "svg_output"
        notes_dir = workspace / "notes"
        for existing in svg_output.glob("*.svg"):
            existing.unlink()
        for existing in notes_dir.glob("slide_*.md"):
            existing.unlink()

        self.db.execute(delete(models.Slide).where(models.Slide.run_id == run.id))
        self.db.commit()

        total_notes = []
        for slide in plan.slides:
            slug = self._slug(slide.title) or f"slide_{slide.page_number:02d}"
            svg_name = f"slide_{slide.page_number:02d}_{slug}.svg"
            notes_name = f"slide_{slide.page_number:02d}_{slug}.md"
            (svg_output / svg_name).write_text(self.gateway.generate_svg_for_slide(project.wizard_config or {}, plan, slide), encoding="utf-8")
            (notes_dir / notes_name).write_text(slide.speaker_notes, encoding="utf-8")
            total_notes.append(f"# {slide.title}\n\n{slide.speaker_notes}\n")

        (notes_dir / "total.md").write_text("\n".join(total_notes), encoding="utf-8")
        logger.log(STAGES["slide_svg_generation"], f"已生成 {len(plan.slides)} 页 SVG 页面")

    def _stage_finalize(self, project: models.Project, logger: RunLogger) -> None:
        logger.set_stage(STAGES["svg_finalize"])
        self.bridge.finalize(self._workspace(project))
        logger.log(STAGES["svg_finalize"], "已完成 SVG 成品整理")

    def _stage_export(self, project: models.Project, run: models.GenerationRun, logger: RunLogger) -> None:
        logger.set_stage(STAGES["pptx_export"])
        workspace = self._workspace(project)
        exports = self.bridge.export_pptx(workspace)
        slides = sorted((workspace / "svg_final").glob("*.svg"))
        notes_dir = workspace / "notes"
        planned_titles = {
            int(item.get("page_number", 0)): str(item.get("title", "")).strip()
            for item in (((run.request_payload or {}).get("plan") or {}).get("slides") or [])
        }

        for svg in slides:
            stored = self._upsert_artifact(project, run, "slide_svg", svg, f"projects/{project.id}/runs/{run.id}/slides/{svg.name}")
            page = self._extract_page_number(svg.name)
            note_path = self._find_note_path(notes_dir, page)
            note_key = None
            if note_path:
                note_artifact = self._upsert_artifact(project, run, "slide_note", note_path, f"projects/{project.id}/runs/{run.id}/notes/{note_path.name}")
                note_key = note_artifact.storage_key
            self.db.add(
                models.Slide(
                    project_id=project.id,
                    run_id=run.id,
                    page_number=page,
                    title=planned_titles.get(page) or svg.stem,
                    svg_storage_key=stored.storage_key,
                    notes_storage_key=note_key,
                    preview_artifact_id=stored.id,
                )
            )
        self.db.commit()

        total_notes = notes_dir / "total.md"
        if total_notes.exists():
            self._upsert_artifact(project, run, "notes", total_notes, f"projects/{project.id}/runs/{run.id}/notes/total.md")
        for export in exports:
            artifact_type = "pptx_snapshot" if export.stem.endswith("_svg") else "pptx"
            self._upsert_artifact(project, run, artifact_type, export, f"projects/{project.id}/runs/{run.id}/exports/{export.name}")
        logger.log(STAGES["pptx_export"], f"已导出 {len(exports)} 个 PPT 相关文件")

    def _collect_markdown(self, project: models.Project) -> str:
        parts: list[str] = []
        workspace = self._workspace(project)
        for source in sorted((workspace / "sources").glob("*.md")):
            parts.append(source.read_text(encoding="utf-8", errors="replace"))
        if not parts:
            for source in project.sources:
                if source.source_url:
                    parts.append(f"素材链接：{source.source_url}")
        additional_instructions = ((project.wizard_config or {}).get("additional_instructions") or "").strip()
        if additional_instructions:
            parts.append(f"文字生成要求：\n{additional_instructions}")
        return "\n\n".join(parts)

    def _upsert_artifact(self, project: models.Project, run: models.GenerationRun, artifact_type: str, source_path: Path, relative_key: str) -> models.Artifact:
        stored = self.storage.put_file(source_path, relative_key)
        artifact = self.db.scalar(
            select(models.Artifact).where(
                models.Artifact.run_id == run.id,
                models.Artifact.project_id == project.id,
                models.Artifact.artifact_type == artifact_type,
                models.Artifact.filename == source_path.name,
            )
        )
        if artifact is None:
            artifact = models.Artifact(
                project_id=project.id,
                run_id=run.id,
                artifact_type=artifact_type,
                filename=source_path.name,
                storage_key=stored.key,
                content_type=stored.content_type,
                size_bytes=stored.size_bytes,
            )
        else:
            artifact.storage_key = stored.key
            artifact.content_type = stored.content_type
            artifact.size_bytes = stored.size_bytes
        self.db.add(artifact)
        self.db.commit()
        self.db.refresh(artifact)
        return artifact

    @staticmethod
    def _extract_page_number(filename: str) -> int:
        digits = "".join(ch for ch in filename if ch.isdigit())
        return int(digits[:2] or "1")

    @staticmethod
    def _find_note_path(notes_dir: Path, page_number: int) -> Path | None:
        prefix = f"slide_{page_number:02d}_"
        for candidate in notes_dir.glob(f"{prefix}*.md"):
            return candidate
        return None

    @staticmethod
    def _slug(value: str) -> str:
        slug = "".join(ch.lower() if ch.isalnum() else "_" for ch in value)
        while "__" in slug:
            slug = slug.replace("__", "_")
        return slug.strip("_")
