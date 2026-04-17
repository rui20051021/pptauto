from __future__ import annotations

import os
import sys
from io import BytesIO
from pathlib import Path

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

TEST_DB = Path(__file__).resolve().parents[3] / "var" / "test_ui.db"
if TEST_DB.exists():
    TEST_DB.unlink()
TEST_MODEL_CONFIG = Path(__file__).resolve().parents[3] / "var" / "test_model_runtime_config.json"
if TEST_MODEL_CONFIG.exists():
    TEST_MODEL_CONFIG.unlink()

os.environ["PPT_UI_DATABASE_URL"] = "sqlite:///./var/test_ui.db"
os.environ["PPT_UI_JOB_INLINE"] = "true"
os.environ["PPT_UI_MODEL_PROVIDER"] = "mock"
os.environ["PPT_UI_MODEL_RUNTIME_CONFIG_PATH"] = "./var/test_model_runtime_config.json"

from app.main import create_app  # noqa: E402


def auth_headers(client: TestClient, email: str) -> dict[str, str]:
    response = client.post("/api/auth/register", json={"email": email, "password": "strong-pass-123"})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_me_endpoint_matches_spec():
    app = create_app()
    with TestClient(app) as client:
        headers = auth_headers(client, "me@example.com")
        response = client.get("/api/me", headers=headers)
        assert response.status_code == 200
        assert response.json()["email"] == "me@example.com"


def test_project_generation_flow():
    app = create_app()
    with TestClient(app) as client:
        headers = auth_headers(client, "user@example.com")

        project_resp = client.post(
            "/api/projects",
            json={"name": "Demo Project", "description": "test", "canvas_format": "ppt169", "template_mode": "free"},
            headers=headers,
        )
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]

        upload_resp = client.post(
            f"/api/projects/{project_id}/sources",
            files={"files": ("report.md", BytesIO(b"# Report\n\n- Revenue growth\n- Margin expansion\n- Next steps"), "text/markdown")},
            headers=headers,
        )
        assert upload_resp.status_code == 200

        wizard_resp = client.post(
            f"/api/projects/{project_id}/wizard",
            json={
                "canvas_format": "ppt169",
                "page_count": 4,
                "target_audience": "Management",
                "use_case": "Quarterly review",
                "style_objective": "general",
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
                "accent_tone": "professional",
                "additional_instructions": "Keep it concise",
            },
            headers=headers,
        )
        assert wizard_resp.status_code == 200

        run_resp = client.post(f"/api/projects/{project_id}/generate", json={}, headers=headers)
        assert run_resp.status_code == 202
        run_id = run_resp.json()["id"]

        run_detail = client.get(f"/api/runs/{run_id}", headers=headers)
        assert run_detail.status_code == 200
        assert run_detail.json()["status"] == "completed"

        logs_resp = client.get(f"/api/runs/{run_id}/logs", headers=headers)
        assert logs_resp.status_code == 200
        assert len(logs_resp.json()) >= 4

        runs_resp = client.get(f"/api/projects/{project_id}/runs", headers=headers)
        assert runs_resp.status_code == 200
        assert runs_resp.json()[0]["id"] == run_id

        slides_resp = client.get(f"/api/projects/{project_id}/slides", headers=headers)
        assert slides_resp.status_code == 200
        assert len(slides_resp.json()) == 4
        assert all(not item["title"].startswith("slide_") for item in slides_resp.json())

        artifacts_resp = client.get(f"/api/projects/{project_id}/artifacts", headers=headers)
        assert artifacts_resp.status_code == 200
        artifacts = artifacts_resp.json()
        types = {item["artifact_type"] for item in artifacts}
        assert "pptx" in types or "pptx_snapshot" in types
        download_target = artifacts[0]
        token = headers["Authorization"].split(" ", 1)[1]
        download_resp = client.get(f"{download_target['download_url']}?access_token={token}")
        assert download_resp.status_code == 200
        assert "filename*=" in download_resp.headers["content-disposition"]

        summary_resp = client.get(f"/api/projects/{project_id}/summary", headers=headers)
        assert summary_resp.status_code == 200
        summary = summary_resp.json()
        assert summary["project_id"] == project_id
        assert summary["source_count"] == 1
        assert summary["slide_count"] == 4
        assert summary["run_count"] >= 1


def test_project_access_is_user_scoped():
    app = create_app()
    with TestClient(app) as client:
        owner_headers = auth_headers(client, "owner@example.com")
        outsider_headers = auth_headers(client, "outsider@example.com")

        project_resp = client.post(
            "/api/projects",
            json={"name": "Private Project", "description": "restricted", "canvas_format": "ppt169", "template_mode": "free"},
            headers=owner_headers,
        )
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]

        forbidden_resp = client.get(f"/api/projects/{project_id}", headers=outsider_headers)
        assert forbidden_resp.status_code == 404


def test_model_integration_settings_endpoints():
    app = create_app()
    with TestClient(app) as client:
        headers = auth_headers(client, "settings@example.com")

        initial = client.get("/api/settings/model", headers=headers)
        assert initial.status_code == 200
        assert initial.json()["effective_provider"] == "mock"
        assert initial.json()["using_external_ai"] is False
        failed_test = client.post("/api/settings/model/test", json={}, headers=headers)
        assert failed_test.status_code == 400

        update = client.put(
            "/api/settings/model",
            json={
                "provider": "openai",
                "model_name": "gpt-4.1-mini",
                "base_url": "https://example.com/v1",
                "api_key": "sk-test-1234567890",
            },
            headers=headers,
        )
        assert update.status_code == 200
        payload = update.json()
        assert payload["requested_provider"] == "openai"
        assert payload["effective_provider"] == "openai"
        assert payload["using_external_ai"] is True
        assert payload["api_key_masked"]

        reset = client.put(
            "/api/settings/model",
            json={"provider": "mock", "clear_api_key": True, "base_url": ""},
            headers=headers,
        )
        assert reset.status_code == 200
        reset_payload = reset.json()
        assert reset_payload["requested_provider"] == "mock"
        assert reset_payload["effective_provider"] == "mock"


