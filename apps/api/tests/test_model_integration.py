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

from app.services import model_integration  # noqa: E402


def test_resolve_model_integration_detects_codexmanager_gateway():
    model_integration.write_runtime_model_config(
        {
            "provider": "openai",
            "model_name": "gpt-5.4",
            "base_url": "127.0.0.1:48760/v1",
            "api_key": "test-token",
        }
    )

    resolved = model_integration.resolve_model_integration()

    assert resolved.base_url == "http://127.0.0.1:48760/v1"
    assert resolved.wire_api == "responses"
    assert resolved.effective_provider == "openai"

    model_integration.write_runtime_model_config({})


def test_request_model_text_parses_streaming_responses_events(monkeypatch):
    class FakeResponse:
        status_code = 200

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def raise_for_status(self):
            return None

        def iter_lines(self):
            events = [
                b'event: response.created',
                b'data: {"type":"response.created"}',
                b"",
                b'event: response.output_text.delta',
                b'data: {"type":"response.output_text.delta","delta":"{\\"ok\\": "}',
                b"",
                b'event: response.output_text.delta',
                b'data: {"type":"response.output_text.delta","delta":"true}"}',
                b"",
                b'event: response.completed',
                b'data: {"type":"response.completed"}',
            ]
            return iter(events)

    def fake_post(*args, **kwargs):
        return FakeResponse()

    monkeypatch.setattr(model_integration.requests, "post", fake_post)

    resolved = model_integration.ResolvedModelIntegration(
        requested_provider="openai",
        effective_provider="openai",
        model_name="gpt-5.4",
        base_url="http://127.0.0.1:48760/v1",
        api_key="token",
        configured=True,
        using_external_ai=True,
        source="runtime_file",
        wire_api="responses",
    )

    text = model_integration.request_model_text(
        resolved,
        system_prompt="Return JSON only.",
        user_prompt="Return {\"ok\": true}.",
        require_json=True,
    )

    assert text == '{"ok": true}'
