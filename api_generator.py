#!/usr/bin/env python3
"""
PPT Master — AI generation module using OpenAI GPT API.

Handles:
  1. Content analysis → structured slide outline
  2. Per-page SVG generation (DrawingML-compatible)
  3. Post-processing pipeline orchestration
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
import sys
from pathlib import Path

try:
    from openai import AsyncOpenAI
except ImportError:
    print("[WARN] openai package not installed. Run: pip install openai")
    AsyncOpenAI = None  # type: ignore

REPO_ROOT = Path(__file__).resolve().parent
SCRIPTS_DIR = REPO_ROOT / "skills" / "ppt-master" / "scripts"
LAYOUTS_DIR = REPO_ROOT / "skills" / "ppt-master" / "templates" / "layouts"


def load_template_context(template_id: str | None) -> dict:
    """Load design_spec.md and reference SVGs for a built-in template.

    Returns an empty dict if template_id is falsy or the directory is missing.
    Content is bounded so it doesn't blow up the prompt.
    """
    if not template_id:
        return {}
    tdir = LAYOUTS_DIR / template_id
    if not tdir.is_dir():
        return {}

    ctx: dict = {"id": template_id}
    spec = tdir / "design_spec.md"
    if spec.exists():
        text = spec.read_text(encoding="utf-8", errors="replace")
        ctx["design_spec"] = text[:6000]

    samples = {}
    for name in ("01_cover.svg", "02_toc.svg", "02_chapter.svg", "03_content.svg", "04_ending.svg"):
        f = tdir / name
        if f.exists():
            svg = f.read_text(encoding="utf-8", errors="replace")
            # Keep each sample compact.
            samples[name] = svg[:3500]
    ctx["samples"] = samples
    return ctx

# ── OpenAI client ────────────────────────────────────────────

def get_client() -> AsyncOpenAI:
    api_key = os.environ.get("OPENAI_API_KEY", "")
    base_url = os.environ.get("OPENAI_BASE_URL", None)
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY 环境变量未设置。请在 .env 文件中配置或通过环境变量传入。"
        )
    kwargs: dict = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    return AsyncOpenAI(**kwargs)


def get_model() -> str:
    return os.environ.get("OPENAI_MODEL", "gpt-4o")


def _extract_chat_text(response) -> str:
    """Extract plain assistant text from an OpenAI-compatible chat response."""
    try:
        message = response.choices[0].message
    except (AttributeError, IndexError, KeyError, TypeError):
        return ""

    content = getattr(message, "content", None)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
                continue
            text = getattr(item, "text", None)
            if isinstance(text, str):
                parts.append(text)
        return "".join(parts)
    return ""


# ── Step 1: Generate outline ────────────────────────────────

OUTLINE_SYSTEM_PROMPT = """你是一位专业的演示文稿策略师。根据用户提供的内容，生成一份结构化的 PPT 大纲。

要求：
1. 每页幻灯片包含：页码(id)、标题(title)、副标题/描述(description)、布局类型(layout)、要点列表(points)
2. 布局类型包括：cover(封面)、content(内容页)、section(章节分隔页)、comparison(对比页)、chart(图表页)、summary(总结页)
3. 内容要精准提炼源材料的核心信息
4. 第一页应为封面，最后一页应为总结
5. 返回严格的 JSON 格式

返回格式：
```json
[
  {
    "id": 1,
    "title": "标题",
    "description": "副标题或描述",
    "layout": "cover",
    "points": ["要点1", "要点2"]
  }
]
```
"""


async def generate_outline(
    source_content: str,
    slide_count: int = 10,
    auto_chart: bool = True,
    template_ctx: dict | None = None,
) -> list[dict]:
    """Use GPT to analyze content and generate a structured slide outline."""
    client = get_client()
    model = get_model()

    # Truncate very long content
    max_chars = 30000
    if len(source_content) > max_chars:
        source_content = source_content[:max_chars] + "\n\n...(内容已截断)"

    template_hint = ""
    if template_ctx and template_ctx.get("design_spec"):
        template_hint = (
            f"\n\n【选定模板：{template_ctx['id']}】请参考以下设计规范安排内容结构、"
            f"tone、每页布局选择与章节节奏：\n---\n{template_ctx['design_spec']}\n---\n"
        )

    user_prompt = f"""请根据以下内容生成一份包含 {slide_count} 页幻灯片的 PPT 大纲。

{"如果内容中包含数据，可以建议使用图表页布局。" if auto_chart else "请不要使用图表页布局。"}
{template_hint}
源内容：
---
{source_content}
---