def test_project_can_generate_from_text_brief_only():
    app = create_app()
    with TestClient(app) as client:
        headers = auth_headers(client, "brief@example.com")

        project_resp = client.post(
            "/api/projects",
            json={"name": "Brief Only Project", "description": "text only", "canvas_format": "ppt169", "template_mode": "free"},
            headers=headers,
        )
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]

        wizard_resp = client.post(
            f"/api/projects/{project_id}/wizard",
            json={
                "canvas_format": "ppt169",
                "page_count": 5,
                "target_audience": "管理层",
                "use_case": "季度经营复盘",
                "style_objective": "consulting",
                "color_scheme": ["#0F172A", "#1E293B", "#E2E8F0", "#38BDF8", "#22C55E"],
                "template_mode": "free",
                "template_name": None,
                "icon_strategy": "builtin",
                "icon_library": "chunk",
                "typography_title_font": "Microsoft YaHei",
                "typography_body_font": "Calibri",
                "body_font_size": 24,
                "image_strategy": "none",
                "theme_mode": "dark",
                "accent_tone": "理性克制",
                "additional_instructions": "做一份给管理层看的 5 页季度经营复盘 PPT，重点讲收入、利润、风险和下季度动作。",
            },
            headers=headers,
        )
        assert wizard_resp.status_code == 200

        run_resp = client.post(f"/api/projects/{project_id}/generate", json={}, headers=headers)
        assert run_resp.status_code == 202
        run_id = run_resp.json()["id"]

        run_detail = client.get(f"/api/runs/{run_id}", headers=headers)
        assert run_detail.status_code == 200
        assert run_detail.json()["status"] == "completed"

        slides_resp = client.get(f"/api/projects/{project_id}/slides", headers=headers)
        assert slides_resp.status_code == 200
        assert len(slides_resp.json()) == 5

        summary_resp = client.get(f"/api/projects/{project_id}/summary", headers=headers)
        assert summary_resp.status_code == 200
        summary = summary_resp.json()
        assert summary["source_count"] == 0
        assert summary["slide_count"] == 5


def test_slides_and_artifacts_follow_selected_run():
    app = create_app()
    with TestClient(app) as client:
        headers = auth_headers(client, "multirun@example.com")

        project_resp = client.post(
            "/api/projects",
            json={"name": "Multi Run Project", "description": "multiple runs", "canvas_format": "ppt169", "template_mode": "free"},
            headers=headers,
        )
        assert project_resp.status_code == 201
        project_id = project_resp.json()["id"]

        wizard_base = {
            "canvas_format": "ppt169",
            "target_audience": "管理层",
            "use_case": "经营复盘",
            "style_objective": "general",
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
        }

        first_wizard = {**wizard_base, "page_count": 4, "additional_instructions": "先生成 4 页版本"}
        second_wizard = {**wizard_base, "page_count": 6, "additional_instructions": "再生成 6 页版本"}

        save_first = client.post(f"/api/projects/{project_id}/wizard", json=first_wizard, headers=headers)
        assert save_first.status_code == 200
        first_run = client.post(f"/api/projects/{project_id}/generate", json={}, headers=headers)
        assert first_run.status_code == 202
        first_run_id = first_run.json()["id"]

        save_second = client.post(f"/api/projects/{project_id}/wizard", json=second_wizard, headers=headers)
        assert save_second.status_code == 200
        second_run = client.post(f"/api/projects/{project_id}/generate", json={}, headers=headers)
        assert second_run.status_code == 202
        second_run_id = second_run.json()["id"]

        latest_slides = client.get(f"/api/projects/{project_id}/slides", headers=headers)
        assert latest_slides.status_code == 200
        assert len(latest_slides.json()) == 6

        first_slides = client.get(f"/api/projects/{project_id}/slides?run_id={first_run_id}", headers=headers)
        assert first_slides.status_code == 200
        assert len(first_slides.json()) == 4
        assert all(not item["title"].startswith("slide_") for item in first_slides.json())

        second_slides = client.get(f"/api/projects/{project_id}/slides?run_id={second_run_id}", headers=headers)
        assert second_slides.status_code == 200
        assert len(second_slides.json()) == 6
        assert all(not item["title"].startswith("slide_") for item in second_slides.json())

        latest_artifacts = client.get(f"/api/projects/{project_id}/artifacts", headers=headers)
        assert latest_artifacts.status_code == 200
        assert latest_artifacts.json()

        first_artifacts = client.get(f"/api/projects/{project_id}/artifacts?run_id={first_run_id}", headers=headers)
        assert first_artifacts.status_code == 200
        assert first_artifacts.json()

        summary_resp = client.get(f"/api/projects/{project_id}/summary", headers=headers)
        assert summary_resp.status_code == 200
        summary = summary_resp.json()
        assert summary["slide_count"] == 6
        assert summary["run_count"] == 2
