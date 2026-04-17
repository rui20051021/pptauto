from __future__ import annotations

import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ["PPT_UI_MODEL_PROVIDER"] = "mock"
os.environ["PPT_UI_DATABASE_URL"] = "sqlite:///./var/test_ui.db"
os.environ["PPT_UI_JOB_INLINE"] = "true"
os.environ["PPT_UI_MODEL_RUNTIME_CONFIG_PATH"] = "./var/test_model_runtime_config.json"

from app.services.models_gateway import ModelGateway  # noqa: E402


def sample_wizard(page_count: int = 6) -> dict:
    return {
        "canvas_format": "ppt169",
        "page_count": page_count,
        "target_audience": "????",
        "use_case": "做一个论文答辩 PPT",
        "style_objective": "consulting",
        "color_scheme": ["#F8FAFC", "#E2E8F0", "#0F172A", "#2563EB", "#0EA5E9"],
        "template_mode": "free",
        "template_name": None,
        "icon_strategy": "builtin",
        "icon_library": "chunk",
        "typography_title_font": "Microsoft YaHei",
        "typography_body_font": "Calibri",
        "body_font_size": 24,
        "image_strategy": "none",
        "theme_mode": "light",
        "accent_tone": "专业稳重",
        "additional_instructions": "重点讲研究背景、方法、分析发现、优化策略和结论",
    }


def academic_markdown() -> str:
    return """
成都锦城学院
毕业论文（设计）学术声明
版权使用授权书

数据采集与分析在喜马拉雅历史有声书中的应用——以“王更新”账号为例

摘要：当下音频消费快速发展，“耳朵经济”热度持续提升，但历史类有声书账号的精细化运营研究相对不足。本文以喜马拉雅“王更新”账号为研究对象，采用多维度数据采集与分析方法，结合 Excel 清洗、SPSS 建模和 Power BI 可视化，识别账号在内容更新和用户互动方面的优化空间。研究结果表明，历史类内容市场头部效应明显，账号需要通过差异化内容和互动升级来提升运营效果。后续可继续扩展样本范围并探索跨平台融合方向。
关键词：喜马拉雅；历史有声书；数据分析；账号运营

Abstract: With the rapid development of audio consumption, the study focuses on the "Wang Gengxin" account on Ximalaya. It adopts multi-dimensional data collection and analysis, including Excel cleaning, SPSS modeling, and Power BI visualization. The findings show a strong head effect in the market and highlight room for improvement in content updates and user engagement. Future work can expand the sample size and explore cross-platform operations.
Key Words: Ximalaya; Historical Audiobooks; Data Analysis; Account Operation

1 绪论
1.1 研究背景和意义
1.2 研究内容与思路
2 理论概述
3 账号现状分析
4 数据采集与分析应用
5 营销策略优化
6 总结与展望
"""


def test_gateway_builds_defense_plan_from_academic_markdown():
    gateway = ModelGateway()
    plan = gateway.build_design_plan("论文", sample_wizard(), academic_markdown())

    titles = [slide.title for slide in plan.slides]
    assert len(plan.slides) == 6
    assert titles[0].startswith("数据采集与分析")
    assert "研究背景" in titles[1]
    assert "方法" in titles[2]
    assert "发现" in titles[3]
    assert "策略" in titles[4]
    assert "结论" in titles[5]

    joined = "\n".join("\n".join(slide.bullets) for slide in plan.slides)
    assert "学术声明" not in joined
    assert "版权使用授权书" not in joined
    assert "本人郑重声明" not in joined
    assert "????" not in plan.slides[0].summary


def test_gateway_repairs_mojibake_source_text():
    gateway = ModelGateway()
    garbled = academic_markdown().encode("utf-8").decode("latin1")
    plan = gateway.build_design_plan("论文", sample_wizard(), garbled)

    assert len(plan.slides) == 6
    assert gateway.last_build_details["source_repaired"] is True
    assert any("研究背景" in slide.title for slide in plan.slides)


def test_render_design_spec_uses_real_values():
    gateway = ModelGateway()
    wizard = sample_wizard()
    plan = gateway.build_design_plan("论文", wizard, academic_markdown())
    rendered = gateway.render_design_spec("论文", gateway._prepare_wizard(wizard, gateway._build_source_context(academic_markdown())), plan)

    assert "[Filled by Strategist]" not in rendered
    assert "受众：" in rendered
    assert "做一个论文答辩 PPT" in rendered