请直接返回 JSON 数组，不要包含其他文字。"""

    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": OUTLINE_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.7,
        response_format={"type": "json_object"},
    )

    text = _extract_chat_text(response).strip()
    if not text:
        raise ValueError(
            f"AI service returned empty content while generating the slide outline "
            f"(model: {model}). The current proxy/API acknowledged the request but "
            f"did not return usable text."
        )
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\[.*\]", text, re.DOTALL)
        if not match:
            raise ValueError(f"GPT returned non-JSON outline content: {text[:200]}")
        data = json.loads(match.group())

    outline: list[dict]
    if isinstance(data, list):
        outline = data
    elif isinstance(data, dict):
        outline = []
        for key in ("slides", "outline", "pages", "data"):
            if key in data and isinstance(data[key], list):
                outline = data[key]
                break
        if not outline and data:
            first_value = next(iter(data.values()))
            if isinstance(first_value, list):
                outline = first_value
    else:
        outline = []

    if not outline:
        raise ValueError(
            f"AI service returned an empty outline (model: {model}). "
            f"The request succeeded but no slides were produced."
        )

    return outline

    # Parse JSON — handle both raw array and {"slides": [...]} wrapper
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            for key in ("slides", "outline", "pages", "data"):
                if key in data and isinstance(data[key], list):
                    return data[key]
            return list(data.values())[0] if data else []
    except json.JSONDecodeError:
        # Try to extract JSON array from markdown code block
        m = re.search(r"\[.*\]", text, re.DOTALL)
        if m:
            return json.loads(m.group())
        raise ValueError(f"GPT 返回内容解析失败: {text[:200]}")

    return []


# ── Step 2: Generate SVG pages ──────────────────────────────

SVG_SYSTEM_PROMPT = """你是一位高级演示文稿设计师。根据提供的幻灯片信息，生成一个完整的 SVG 图像作为幻灯片页面。

SVG 规格要求：
- viewBox="0 0 1280 720" (16:9 PPT 格式)
- 使用深色主题：背景 #0F0F0F，主要文字 #FFFFFF，强调色 #C5A059，次要文字 #999999
- 所有文字使用 <text> 元素，font-family="Microsoft YaHei, PingFang SC, sans-serif"
- 标题字号 36-48px，正文 18-24px，注释 14-16px
- 使用 <rect>, <circle>, <line>, <polygon>, <text> 等基础 SVG 元素
- 排版整洁，留白充足，视觉层次分明

禁止使用：
- clipPath, mask, <style>, class, 外部 CSS
- <foreignObject>, textPath, @font-face
- <animate*>, <script>, marker-end
- <iframe>, <symbol>+<use>
- rgba() — 改用 fill-opacity / stroke-opacity

布局参考：
- cover: 居中大标题 + 副标题，可加装饰线条/形状
- content: 左侧标题区 + 右侧要点列表
- section: 居中章节标题 + 序号
- comparison: 左右分栏对比
- chart: 简化的数据可视化（柱状图/饼图用基础形状实现）
- summary: 核心要点回顾

返回纯 SVG 代码，不要包含任何其他文字或 markdown 语法。"""


async def generate_svg_pages(
    outline: list[dict],
    svg_output_dir: Path,
    task: dict,
    on_progress=None,
    template_ctx: dict | None = None,
) -> None:
    """Generate SVG files for each slide in the outline, concurrently.

    Pages are generated in parallel up to ``SVG_CONCURRENCY`` (env, default 5)
    to amortize LLM round-trip latency. ``on_progress`` is called with ``task``
    after each page completes so the caller can persist state.
    """
    client = get_client()
    model = get_model()
    total = len(outline)
    if total == 0:
        raise ValueError("Outline is empty, so no SVG pages can be generated.")

    concurrency = max(1, int(os.environ.get("SVG_CONCURRENCY", "5")))
    sem = asyncio.Semaphore(concurrency)
    completed = 0

    # Map outline layout → template sample filename
    layout_sample_map = {
        "cover": "01_cover.svg",
        "section": "02_chapter.svg",
        "chapter": "02_chapter.svg",
        "toc": "02_toc.svg",
        "content": "03_content.svg",
        "comparison": "03_content.svg",
        "chart": "03_content.svg",
        "summary": "04_ending.svg",
        "ending": "04_ending.svg",
    }

    system_prompt = SVG_SYSTEM_PROMPT
    if template_ctx:
        extras = [f"\n\n【选定模板：{template_ctx.get('id')}】必须严格遵循该模板的视觉语言：配色、字体层级、装饰元素、留白比例。"]
        if template_ctx.get("design_spec"):
            extras.append("\n设计规范节选：\n" + template_ctx["design_spec"])
        system_prompt = system_prompt + "".join(extras)

    task["stage"] = f"生成幻灯片 0/{total}"
    task["progress"] = 30
    if on_progress:
        on_progress(task)

    async def _gen_one(i: int, slide: dict) -> None:
        nonlocal completed
        page_num = i + 1
        async with sem:
            sample_svg = ""
            if template_ctx and template_ctx.get("samples"):
                key = layout_sample_map.get(slide.get("layout", "content"), "03_content.svg")
                sample_svg = template_ctx["samples"].get(key) or template_ctx["samples"].get("03_content.svg", "")

            reference_block = ""
            if sample_svg:
                reference_block = (
                    "\n\n【参考样例 SVG — 请复用其视觉语言（配色、字体、装饰线/色块、排版节奏），"
                    "但必须替换内容为本页真实信息，不要照搬文字】：\n"
                    f"{sample_svg}\n"
                )

            user_prompt = f"""请为以下幻灯片生成 SVG 代码：

