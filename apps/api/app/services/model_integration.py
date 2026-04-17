from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass

import requests

from ..core.config import settings


@dataclass
class ResolvedModelIntegration:
    requested_provider: str
    effective_provider: str
    model_name: str
    base_url: str | None
    api_key: str | None
    configured: bool
    using_external_ai: bool
    source: str
    wire_api: str = "chat_completions"
    warning_code: str | None = None

    @property
    def api_key_masked(self) -> str | None:
        if not self.api_key:
            return None
        if len(self.api_key) <= 8:
            return "*" * len(self.api_key)
        return f"{self.api_key[:4]}{'*' * max(len(self.api_key) - 8, 4)}{self.api_key[-4:]}"


def _runtime_path():
    path = settings.model_runtime_config_path
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _normalize_base_url(value: str | None) -> str | None:
    stripped = (value or "").strip()
    if not stripped:
        return None
    if re.match(r"^[a-z]+://", stripped, flags=re.IGNORECASE):
        return stripped.rstrip("/")
    return f"http://{stripped.lstrip('/')}".rstrip("/")


def _infer_wire_api(runtime: dict, requested_provider: str, base_url: str | None) -> str:
    explicit = str(runtime.get("wire_api") or "").strip().lower().replace("-", "_")
    if explicit in {"chat_completions", "responses"}:
        return explicit
    normalized = (base_url or "").lower()
    if requested_provider == "openai" and (":48760" in normalized or "localhost:48760" in normalized):
        return "responses"
    return "chat_completions"


