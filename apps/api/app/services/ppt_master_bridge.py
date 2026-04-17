from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from ..core.config import REPO_ROOT, settings

SCRIPTS_DIR = REPO_ROOT / "skills" / "ppt-master" / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from finalize_svg import finalize_project  # type: ignore
from project_manager import ProjectManager  # type: ignore


class PPTMasterBridge:
    def __init__(self) -> None:
        self.manager = ProjectManager(base_dir=str(settings.workspace_root))

    def create_project_workspace(self, project_name: str, canvas_format: str, owner_dir: Path) -> Path:
        owner_dir.mkdir(parents=True, exist_ok=True)
        path = self.manager.init_project(project_name=project_name, canvas_format=canvas_format, base_dir=str(owner_dir))
        return Path(path)

    def import_sources(self, workspace: Path, source_items: list[str], move: bool = True) -> dict[str, list[str]]:
        return self.manager.import_sources(str(workspace), source_items, move=move)

    def finalize(self, workspace: Path) -> None:
        options = {
            "embed_icons": True,
            "crop_images": True,
            "fix_aspect": True,
            "embed_images": True,
            "flatten_text": True,
            "fix_rounded": True,
        }
        ok = finalize_project(workspace, options, quiet=True)
        if not ok:
            raise RuntimeError("SVG 整理失败")

    def export_pptx(self, workspace: Path) -> list[Path]:
        before = {p.name for p in (workspace / "exports").glob("*.pptx")}
        command = [
            sys.executable,
            str(SCRIPTS_DIR / "svg_to_pptx.py"),
            str(workspace),
            "-s",
            "final",
            "-q",
        ]
        subprocess.run(command, cwd=REPO_ROOT, check=True, capture_output=True, text=True, encoding="utf-8", errors="replace")
        exports = sorted((workspace / "exports").glob("*.pptx"), key=lambda p: p.stat().st_mtime)
        new_exports = [p for p in exports if p.name not in before]
        if not new_exports:
            raise RuntimeError("PPT 导出失败，未生成任何文件")
        return new_exports
