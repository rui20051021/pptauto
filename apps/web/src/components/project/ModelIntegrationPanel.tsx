import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { AsyncFeedback, ModelIntegration } from "../../types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { StatusBadge } from "../ui/StatusBadge";

type ModelIntegrationPanelProps = {
  token: string;
};

type FormState = {
  provider: "mock" | "openai";
  model_name: string;
  base_url: string;
  api_key: string;
};

const idleFeedback: AsyncFeedback = { status: "idle" };

function toFormState(model: ModelIntegration | null): FormState {
  return {
    provider: model?.requested_provider === "openai" ? "openai" : "mock",
    model_name: model?.model_name || "gpt-4.1-mini",
    base_url: model?.base_url || "",
    api_key: "",
  };
}

export function ModelIntegrationPanel({ token }: ModelIntegrationPanelProps) {
  const [model, setModel] = useState<ModelIntegration | null>(null);
  const [form, setForm] = useState<FormState>(toFormState(null));
  const [loadState, setLoadState] = useState<AsyncFeedback>({ status: "loading" });
  const [saveState, setSaveState] = useState<AsyncFeedback>(idleFeedback);
  const [testState, setTestState] = useState<AsyncFeedback>(idleFeedback);

  useEffect(() => {
    let isActive = true;
    async function load() {
      try {
        const next = await api.getModelIntegration(token);
        if (!isActive) {
          return;
        }
        setModel(next);
        setForm(toFormState(next));
        setLoadState({ status: "success" });
      } catch (error) {
        if (!isActive) {
          return;
        }
        setLoadState({ status: "error", message: error instanceof Error ? error.message : "加载模型接入配置失败。" });
      }
    }
    void load();
    return () => {
      isActive = false;
    };
  }, [token]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    setSaveState({ status: "loading" });
    try {
      const payload = {
        provider: form.provider,
        model_name: form.model_name.trim(),
        base_url: form.base_url.trim(),
        ...(form.api_key.trim() ? { api_key: form.api_key.trim() } : {}),
      };
      const next = await api.saveModelIntegration(token, payload);
      setModel(next);
      setForm((current) => ({ ...current, api_key: "", model_name: next.model_name, base_url: next.base_url || "" }));
      setSaveState({ status: "success", message: next.using_external_ai ? "模型配置已保存，当前会走外部 AI。" : "模型配置已保存。" });
    } catch (error) {
      setSaveState({ status: "error", message: error instanceof Error ? error.message : "保存模型接入配置失败。" });
    }
  }

  async function handleClearKey() {
    setSaveState({ status: "loading" });
    try {
      const next = await api.saveModelIntegration(token, {
        provider: form.provider,
        model_name: form.model_name.trim(),
        base_url: form.base_url.trim(),
        clear_api_key: true,
      });
      setModel(next);
      setForm((current) => ({ ...current, api_key: "" }));
      setSaveState({ status: "success", message: "已清空 API Key。" });
    } catch (error) {
      setSaveState({ status: "error", message: error instanceof Error ? error.message : "清空 API Key 失败。" });
    }
  }

  async function handleTest() {
    setTestState({ status: "loading" });
    try {
      const result = await api.testModelIntegration(token);
      setTestState({ status: "success", message: `连接成功，模型返回：${result.reply}` });
    } catch (error) {
      setTestState({ status: "error", message: error instanceof Error ? error.message : "测试连接失败。" });
    }
  }

  const statusText = model?.using_external_ai
    ? "当前生成链路会直接调用外部 AI。"
    : model?.requested_provider === "openai"
      ? "已切换到 OpenAI 兼容模式，但还缺少可用的 API Key，当前仍会回退到本地智能规划。"
      : "当前仍在使用本地智能规划。";

  return (
    <Card eyebrow="模型接入" title="接入 GPT / OpenAI 兼容接口">
      <div className="panel-stack">
        <p className="section-copy">
          支持 OpenAI 官方接口和兼容接口。Base URL 留空时走官方默认地址；如果你接的是兼容服务，请填它的 `/v1` 地址。
        </p>

        {loadState.status === "error" ? <p className="feedback feedback-error">{loadState.message}</p> : null}

        <div className="model-status-row">
          <div className="model-status-copy">
            <strong>{statusText}</strong>
            <span>
              当前请求提供方：{model?.requested_provider === "openai" ? "OpenAI 兼容" : "本地智能规划"}；实际生效：{model?.using_external_ai ? "外部 AI" : "本地智能规划"}
            </span>
            {model?.api_key_masked ? <span>已保存密钥：{model.api_key_masked}</span> : null}
          </div>
          <StatusBadge status={model?.using_external_ai ? "success" : "idle"} />
        </div>

        <div className="field-grid">
          <label>
            模型提供方
            <select value={form.provider} onChange={(event) => updateField("provider", event.target.value as "mock" | "openai")}>
              <option value="mock">本地智能规划</option>
              <option value="openai">OpenAI 兼容</option>
            </select>
          </label>
          <label>
            模型名称
            <input value={form.model_name} onChange={(event) => updateField("model_name", event.target.value)} placeholder="gpt-4.1-mini" />
          </label>
          <label className="field-span-2">
            Base URL
            <input value={form.base_url} onChange={(event) => updateField("base_url", event.target.value)} placeholder="https://api.openai.com/v1" />
          </label>
          <label className="field-span-2">
            API Key
            <input
              type="password"
              value={form.api_key}
              onChange={(event) => updateField("api_key", event.target.value)}
              placeholder={model?.api_key_masked ? "留空则保持当前密钥不变" : "输入你的 API Key"}
            />
          </label>
        </div>

        <div className="inline-actions">
          <Button onClick={() => void handleSave()} isLoading={saveState.status === "loading"} loadingLabel="正在保存...">
            保存模型配置
          </Button>
          <Button variant="secondary" onClick={() => void handleTest()} isLoading={testState.status === "loading"} loadingLabel="正在测试...">
            测试连接
          </Button>
          <Button variant="ghost" onClick={() => void handleClearKey()}>
            清空密钥
          </Button>
        </div>

        {saveState.message ? <p className={`feedback feedback-${saveState.status === "error" ? "error" : "success"}`}>{saveState.message}</p> : null}
        {testState.message ? <p className={`feedback feedback-${testState.status === "error" ? "error" : "success"}`}>{testState.message}</p> : null}
      </div>
    </Card>
  );
}