def _build_headers(api_key: str, *, accept: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": accept,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    }


def _chat_completions_url(base_url: str) -> str:
    return f"{base_url.rstrip('/')}/chat/completions"


def _responses_url(base_url: str) -> str:
    normalized = base_url.rstrip("/")
    if normalized.endswith("/v1"):
        normalized = normalized[:-3]
    return f"{normalized}/responses"


def _extract_message_text(payload: object) -> str:
    if isinstance(payload, str):
        return payload.strip()
    if isinstance(payload, list):
        chunks: list[str] = []
        for item in payload:
            if isinstance(item, dict):
                if item.get("type") in {"text", "output_text", "input_text"} and item.get("text"):
                    chunks.append(str(item["text"]))
            elif isinstance(item, str):
                chunks.append(item)
        return "".join(chunks).strip()
    return ""


def read_runtime_model_config() -> dict:
    path = _runtime_path()
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    return payload if isinstance(payload, dict) else {}


def write_runtime_model_config(payload: dict) -> None:
    path = _runtime_path()
    sanitized = {key: value for key, value in payload.items() if value not in ("", None)}
    if not sanitized:
        if path.exists():
            path.unlink()
        return
    path.write_text(json.dumps(sanitized, ensure_ascii=False, indent=2), encoding="utf-8")


def resolve_model_integration() -> ResolvedModelIntegration:
    runtime = read_runtime_model_config()

    env_provider = (settings.model_provider or "mock").lower().strip()
    env_model_name = settings.model_name or "gpt-4.1-mini"
    env_api_key = settings.model_api_key or os.getenv("OPENAI_API_KEY")
    env_base_url = settings.model_base_url or os.getenv("OPENAI_BASE_URL")

    requested_provider = str(runtime.get("provider") or env_provider or "mock").lower().strip()
    model_name = str(runtime.get("model_name") or env_model_name or "gpt-4.1-mini").strip()
    api_key = runtime.get("api_key") if "api_key" in runtime else env_api_key
    base_url = _normalize_base_url(runtime.get("base_url") if "base_url" in runtime else env_base_url)
    source = "runtime_file" if runtime else "environment"
    wire_api = _infer_wire_api(runtime, requested_provider, base_url)

    using_external_ai = requested_provider == "openai" and bool(api_key)
    effective_provider = "openai" if using_external_ai else "mock"
    warning_code = None
    if requested_provider == "openai" and not api_key:
        warning_code = "missing_api_key"

    return ResolvedModelIntegration(
        requested_provider=requested_provider,
        effective_provider=effective_provider,
        model_name=model_name,
        base_url=base_url,
        api_key=api_key,
        configured=bool(api_key),
        using_external_ai=using_external_ai,
        source=source,
        wire_api=wire_api,
        warning_code=warning_code,
    )


def update_model_integration(
    *,
    provider: str | None = None,
    model_name: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    clear_api_key: bool = False,
) -> ResolvedModelIntegration:
    runtime = read_runtime_model_config()

    if provider is not None:
        runtime["provider"] = provider
    if model_name is not None:
        runtime["model_name"] = model_name.strip()
    if base_url is not None:
        stripped = (_normalize_base_url(base_url) or "").strip()
        if stripped:
            runtime["base_url"] = stripped
        else:
            runtime.pop("base_url", None)
    if clear_api_key:
        runtime.pop("api_key", None)
    elif api_key is not None:
        stripped = api_key.strip()
        if stripped:
            runtime["api_key"] = stripped

    write_runtime_model_config(runtime)
    return resolve_model_integration()


def _request_chat_completion(
    resolved: ResolvedModelIntegration,
    *,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int | None = None,
    require_json: bool = False,
) -> str:
    if not resolved.api_key or not resolved.base_url:
        raise ValueError("当前未配置外部 AI 地址或 API Key。")
    payload: dict[str, object] = {
        "model": resolved.model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    if require_json:
        payload["response_format"] = {"type": "json_object"}
    response = requests.post(
        _chat_completions_url(resolved.base_url),
        headers=_build_headers(resolved.api_key, accept="application/json"),
        json=payload,
        timeout=120,
    )
    response.raise_for_status()
    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise ValueError("外部 AI 已响应，但未返回候选结果。")
    content = _extract_message_text(((choices[0] or {}).get("message") or {}).get("content"))
    if not content:
        raise ValueError("外部 AI 已响应，但返回内容为空。")
    return content


def _request_responses_api(
    resolved: ResolvedModelIntegration,
    *,
    system_prompt: str,
    user_prompt: str,
) -> str:
    if not resolved.api_key or not resolved.base_url:
        raise ValueError("当前未配置外部 AI 地址或 API Key。")
    payload = {
        "model": resolved.model_name,
        "instructions": system_prompt,
        "input": [
            {
                "role": "user",
                "content": [{"type": "input_text", "text": user_prompt}],
            }
        ],
        "store": False,
        "stream": True,
    }
    text = ""
    with requests.post(
        _responses_url(resolved.base_url),
        headers=_build_headers(resolved.api_key, accept="text/event-stream"),
        json=payload,
        timeout=180,
        stream=True,
    ) as response:
        response.raise_for_status()
        for raw_line in response.iter_lines():
            if not raw_line:
                continue
            line = raw_line.decode("utf-8", errors="ignore")
            if not line.startswith("data: "):
                continue
            try:
                event = json.loads(line[6:])
            except json.JSONDecodeError:
                continue
            event_type = str(event.get("type") or "")
            if event_type == "response.output_text.delta":
                text += str(event.get("delta") or "")
            elif event_type == "response.output_text.done" and not text:
                text = str(event.get("text") or "")
    cleaned = text.strip()
    if not cleaned:
        raise ValueError("外部 AI 已响应，但未返回文本内容。")
    return cleaned


def request_model_text(
    resolved: ResolvedModelIntegration,
    *,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int | None = None,
    require_json: bool = False,
) -> str:
    if resolved.wire_api == "responses":
        return _request_responses_api(resolved, system_prompt=system_prompt, user_prompt=user_prompt)
    return _request_chat_completion(
        resolved,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        max_tokens=max_tokens,
        require_json=require_json,
    )


def test_model_integration() -> tuple[ResolvedModelIntegration, str]:
    resolved = resolve_model_integration()
    if resolved.requested_provider != "openai":
        raise ValueError("当前未启用外部 AI 提供方，请先切换到 OpenAI 兼容。")
    if not resolved.api_key:
        raise ValueError("当前未配置 API Key，无法连接外部 AI。")

    reply = request_model_text(
        resolved,
        system_prompt="You are a connectivity test endpoint. Reply with OK only.",
        user_prompt="Reply with OK",
        max_tokens=8,
    )
    if not reply:
        raise ValueError("外部 AI 已响应，但返回内容为空。")
    return resolved, reply


def model_integration_payload(resolved: ResolvedModelIntegration) -> dict:
    return {
        "requested_provider": resolved.requested_provider,
        "effective_provider": resolved.effective_provider,
        "model_name": resolved.model_name,
        "base_url": resolved.base_url,
        "configured": resolved.configured,
        "using_external_ai": resolved.using_external_ai,
        "api_key_masked": resolved.api_key_masked,
        "source": resolved.source,
        "wire_api": resolved.wire_api,
        "warning_code": resolved.warning_code,
    }