页码: {slide.get('id', page_num)}
标题: {slide.get('title', '')}
描述: {slide.get('description', '')}
布局: {slide.get('layout', 'content')}
要点: {json.dumps(slide.get('points', []), ensure_ascii=False)}

这是第 {page_num} 页，共 {total} 页。
{reference_block}
请直接返回 <svg ...>...</svg> 代码，不要包含其他内容。"""

            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.5,
                max_tokens=4096,
            )

            svg_content = _extract_chat_text(response)

            # Extract SVG from potential markdown code block
            svg_match = re.search(r"(<svg[\s\S]*?</svg>)", svg_content, re.IGNORECASE)
            if svg_match:
                svg_content = svg_match.group(1)
            elif not svg_content.strip().startswith("<svg"):
                svg_content = _fallback_svg(slide, page_num, total)

            # Ensure viewBox is correct
            if 'viewBox="0 0 1280 720"' not in svg_content:
                svg_content = svg_content.replace(
                    "<svg", '<svg viewBox="0 0 1280 720"', 1
                )

            filename = f"page_{page_num:02d}.svg"
            svg_path = svg_output_dir / filename
            svg_path.write_text(svg_content, encoding="utf-8")

        # asyncio is single-threaded, so these mutations are atomic.
        completed += 1
        task["stage"] = f"生成幻灯片 {completed}/{total}"
        task["progress"] = 30 + int(45 * (completed / total))
        if on_progress:
            on_progress(task)

    await asyncio.gather(*(_gen_one(i, s) for i, s in enumerate(outline)))

    task["progress"] = 75
    if on_progress:
        on_progress(task)


def _fallback_svg(slide: dict, page_num: int, total: int) -> str:
    """Generate a simple fallback SVG if GPT output can't be parsed."""
    title = slide.get("title", f"Slide {page_num}")
    desc = slide.get("description", "")
    points = slide.get("points", [])

    points_svg = ""
    for j, pt in enumerate(points[:6]):
        y = 380 + j * 45
        points_svg += f'  <circle cx="160" cy="{y}" r="5" fill="#C5A059"/>\n'
        points_svg += f'  <text x="185" y="{y + 6}" font-size="20" fill="#CCCCCC" font-family="Microsoft YaHei, sans-serif">{_escape_xml(pt)}</text>\n'

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#0F0F0F"/>
  <rect x="0" y="0" width="1280" height="6" fill="#C5A059"/>
  <text x="120" y="200" font-size="42" fill="#FFFFFF" font-weight="bold" font-family="Microsoft YaHei, sans-serif">{_escape_xml(title)}</text>
  <text x="120" y="260" font-size="20" fill="#999999" font-family="Microsoft YaHei, sans-serif">{_escape_xml(desc)}</text>
  <line x1="120" y1="310" x2="400" y2="310" stroke="#C5A059" stroke-width="2"/>
{points_svg}
  <text x="1160" y="690" font-size="14" fill="#555555" text-anchor="end" font-family="Microsoft YaHei, sans-serif">{page_num} / {total}</text>
</svg>"""


def _escape_xml(text: str) -> str:
    """Escape XML special characters."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


# ── Step 3: Post-processing ─────────────────────────────────


async def run_postprocess(project_path: Path) -> None:
    """Run the ppt-master post-processing pipeline sequentially."""
    python = sys.executable

    # Step 1: total_md_split (may fail if no total.md — that's OK)
    try:
        await _run_script(
            [python, str(SCRIPTS_DIR / "total_md_split.py"), str(project_path)]
        )
    except Exception:
        pass  # No total.md is fine for web-generated projects

    # Step 2: finalize_svg
    await _run_script(
        [python, str(SCRIPTS_DIR / "finalize_svg.py"), str(project_path)]
    )

    # Step 3: svg_to_pptx
    await _run_script(
        [python, str(SCRIPTS_DIR / "svg_to_pptx.py"), str(project_path), "-s", "final"]
    )


async def _run_script(args: list[str]) -> str:
    """Run a script asynchronously and return stdout."""
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(REPO_ROOT),
    )
    stdout, stderr = await proc.communicate()
    output = stdout.decode("utf-8", errors="replace")

    if proc.returncode != 0:
        err = stderr.decode("utf-8", errors="replace")
        raise RuntimeError(f"Script failed ({args[1] if len(args) > 1 else args[0]}): {err or output}")

    return output
