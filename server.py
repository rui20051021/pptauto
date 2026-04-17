#!/usr/bin/env python3
"""PPT Master API Server — FastAPI backend for SlideCraft AI frontend."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from dotenv import load_dotenv
from pydantic import BaseModel, Field
import uvicorn

# Ensure scripts are importable
REPO_ROOT = Path(__file__).resolve().parent
load_dotenv(REPO_ROOT / ".env", override=True)
SCRIPTS_DIR = REPO_ROOT / "skills" / "ppt-master" / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from project_manager import ProjectManager

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("ppt_master.server")

app = FastAPI(title="PPT Master API", version="1.0.0")

# CORS — configurable via env. Defaults to local dev origins only.
# Set CORS_ORIGINS="https://your.domain,https://other.domain" in production.
# Use CORS_ORIGINS="*" to allow all (NOT recommended).
_default_origins = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000"
_origins_env = os.environ.get("CORS_ORIGINS", _default_origins).strip()
if _origins_env == "*":
    _cors_kwargs = {"allow_origins": ["*"], "allow_credentials": False}
else:
    _cors_kwargs = {
        "allow_origins": [o.strip() for o in _origins_env.split(",") if o.strip()],
        "allow_credentials": True,
    }
app.add_middleware(
    CORSMiddleware,
    allow_methods=["*"],
    allow_headers=["*"],
    **_cors_kwargs,
)

# In-memory task cache (write-through, rehydrated from disk on startup)
tasks: dict[str, dict] = {}
PROJECTS_DIR = (REPO_ROOT / "projects").resolve()
PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
LAYOUTS_DIR = (REPO_ROOT / "skills" / "ppt-master" / "templates" / "layouts").resolve()
_LAYOUT_NAME_RE = re.compile(r"^[A-Za-z0-9_\-\u4e00-\u9fff]{1,64}$")
TASKS_DIR = (REPO_ROOT / ".tasks").resolve()
TASKS_DIR.mkdir(parents=True, exist_ok=True)
manager = ProjectManager(base_dir=str(PROJECTS_DIR))


# ── Helpers ──────────────────────────────────────────────────


_PROJECT_ID_RE = re.compile(r"^[A-Za-z0-9_\-]{1,128}$")
_TASK_ID_RE = re.compile(r"^[A-Za-z0-9]{1,64}$")


def _validate_project_id(project_id: str) -> None:
    """Reject path separators, ``..``, and other unsafe characters early."""
    if not _PROJECT_ID_RE.match(project_id or ""):
        raise HTTPException(status_code=400, detail="Invalid project_id")


def _validate_task_id(task_id: str) -> None:
    if not _TASK_ID_RE.match(task_id or ""):
        raise HTTPException(status_code=400, detail="Invalid task_id")


def _task_file(task_id: str) -> Path:
    return TASKS_DIR / f"{task_id}.json"


def _persist_task(task: dict) -> None:
    """Atomically write task state to disk so it survives restarts."""
    task_id = task.get("task_id")
    if not task_id or not _TASK_ID_RE.match(task_id):
        return
    path = _task_file(task_id)
    tmp = path.with_suffix(".json.tmp")
    try:
        tmp.write_text(
            json.dumps(task, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        tmp.replace(path)
    except OSError:
        # Disk full / permission issues shouldn't kill the generation task.
        # Keep going with in-memory state only.
        pass


def _load_tasks_from_disk() -> None:
    """Rehydrate task cache. Any task still running at shutdown is marked failed."""
    for f in TASKS_DIR.glob("*.json"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            logger.warning("Skipping unreadable task file: %s", f.name)
            continue
        task_id = data.get("task_id")
        if not task_id or not _TASK_ID_RE.match(task_id):
            continue
        if data.get("status") in {"queued", "running"}:
            # The asyncio task that owned this is gone — client would poll forever.
            data["status"] = "failed"
            data["error"] = "Server restarted before task completed"
            data["stage"] = "中断：服务重启"
            _persist_task(data)
        tasks[task_id] = data


_load_tasks_from_disk()


def _safe_filename(filename: Optional[str]) -> str:
    """Strip any directory component from an uploaded filename."""
    name = Path(filename or "").name
    if not name or name in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid filename")
    return name


# Max upload size: 200 MB by default. Override with MAX_UPLOAD_MB env var.
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_MB", "200")) * 1024 * 1024
_UPLOAD_CHUNK = 1 << 20  # 1 MiB


async def _stream_upload_to_file(file: UploadFile, dest: Path) -> int:
    """Stream an UploadFile to disk without loading it fully into memory.

    Returns bytes written. Aborts (deleting partial file) if size exceeds
    ``MAX_UPLOAD_BYTES``.
    """
    written = 0
    try:
        with dest.open("wb") as out:
            while True:
                chunk = await file.read(_UPLOAD_CHUNK)
                if not chunk:
                    break
                written += len(chunk)
                if written > MAX_UPLOAD_BYTES:
                    out.close()
                    dest.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit",
                    )
                out.write(chunk)
    except HTTPException:
        raise
    except Exception:
        dest.unlink(missing_ok=True)
        raise
    return written


def get_project_path(project_id: str) -> Path:
    """Resolve and validate a project directory, guarding against path traversal."""
    _validate_project_id(project_id)
    for d in PROJECTS_DIR.iterdir():
        if not d.is_dir() or not d.name.startswith(project_id):
            continue
        resolved = d.resolve()
        # Must live directly under PROJECTS_DIR — blocks symlinks escaping the root.
        if resolved.parent != PROJECTS_DIR:
            continue
        return resolved
    raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")


def find_pptx_files(project_path: Path) -> list[Path]:
    """Find generated PPTX files in a project directory."""
    pptx_files = []
    for f in project_path.glob("*.pptx"):
        pptx_files.append(f)
    return sorted(pptx_files, key=lambda p: p.stat().st_mtime, reverse=True)


def _read_source_content(project_path: Path) -> str:
    """Read all imported markdown/text sources for a project."""
    source_content = ""
    sources_dir = project_path / "sources"
    if sources_dir.exists():
        for f in sorted(sources_dir.iterdir()):
            if f.suffix.lower() in {".md", ".markdown", ".txt"}:
                source_content += f.read_text(encoding="utf-8", errors="replace")
                source_content += "\n\n"
    return source_content.strip()


def _persist_outline(project_path: Path, outline: list[dict]) -> None:
    (project_path / "outline.json").write_text(
        json.dumps(outline, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _load_outline(project_path: Path) -> list[dict] | None:
    outline_file = project_path / "outline.json"
    if not outline_file.exists():
        return None
    try:
        data = json.loads(outline_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, list) else None


def _set_selected_template(project_path: Path, template_id: str | None) -> str | None:
    if not template_id:
        return None
    if not _LAYOUT_NAME_RE.match(template_id):
        raise HTTPException(status_code=400, detail="Invalid template_id")
    layout_dir = LAYOUTS_DIR / template_id
    if not layout_dir.is_dir():
        raise HTTPException(status_code=404, detail="Template not found")
    (project_path / "selected_template.txt").write_text(template_id, encoding="utf-8")
    return template_id


def _compose_outline_prompt(
    source_content: str,
    requirements: str = "",
    current_outline: list[dict] | None = None,
) -> str:
    blocks: list[str] = []
    if source_content.strip():
        blocks.append(f"Source material:\n{source_content.strip()}")
    if current_outline:
        blocks.append(
            "Current slide outline (JSON):\n"
            + json.dumps(current_outline, ensure_ascii=False, indent=2)
        )
    if requirements.strip():
        blocks.append(f"User requirements:\n{requirements.strip()}")
    return "\n\n".join(blocks).strip()


class OutlineDraftRequest(BaseModel):
    slide_count: int = Field(default=10, ge=1, le=50)
    auto_chart: bool = True
    template_id: str | None = None
    requirements: str = ""


class OutlineRevisionRequest(BaseModel):
    outline: list[dict] = Field(default_factory=list)
    instruction: str = ""
    auto_chart: bool = True
    template_id: str | None = None


# ── API Endpoints ────────────────────────────────────────────


@app.get("/api/templates")
async def list_templates():
    """Return the layouts index with a thumbnail URL for each template."""
    index_path = LAYOUTS_DIR / "layouts_index.json"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="Layouts index not found")
    try:
        data = json.loads(index_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        raise HTTPException(status_code=500, detail=f"Failed to read index: {e}")

    layouts = data.get("layouts", {})
    for name, entry in layouts.items():
        cover = LAYOUTS_DIR / name / "01_cover.svg"
        entry["id"] = name
        entry["thumbnail"] = (
            f"/api/templates/{name}/thumbnail" if cover.exists() else None
        )
    return data


@app.get("/api/templates/{name}/thumbnail")
async def get_template_thumbnail(name: str):
    """Serve the 01_cover.svg of a given template as the thumbnail."""
    if not _LAYOUT_NAME_RE.match(name or ""):
        raise HTTPException(status_code=400, detail="Invalid template name")
    cover = (LAYOUTS_DIR / name / "01_cover.svg").resolve()
    if cover.parent.parent != LAYOUTS_DIR or not cover.exists():
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    return FileResponse(cover, media_type="image/svg+xml")


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


@app.post("/api/projects")
async def create_project(
    name: str = Form("presentation"),
    format: str = Form("ppt169"),
    slide_count: int = Form(10),
):
    """Create a new ppt-master project."""
    try:
        # Sanitize user-supplied name to [A-Za-z0-9_-], fall back to default.
        safe_name = re.sub(r"[^A-Za-z0-9_\-]", "_", name or "").strip("_")[:64]
        if not safe_name:
            safe_name = "presentation"
        project_id = f"{safe_name}_{uuid.uuid4().hex[:6]}"
        project_path = manager.init_project(
            project_name=project_id,
            canvas_format=format,
            base_dir=str(PROJECTS_DIR),
        )
        return {
            "project_id": project_id,
            "project_path": project_path,
            "slide_count": slide_count,
        }
    except Exception as e:
        logger.exception("Failed to create project (name=%r)", name)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/projects/{project_id}/upload-template")
async def upload_template(project_id: str, file: UploadFile = File(...)):
    """Upload a PPTX template file."""
    project_path = get_project_path(project_id)
    templates_dir = project_path / "templates"
    templates_dir.mkdir(parents=True, exist_ok=True)

    safe_name = _safe_filename(file.filename)
    dest = templates_dir / safe_name
    size = await _stream_upload_to_file(file, dest)

    return {"message": "Template uploaded", "filename": safe_name, "size": size}


@app.post("/api/projects/{project_id}/upload-source")
async def upload_source(project_id: str, file: UploadFile = File(...)):
    """Upload a source document (PDF, DOCX, TXT, MD, etc.)."""
    project_path = get_project_path(project_id)
    sources_dir = project_path / "sources"
    sources_dir.mkdir(parents=True, exist_ok=True)

    safe_name = _safe_filename(file.filename)
    dest = sources_dir / safe_name
    size = await _stream_upload_to_file(file, dest)

    # Auto-convert to markdown if needed
    suffix = Path(safe_name).suffix.lower()
    md_path = None
    if suffix in {".pdf", ".docx", ".doc", ".pptx", ".txt"}:
        try:
            summary = manager.import_sources(
                str(project_path), [str(dest)], move=True
            )
            if summary.get("markdown"):
                md_path = summary["markdown"][0]
        except Exception:
            # Conversion is best-effort — the raw file is still saved and usable.
            logger.exception(
                "Source auto-conversion failed for %s in project %s",
                safe_name,
                project_id,
            )

    return {
        "message": "Source uploaded",
        "filename": safe_name,
        "size": size,
        "markdown": md_path,
    }


@app.post("/api/projects/{project_id}/upload-text")
async def upload_text(project_id: str, content: str = Form(...)):
    """Save raw text content as a markdown source."""
    project_path = get_project_path(project_id)
    sources_dir = project_path / "sources"
    sources_dir.mkdir(parents=True, exist_ok=True)

    md_path = sources_dir / "content.md"
    md_path.write_text(content, encoding="utf-8")

    return {"message": "Text saved", "markdown": str(md_path)}


@app.post("/api/projects/{project_id}/outline")
async def draft_outline(project_id: str, payload: OutlineDraftRequest):
    """Draft an editable outline from project sources and user requirements."""
    project_path = get_project_path(project_id)
    template_id = _set_selected_template(project_path, payload.template_id)

    source_content = _read_source_content(project_path)
    prompt_source = _compose_outline_prompt(
        source_content=source_content,
        requirements=payload.requirements,
    )
    if not prompt_source:
        raise HTTPException(
            status_code=400,
            detail="Please upload source content or describe your requirements first.",
        )

    from api_generator import generate_outline, load_template_context

    template_ctx = load_template_context(template_id) if template_id else None
    outline = await generate_outline(
        prompt_source,
        payload.slide_count,
        payload.auto_chart,
        template_ctx=template_ctx,
    )
    _persist_outline(project_path, outline)
    return {"project_id": project_id, "slides": outline}


@app.post("/api/projects/{project_id}/outline/revise")
async def revise_outline(project_id: str, payload: OutlineRevisionRequest):
    """Revise an existing outline using the latest user instruction."""
    project_path = get_project_path(project_id)
    template_id = _set_selected_template(project_path, payload.template_id)

    current_outline = payload.outline or _load_outline(project_path)
    if not current_outline:
        raise HTTPException(status_code=400, detail="No outline available to revise")

    source_content = _read_source_content(project_path)
    prompt_source = _compose_outline_prompt(
        source_content=source_content,
        requirements=payload.instruction,
        current_outline=current_outline,
    )

    from api_generator import generate_outline, load_template_context

    template_ctx = load_template_context(template_id) if template_id else None
    outline = await generate_outline(
        prompt_source,
        len(current_outline),
        payload.auto_chart,
        template_ctx=template_ctx,
    )
    _persist_outline(project_path, outline)
    return {"project_id": project_id, "slides": outline}


@app.post("/api/projects/{project_id}/generate")
async def start_generation(
    project_id: str,
    slide_count: int = Form(10),
    auto_chart: bool = Form(True),
    template_id: str = Form(""),
    outline_json: str = Form(""),
):
    """Start async PPT generation task."""
    project_path = get_project_path(project_id)
    task_id = uuid.uuid4().hex[:12]
    outline_override: list[dict] | None = None

    # Persist built-in template selection (if any) into the project folder so
    # downstream stages can pick it up.
    template_id = _set_selected_template(project_path, template_id)

    if outline_json.strip():
        try:
            parsed_outline = json.loads(outline_json)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid outline_json: {e}")
        if not isinstance(parsed_outline, list) or not parsed_outline:
            raise HTTPException(
                status_code=400,
                detail="outline_json must be a non-empty slide array",
            )
        outline_override = parsed_outline
        slide_count = len(parsed_outline)
        _persist_outline(project_path, parsed_outline)

    tasks[task_id] = {
        "task_id": task_id,
        "project_id": project_id,
        "project_path": str(project_path),
        "status": "queued",
        "progress": 0,
        "stage": "初始化",
        "slides": outline_override,
        "error": None,
        "pptx_path": None,
        "template_id": template_id or None,
        "created_at": datetime.now().isoformat(),
    }
    _persist_task(tasks[task_id])

    # Launch background generation
    asyncio.create_task(
        run_generation(
            task_id,
            project_path,
            slide_count,
            auto_chart,
            outline_override=outline_override,
        )
    )

    return {"task_id": task_id, "status": "queued"}


async def run_generation(
    task_id: str,
    project_path: Path,
    slide_count: int,
    auto_chart: bool,
    outline_override: list[dict] | None = None,
):
    """Background generation pipeline."""
    task = tasks[task_id]
    try:
        # ── Step 1: Read source content ──
        task["status"] = "running"
        task["stage"] = "读取源文件"
        task["progress"] = 5
        _persist_task(task)

        source_content = _read_source_content(project_path)

        if not source_content.strip() and not outline_override:
            raise ValueError("没有找到可用的源内容。请上传文档或输入文本。")

        task["progress"] = 10
        task["stage"] = "AI 分析内容"
        _persist_task(task)

        # ── Step 2: Generate outline via GPT ──
        from api_generator import generate_outline, generate_svg_pages, run_postprocess, load_template_context

        template_id = task.get("template_id")
        template_ctx = load_template_context(template_id) if template_id else None

        if outline_override:
            outline = outline_override
        else:
            outline = await generate_outline(
                source_content, slide_count, auto_chart, template_ctx=template_ctx
            )
            if not outline:
                raise ValueError(
                    "AI returned an empty slide outline. The upstream model accepted "
                    "the request but did not produce any usable slide content."
                )
            _persist_outline(project_path, outline)
        task["slides"] = outline
        task["progress"] = 30
        task["stage"] = "生成幻灯片内容"
        _persist_task(task)

        # ── Step 3: Generate SVG pages ──
        svg_output_dir = project_path / "svg_output"
        svg_output_dir.mkdir(parents=True, exist_ok=True)

        await generate_svg_pages(
            outline, svg_output_dir, task,
            on_progress=_persist_task,
            template_ctx=template_ctx,
        )

        task["progress"] = 75
        task["stage"] = "后处理与导出"
        _persist_task(task)

        # ── Step 4: Post-processing pipeline ──
        await run_postprocess(project_path)

        # ── Step 5: Find output file ──
        pptx_files = find_pptx_files(project_path)
        if pptx_files:
            task["pptx_path"] = str(pptx_files[0])

        task["status"] = "completed"
        task["progress"] = 100
        task["stage"] = "生成完成"
        _persist_task(task)

    except Exception as e:
        task["status"] = "failed"
        task["error"] = str(e)
        task["stage"] = f"错误: {str(e)[:100]}"
        _persist_task(task)
        logger.exception("Generation task %s failed", task_id)


@app.get("/api/tasks/{task_id}")
async def get_task_status(task_id: str):
    """Get generation task status."""
    _validate_task_id(task_id)
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks[task_id]


@app.get("/api/projects/{project_id}/outline")
async def get_outline(project_id: str):
    """Get the generated slide outline for a project."""
    project_path = get_project_path(project_id)
    outline = _load_outline(project_path)
    if outline:
        return {"slides": outline}
    for task in tasks.values():
        if task["project_id"] == project_id and task.get("slides"):
            return {"slides": task["slides"]}
    raise HTTPException(status_code=404, detail="No outline found")


@app.get("/api/projects/{project_id}/preview/{page}")
async def get_preview(project_id: str, page: int):
    """Get SVG preview for a specific page."""
    project_path = get_project_path(project_id)

    # Try svg_final first, fallback to svg_output
    for subdir in ["svg_final", "svg_output"]:
        svg_dir = project_path / subdir
        if svg_dir.exists():
            # Find matching SVG file
            for f in sorted(svg_dir.glob("*.svg")):
                # Extract page number from filename (e.g., page_01.svg)
                try:
                    num = int("".join(c for c in f.stem if c.isdigit()))
                    if num == page:
                        return FileResponse(f, media_type="image/svg+xml")
                except (ValueError, IndexError):
                    continue

    raise HTTPException(status_code=404, detail=f"Preview not found for page {page}")


@app.get("/api/projects/{project_id}/download")
async def download_pptx(project_id: str):
    """Download the generated PPTX file."""
    project_path = get_project_path(project_id)
    pptx_files = find_pptx_files(project_path)

    if not pptx_files:
        raise HTTPException(status_code=404, detail="No PPTX file found")

    # Prefer the native version (non-svg one)
    target = pptx_files[0]
    for f in pptx_files:
        if "_svg" not in f.name:
            target = f
            break

    return FileResponse(
        target,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=target.name,
    )


@app.get("/api/projects/{project_id}/download-url")
async def get_download_url(project_id: str):
    """Get download info for the generated PPTX."""
    project_path = get_project_path(project_id)
    pptx_files = find_pptx_files(project_path)

    if not pptx_files:
        raise HTTPException(status_code=404, detail="No PPTX file found")

    target = pptx_files[0]
    for f in pptx_files:
        if "_svg" not in f.name:
            target = f
            break

    return {
        "filename": target.name,
        "size": target.stat().st_size,
        "url": f"/api/projects/{project_id}/download",
    }


if __name__ == "__main__":
    port = int(os.environ.get("API_PORT", 8000))
    host = os.environ.get("API_HOST", "0.0.0.0")
    print(f"PPT Master API starting on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port)
