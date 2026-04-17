from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from textwrap import dedent

from pydantic import BaseModel, Field

from ..core.config import settings
from .model_integration import request_model_text, resolve_model_integration


CANVAS_PRESETS = {
    "ppt169": {"name": "PPT 16:9", "dimensions": "1280x720", "viewBox": "0 0 1280 720", "width": 1280, "height": 720},
    "ppt43": {"name": "PPT 4:3", "dimensions": "1024x768", "viewBox": "0 0 1024 768", "width": 1024, "height": 768},
    "xiaohongshu": {"name": "小红书图文", "dimensions": "1242x1660", "viewBox": "0 0 1242 1660", "width": 1242, "height": 1660},
    "story": {"name": "故事竖版", "dimensions": "1080x1920", "viewBox": "0 0 1080 1920", "width": 1080, "height": 1920},
}
DEFAULT_COLORS = ["#F8FAFC", "#E2E8F0", "#0F172A", "#2563EB", "#0EA5E9", "#22C55E"]
STYLE_LABELS = {"general": "通用商务", "consulting": "咨询答辩", "top_consulting": "高密度咨询"}
THEME_LABELS = {"light": "浅色主题", "dark": "深色主题"}
MOJIBAKE_SIGNATURES = ("锛", "鈥", "鏈", "鎴", "璁", "鍙", "鐨", "浠", "鏁", "闂", "绗")
BOILERPLATE_TERMS = ("学术声明", "版权使用授权书", "目录", "参考文献", "致谢", "作者签名", "学院", "教务处", "版权", "授权书", "本人郑重声明", "声明")


class SlideOutline(BaseModel):
    page_number: int
    title: str
    summary: str
    bullets: list[str] = Field(default_factory=list)
    speaker_notes: str


class DesignPlan(BaseModel):
    project_title: str
    subtitle: str
    theme_summary: str
    slides: list[SlideOutline]


@dataclass
class GeneratedImage:
    filename: str
    prompt: str
    path: Path


@dataclass
class SourceContext:
    text: str
    title: str
    chinese_abstract: str
    english_abstract: str
    keywords: list[str] = field(default_factory=list)
    headings: list[str] = field(default_factory=list)
    top_level_sections: list[str] = field(default_factory=list)
    abstract_sentences: list[str] = field(default_factory=list)
    body_sentences: list[str] = field(default_factory=list)
    bullet_pool: list[str] = field(default_factory=list)
    tools: list[str] = field(default_factory=list)
    quoted_entities: list[str] = field(default_factory=list)
    source_repaired: bool = False


def _sanitize_svg_text(value: str) -> str:
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _contains_any(value: str, keywords: tuple[str, ...]) -> bool:
    lowered = value.lower()
    return any(keyword.lower() in lowered for keyword in keywords)


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        cleaned = item.strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        result.append(cleaned)
    return result


def _limit(value: str, limit: int = 72) -> str:
    compact = re.sub(r"\s+", " ", value).strip()
    return compact if len(compact) <= limit else f"{compact[: limit - 1].rstrip()}…"


def _clean_line(value: str) -> str:
    cleaned = value.replace("\u3000", " ").replace("\xa0", " ").replace("\u200b", "")
    cleaned = cleaned.replace("__", "").replace("**", "")
    cleaned = re.sub(r"<a\s+id=\"[^\"]+\"></a>", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\[(.*?)\]\([^)]+\)", r"\1", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned.strip("-•· ")


def _split_sentences(value: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", value).strip()
    parts = re.split(r"(?<=[。！？!?；;:：\.])\s+|(?<=[。！？!?；;])", normalized)
    return _dedupe([_clean_line(part) for part in parts if len(_clean_line(part)) >= 8])


def _score_text(value: str) -> int:
    cjk = sum("\u4e00" <= ch <= "\u9fff" for ch in value)
    marker_hits = sum(value.count(marker) for marker in ("摘要", "关键词", "绪论", "总结与展望", "Abstract:", "Key Words:"))
    mojibake_hits = sum(value.count(marker) for marker in MOJIBAKE_SIGNATURES)
    return cjk + marker_hits * 120 - mojibake_hits * 18 - value.count("�") * 12


def _repair_mojibake(value: str) -> tuple[str, bool]:
    candidates = [value]
    for source_encoding in ("latin1", "cp1252"):
        try:
            repaired = value.encode(source_encoding, errors="replace").decode("utf-8", errors="replace")
        except UnicodeError:
            continue
        if repaired and repaired != value:
            candidates.append(repaired)
    best = max(candidates, key=_score_text)
    return best, best != value


def _strip_placeholder(value: str | None) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    normalized = raw.replace("？", "?").strip()
    if not normalized or set(normalized) <= {"?"}:
        return ""
    return "" if normalized in {"未填写", "待补充"} else raw


class ModelGateway:
    def __init__(self) -> None:
        self.integration = resolve_model_integration()
        self.provider = self.integration.effective_provider
        self.model_api_key = self.integration.api_key
        self.model_base_url = self.integration.base_url
        self.model_name = self.integration.model_name
        self.external_ai_enabled = self.provider == "openai" and bool(self.model_api_key)
        self.last_build_details: dict[str, str | bool] = {}

    def build_design_plan(self, project_name: str, wizard: dict, source_markdown: str) -> DesignPlan:
        context = self._build_source_context(source_markdown)
        wizard_view = self._prepare_wizard(wizard, context)
        if self.external_ai_enabled:
            try:
                plan = self._build_design_plan_with_openai(project_name, wizard_view, context)
                self.last_build_details = {
                    "planner": "openai",
                    "planner_label": f"AI 规划（{self.model_name}）",
                    "source_repaired": context.source_repaired,
                    "requested_provider": self.integration.requested_provider,
                    "effective_provider": self.integration.effective_provider,
                    "wire_api": self.integration.wire_api,
                }
                return plan
            except Exception as exc:  # pragma: no cover
                self.last_build_details = {
                    "planner": "local",
                    "planner_label": "本地智能规划",
                    "source_repaired": context.source_repaired,
                    "requested_provider": self.integration.requested_provider,
                    "effective_provider": self.integration.effective_provider,
                    "wire_api": self.integration.wire_api,
                    "fallback_reason": str(exc),
                }
        plan = self._build_design_plan_locally(project_name, wizard_view, context)
        self.last_build_details = {
            "planner": "local",
            "planner_label": "本地智能规划",
            "source_repaired": context.source_repaired,
            "requested_provider": self.integration.requested_provider,
            "effective_provider": self.integration.effective_provider,
            "wire_api": self.integration.wire_api,
            "fallback_reason": "external_ai_not_configured" if self.integration.requested_provider == "openai" and not self.integration.api_key else "",
        }
        return plan

    def render_design_spec(self, project_name: str, wizard: dict, plan: DesignPlan) -> str:
        canvas = CANVAS_PRESETS.get(wizard["canvas_format"], CANVAS_PRESETS["ppt169"])
        colors = self._resolve_colors(wizard.get("color_scheme") or [])
        lines = [
            f"# {plan.project_title or project_name} - Design Spec",
            "",
            "## 项目信息",
            f"- 项目名称：{plan.project_title or project_name}",
            f"- 画布：{canvas['name']}（{canvas['dimensions']}）",
            f"- 页数：{len(plan.slides)}",
            f"- 风格：{STYLE_LABELS.get(wizard['style_objective'], wizard['style_objective'])}",
            f"- 受众：{wizard['target_audience']}",
            f"- 场景：{wizard['use_case']}",
            f"- 主题：{THEME_LABELS.get(wizard['theme_mode'], wizard['theme_mode'])}",
            f"- 色板：{', '.join(colors)}",
            "",
            "## 页面规划",
        ]
        for slide in plan.slides:
            lines.extend([f"### 第 {slide.page_number:02d} 页：{slide.title}", f"- 页面摘要：{slide.summary}", "- 关键内容："])
            lines.extend([f"  - {bullet}" for bullet in slide.bullets])
            lines.extend([f"- 讲解备注：{slide.speaker_notes}", ""])
        return "\n".join(lines).strip() + "\n"

    def maybe_generate_images(self, wizard: dict, workspace: Path) -> list[GeneratedImage]:
        if wizard["image_strategy"] != "ai":
            return []
        images_dir = workspace / "images"
        images_dir.mkdir(exist_ok=True)
        try:
            from PIL import Image, ImageDraw
        except ImportError:
            return []
        generated: list[GeneratedImage] = []
        for idx in range(1, 3):
            filename = f"generated_{idx:02d}.png"
            path = images_dir / filename
            image = Image.new("RGB", (1280, 720), color=(236, 242, 255))
            draw = ImageDraw.Draw(image)
            draw.rectangle((40, 40, 1240, 680), outline=(37, 99, 235), width=6)
            draw.text((80, 100), f"AI 占位图 {idx}", fill=(15, 23, 42))
            draw.text((80, 180), f"{wizard['use_case']} | {wizard['accent_tone']}", fill=(51, 65, 85))
            image.save(path)
            generated.append(GeneratedImage(filename=filename, prompt="AI 占位图", path=path))
        return generated

    def generate_svg_for_slide(self, wizard: dict, plan: DesignPlan, slide: SlideOutline) -> str:
        canvas = CANVAS_PRESETS.get(wizard["canvas_format"], CANVAS_PRESETS["ppt169"])
        colors = self._resolve_colors(wizard.get("color_scheme") or [])
        width = canvas["width"]
        height = canvas["height"]
        bg = colors[0]
        accent = colors[3]
        surface = "#FFFFFF" if wizard["theme_mode"] == "light" else "#0F172A"
        text = "#0F172A" if wizard["theme_mode"] == "light" else "#E2E8F0"
        sub_text = colors[2] if wizard["theme_mode"] == "light" else "#CBD5F5"
        body_font_size = int(wizard.get("body_font_size") or 24)
        title_font = wizard.get("typography_title_font") or "Microsoft YaHei"
        body_font = wizard.get("typography_body_font") or "Calibri"
        bullet_lines: list[str] = []
        y = 250
        for bullet in slide.bullets[:5]:
            bullet_lines.append(f'<text x="110" y="{y}" font-size="{body_font_size}" fill="{text}" font-family="{body_font}">&#8226; {_sanitize_svg_text(_limit(bullet, 52))}</text>')
            y += body_font_size + 24
        return dedent(
            f"""\
            <svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="{canvas['viewBox']}">
              <rect width="{width}" height="{height}" fill="{bg}"/>
              <rect x="48" y="44" width="{width - 96}" height="{height - 88}" rx="24" fill="{surface}" fill-opacity="0.96"/>
              <rect x="48" y="44" width="{width - 96}" height="14" rx="24" fill="{accent}"/>
              <text x="80" y="120" font-size="38" font-weight="700" fill="{text}" font-family="{title_font}">{_sanitize_svg_text(slide.title)}</text>
              <text x="80" y="170" font-size="22" fill="{sub_text}" font-family="{body_font}">{_sanitize_svg_text(_limit(slide.summary, 64))}</text>
              <line x1="80" y1="208" x2="{width - 80}" y2="208" stroke="{accent}" stroke-width="4" stroke-opacity="0.35"/>
              {''.join(bullet_lines)}
              <rect x="{width - 320}" y="240" width="220" height="176" rx="20" fill="{accent}" fill-opacity="0.08" stroke="{accent}" stroke-opacity="0.24"/>
              <text x="{width - 288}" y="290" font-size="18" fill="{sub_text}" font-family="{body_font}">主题摘要</text>
              <text x="{width - 288}" y="332" font-size="26" font-weight="700" fill="{accent}" font-family="{title_font}">{_sanitize_svg_text(_limit(plan.theme_summary, 18))}</text>
              <text x="{width - 104}" y="{height - 56}" font-size="18" fill="{sub_text}" font-family="{body_font}">{slide.page_number:02d}</text>
            </svg>
            """
        )

    def _build_design_plan_with_openai(self, project_name: str, wizard: dict, context: SourceContext) -> DesignPlan:
        prompt = dedent(
            f"""
            You are the strategist for an AI-powered PowerPoint generation pipeline.
            Return strict JSON with keys: project_title, subtitle, theme_summary, slides.
            Each slide must include: page_number, title, summary, bullets, speaker_notes.

            Hard requirements:
            - Return exactly {wizard['page_count']} slides.
            - Use audience-facing slide titles, not generic placeholders.
            - Ignore school cover pages, academic declaration, copyright authorization, table of contents, acknowledgements, references.
            - If the source is a thesis defense, organize around background, method, findings, strategy and conclusion.

            Project name: {project_name}
            Preferred title: {context.title}
            Audience: {wizard['target_audience']}
            Use case: {wizard['use_case']}
            Style objective: {wizard['style_objective']}
            Theme mode: {wizard['theme_mode']}
            Accent tone: {wizard['accent_tone']}
            Additional instructions: {wizard.get('additional_instructions') or 'None'}

            Cleaned source excerpt:
            {context.text[: settings.log_source_excerpt_chars]}
            """
        )
        content = request_model_text(
            self.integration,
            system_prompt="Return strict JSON only. Do not wrap the JSON in markdown.",
            user_prompt=prompt,
            require_json=True,
        )
        plan = DesignPlan.model_validate(json.loads(content))
        if len(plan.slides) != wizard["page_count"]:
            raise ValueError("AI 返回的页数与请求不一致")
        return plan

    def _build_design_plan_locally(self, project_name: str, wizard: dict, context: SourceContext) -> DesignPlan:
        if self._looks_like_academic(context, wizard):
            return self._build_academic_plan(project_name, wizard, context)
        return self._build_general_plan(project_name, wizard, context)

    def _build_academic_plan(self, project_name: str, wizard: dict, context: SourceContext) -> DesignPlan:
        project_title = context.title or project_name or "论文答辩"
        subtitle = f"{wizard['use_case']} | 面向 {wizard['target_audience']}"
        theme_summary = f"{STYLE_LABELS.get(wizard['style_objective'], wizard['style_objective'])} · {wizard['accent_tone']}"
        sentences = context.abstract_sentences + context.body_sentences
        background = self._pick_sentences(sentences, ("背景", "意义", "发展", "现状", "gap", "scarcity", "ear economy", "audio consumption"), 2)
        methods = self._pick_sentences(sentences, ("采用", "方法", "采集", "清洗", "建模", "可视化", "adopts", "using", "Excel", "SPSS", "Power BI"), 2)
        findings = self._pick_sentences(sentences, ("结果", "表明", "发现", "reveals", "findings", "show", "head effect", "improvement", "engagement"), 2)
        strategy = self._pick_sentences(sentences, ("策略", "优化", "建议", "proposes", "optimization", "enhanced", "interaction", "operational path"), 2)
        conclusion = self._pick_sentences(sentences, ("总结", "结论", "展望", "局限", "future", "limitation", "expand", "cross-platform"), 2)
        keyword_line = "、".join(context.keywords[:4]) or "研究背景、方法、分析、策略"
        tool_line = "、".join(context.tools[:4]) or "数据采集、清洗、建模与可视化"
        quoted = next((item for item in context.quoted_entities if len(item) <= 24), "") or project_title
        sections = [
            self._section("研究背景与选题意义", "交代研究背景、业务价值与待解决的问题。", background, [f"选题聚焦：{project_title}", f"关键词：{keyword_line}", "说明为什么要做这项研究，以及它对应的现实价值。"]),
            self._section("研究对象与方法设计", "明确研究对象、数据来源和分析方法。", methods, [f"研究对象：{quoted}", f"分析工具：{tool_line}", "说明数据是如何获得、处理和验证的。"]),
            self._section("数据分析与关键发现", "汇总数据洞察、市场现状和主要发现。", findings, ["先给出最重要的分析发现，再补充证据。", "突出核心差距、表现与问题。"]),
            self._section("核心问题与优化策略", "从问题定位走到策略建议，形成可执行方案。", strategy, ["围绕内容、互动、更新节奏和推广方式给出建议。", "策略需要与上一页发现一一对应。"]),
            self._section("结论与展望", "总结研究结论，说明局限和后续方向。", conclusion, ["收束全文，强调研究结论和业务价值。", "说明局限与后续可继续拓展的方向。"]),
        ]
        sections = self._fit_academic_sections(sections, max(int(wizard["page_count"]) - 1, 1))
        slides = [
            SlideOutline(
                page_number=1,
                title=project_title,
                summary=f"{wizard['use_case']} | 面向 {wizard['target_audience']}",
                bullets=self._compose_bullets([f"使用场景：{wizard['use_case']}", f"汇报对象：{wizard['target_audience']}", f"设计风格：{STYLE_LABELS.get(wizard['style_objective'], wizard['style_objective'])}", f"内容焦点：{keyword_line}"], 4),
                speaker_notes=f"开场先介绍课题《{project_title}》，说明这是面向 {wizard['target_audience']} 的 {wizard['use_case']} 汇报，然后概览整体结构。",
            )
        ]
        for page_number, section in enumerate(sections, start=2):
            bullets = self._compose_bullets(section["matched"] + section["fallback"], 4)
            slides.append(SlideOutline(page_number=page_number, title=section["title"], summary=section["summary"], bullets=bullets, speaker_notes=self._speaker_notes(section["title"], section["summary"], bullets)))
        return DesignPlan(project_title=project_title, subtitle=subtitle, theme_summary=theme_summary, slides=slides[: wizard["page_count"]])

    def _build_general_plan(self, project_name: str, wizard: dict, context: SourceContext) -> DesignPlan:
        project_title = context.title or project_name or "项目汇报"
        subtitle = f"{wizard['use_case']} | 面向 {wizard['target_audience']}"
        theme_summary = f"{STYLE_LABELS.get(wizard['style_objective'], wizard['style_objective'])} · {wizard['accent_tone']}"
        bullets = context.bullet_pool or [wizard["use_case"], wizard["target_audience"], wizard.get("additional_instructions") or "请聚焦关键结论与下一步动作。"]
        chunk_size = max(2, min(4, len(bullets) // max(wizard["page_count"] - 1, 1) or 2))
        slides = [
            SlideOutline(
                page_number=1,
                title=project_title,
                summary=f"{wizard['use_case']} | 面向 {wizard['target_audience']}",
                bullets=self._compose_bullets([f"使用场景：{wizard['use_case']}", f"目标受众：{wizard['target_audience']}", f"风格定位：{STYLE_LABELS.get(wizard['style_objective'], wizard['style_objective'])}"], 3),
                speaker_notes=f"先介绍项目背景，再说明这份 PPT 的目标是服务于 {wizard['use_case']}。",
            )
        ]
        section_titles = context.headings[: max(wizard["page_count"] - 1, 0)]
        for page_number in range(2, wizard["page_count"] + 1):
            start = (page_number - 2) * chunk_size
            chunk = bullets[start : start + chunk_size] or bullets[:chunk_size]
            raw_title = section_titles[page_number - 2] if page_number - 2 < len(section_titles) else ""
            title = raw_title.split(" ", 1)[-1] if raw_title else f"第 {page_number - 1} 部分"
            summary = _limit(chunk[0] if chunk else "概括本页重点内容。", 54)
            slide_bullets = self._compose_bullets(chunk + ["突出结论、依据和下一步动作。"], 4)
            slides.append(SlideOutline(page_number=page_number, title=title, summary=summary, bullets=slide_bullets, speaker_notes=self._speaker_notes(title, summary, slide_bullets)))
        return DesignPlan(project_title=project_title, subtitle=subtitle, theme_summary=theme_summary, slides=slides[: wizard["page_count"]])

    def _build_source_context(self, source_markdown: str) -> SourceContext:
        repaired_source, source_repaired = _repair_mojibake(source_markdown.replace("\r\n", "\n").replace("\ufeff", ""))
        text = self._normalize_source_text(repaired_source)
        chinese_abstract = self._extract_block(text, ("摘要",), ("关键词", "Abstract", "Key Words", "Keywords"))
        english_abstract = self._extract_block(text, ("Abstract",), ("Key Words", "Keywords", "目录", "目 录"))
        headings = self._extract_headings(text)
        title = self._extract_title(text, headings)
        abstract_sentences = _split_sentences(chinese_abstract or english_abstract)
        body_sentences = self._extract_body_sentences(text)
        return SourceContext(
            text=text,
            title=title,
            chinese_abstract=chinese_abstract,
            english_abstract=english_abstract,
            keywords=self._extract_keywords(text),
            headings=headings,
            top_level_sections=[item for item in headings if re.match(r"^\d+\s", item)],
            abstract_sentences=abstract_sentences,
            body_sentences=body_sentences,
            bullet_pool=self._build_bullet_pool(abstract_sentences, body_sentences, headings),
            tools=self._extract_tools(text),
            quoted_entities=self._extract_quoted_entities(text),
            source_repaired=source_repaired,
        )

    def _normalize_source_text(self, value: str) -> str:
        lines: list[str] = []
        for raw in value.splitlines():
            cleaned = _clean_line(raw)
            if cleaned:
                lines.append(cleaned)
            elif lines and lines[-1] != "":
                lines.append("")
        return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()

    def _prepare_wizard(self, wizard: dict, context: SourceContext) -> dict:
        prepared = dict(wizard)
        academic = self._looks_like_academic(context, prepared)
        prepared["use_case"] = _strip_placeholder(prepared.get("use_case")) or ("论文答辩" if academic else "PPT 汇报")
        prepared["target_audience"] = _strip_placeholder(prepared.get("target_audience")) or ("导师与答辩评委" if academic else "核心决策者")
        prepared["accent_tone"] = _strip_placeholder(prepared.get("accent_tone")) or "专业稳重"
        prepared["additional_instructions"] = _strip_placeholder(prepared.get("additional_instructions"))
        prepared["color_scheme"] = self._resolve_colors(prepared.get("color_scheme") or [])
        return prepared

    def _looks_like_academic(self, context: SourceContext, wizard: dict) -> bool:
        combined = " ".join(filter(None, [context.text, context.title, wizard.get("use_case", ""), wizard.get("additional_instructions", "")]))
        return _contains_any(combined, ("论文", "答辩", "摘要", "Abstract:", "绪论", "研究方法", "结论", "学术"))

    def _extract_block(self, text: str, labels: tuple[str, ...], end_labels: tuple[str, ...]) -> str:
        label_pattern = "|".join(re.escape(label) for label in labels)
        end_pattern = "|".join(re.escape(label) for label in end_labels)
        pattern = re.compile(rf"(?:^|\n)\s*(?:{label_pattern})\s*[:：]?\s*(.*?)(?=(?:\n\s*(?:{end_pattern})\s*[:：]?)|\Z)", flags=re.IGNORECASE | re.DOTALL)
        match = pattern.search(text)
        return _limit(_clean_line(match.group(1)), 600) if match else ""

    def _extract_title(self, text: str, headings: list[str]) -> str:
        lines = [line for line in text.splitlines() if line]
        for index, line in enumerate(lines[:20]):
            if _contains_any(line, ("题 目", "课题", "论文题目")):
                title_parts = [re.sub(r"^题\s*目\s*", "", line).strip()]
                for next_line in lines[index + 1 : index + 4]:
                    if _contains_any(next_line, ("学院", "专业", "学生", "指导教师", "教务处", "摘要", "目录")):
                        break
                    if 4 <= len(next_line) <= 36:
                        title_parts.append(next_line.strip())
                combined = "".join(part for part in title_parts if part)
                if combined:
                    return _limit(combined, 72)
        candidates: list[str] = []
        for line in lines[:60]:
            if any(term in line for term in BOILERPLATE_TERMS):
                continue
            if _contains_any(line, ("专业", "学生", "指导老师", "日期", "Key Words", "Abstract", "关键词", "摘要")):
                continue
            if len(line) >= 10:
                candidates.append(line)
        for candidate in candidates:
            if "——" in candidate or " - " in candidate or "研究" in candidate or "数据" in candidate:
                return _limit(candidate, 72)
        for candidate in candidates:
            if re.search(r"[A-Za-z]{3,}", candidate):
                return _limit(candidate, 72)
        return _limit(headings[0].split(" ", 1)[-1], 72) if headings else "AI 生成演示文稿"

    def _extract_headings(self, text: str) -> list[str]:
        headings: list[str] = []
        for raw in text.splitlines():
            line = _clean_line(raw.strip("[]"))
            line = re.sub(r"\s+\d+\s*$", "", line).strip()
            line = re.sub(r"^#+\s*", "", line)
            match = re.match(r"^(\d+(?:\.\d+)*)\s+(.+)$", line)
            if match and not any(term in match.group(2) for term in BOILERPLATE_TERMS):
                headings.append(f"{match.group(1)} {match.group(2).strip()}")
        return _dedupe(headings)

    def _extract_keywords(self, text: str) -> list[str]:
        for label in ("关键词", "Key Words", "Keywords"):
            match = re.search(rf"(?:^|\n)\s*{re.escape(label)}\s*[:：]?\s*(.+)", text, flags=re.IGNORECASE)
            if match:
                return _dedupe([_limit(item.strip(), 24) for item in re.split(r"[;；,，、/]+", _clean_line(match.group(1))) if item.strip()])[:6]
        return []

    def _extract_tools(self, text: str) -> list[str]:
        mapping = {"八爪鱼采集器": r"八爪鱼|collector|crawler|爬虫", "Excel": r"excel", "SPSS": r"spss", "Power BI": r"power\s*bi", "可视化": r"可视化|visual"}
        return [label for label, pattern in mapping.items() if re.search(pattern, text, flags=re.IGNORECASE)]

    def _extract_quoted_entities(self, text: str) -> list[str]:
        return _dedupe([item.strip() for item in re.findall(r"[“\"]([^\"”]{2,30})[”\"]", text) if item.strip()])

    def _extract_body_sentences(self, text: str) -> list[str]:
        items: list[str] = []
        for line in text.splitlines():
            if not line or any(term in line for term in BOILERPLATE_TERMS):
                continue
            if _contains_any(line, ("摘要", "关键词", "Abstract", "Key Words", "Keywords", "Limitation:", "目录")):
                continue
            if re.match(r"^\d+(?:\.\d+)*\s+.+\s+\d+$", line):
                continue
            if re.match(r"^\d+(?:\.\d+)*\s+.+$", line):
                items.append(line)
            elif len(line) >= 18:
                items.extend(_split_sentences(line))
            if len(items) >= 40:
                break
        return _dedupe(items)[:40]

    def _build_bullet_pool(self, abstract_sentences: list[str], body_sentences: list[str], headings: list[str]) -> list[str]:
        pool = abstract_sentences + [heading.split(" ", 1)[-1] for heading in headings] + body_sentences
        return _dedupe([_limit(item, 96) for item in pool if len(item) >= 8])

    def _pick_sentences(self, sentences: list[str], keywords: tuple[str, ...], limit: int) -> list[str]:
        selected = _dedupe([sentence for sentence in sentences if _contains_any(sentence, keywords)])
        chinese_first = [sentence for sentence in selected if any("\u4e00" <= ch <= "\u9fff" for ch in sentence)]
        return (chinese_first or selected)[:limit]

    def _section(self, title: str, summary: str, matched: list[str], fallback: list[str]) -> dict[str, list[str] | str]:
        return {"title": title, "summary": summary, "matched": matched, "fallback": fallback}

    def _fit_academic_sections(self, sections: list[dict[str, list[str] | str]], slides_needed: int) -> list[dict[str, list[str] | str]]:
        if slides_needed >= len(sections):
            return sections[:slides_needed]
        if slides_needed == 4:
            return sections[:3] + [self._merge_sections("优化建议与研究结论", sections[3], sections[4])]
        if slides_needed == 3:
            return [self._merge_sections("研究背景与方法设计", sections[0], sections[1]), self._merge_sections("数据发现与问题定位", sections[2], sections[3]), sections[4]]
        if slides_needed == 2:
            return [self._merge_sections("研究框架与核心发现", sections[0], sections[1], sections[2]), self._merge_sections("优化建议与结论", sections[3], sections[4])]
        if slides_needed <= 1:
            return [self._merge_sections("研究综述", *sections)]
        return sections[:slides_needed]

    def _merge_sections(self, merged_title: str, *sections: dict[str, list[str] | str]) -> dict[str, list[str] | str]:
        summary = "；".join(str(section["summary"]) for section in sections if section.get("summary"))
        matched: list[str] = []
        fallback: list[str] = []
        for section in sections:
            matched.extend(section.get("matched", []))
            fallback.extend(section.get("fallback", []))
        return {"title": merged_title, "summary": _limit(summary, 96), "matched": _dedupe(matched), "fallback": _dedupe(fallback)}

    def _compose_bullets(self, items: list[str], limit: int) -> list[str]:
        bullets: list[str] = []
        for item in items:
            cleaned = _limit(_clean_line(item), 72)
            if len(cleaned) < 6:
                continue
            if cleaned.endswith(":") or cleaned.endswith("："):
                continue
            if _contains_any(cleaned, ("摘要：", "Abstract:", "Key Words:", "Limitation:", "本人郑重声明", "授权书")):
                continue
            if any(term in cleaned for term in BOILERPLATE_TERMS):
                continue
            bullets.append(cleaned)
        return _dedupe(bullets)[:limit] or ["突出本页最关键的结论、依据和下一步动作。"]

    def _speaker_notes(self, title: str, summary: str, bullets: list[str]) -> str:
        return f"本页围绕“{title}”展开。先用一句话说明：{summary}。随后依次展开：{'；'.join(bullets)}。结束时过渡到下一页。"

    def _resolve_colors(self, colors: list[str]) -> list[str]:
        resolved = [item for item in colors if isinstance(item, str) and item.strip()]
        while len(resolved) < len(DEFAULT_COLORS):
            resolved.append(DEFAULT_COLORS[len(resolved)])
        return resolved[: len(DEFAULT_COLORS)]
