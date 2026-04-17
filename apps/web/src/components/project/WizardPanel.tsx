import { useEffect, useState } from "react";
import type { AsyncFeedback, WizardConfig } from "../../types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

type WizardPanelProps = {
  value: WizardConfig;
  saveFeedback: AsyncFeedback;
  generateFeedback: AsyncFeedback;
  isDirty: boolean;
  onChange: (value: WizardConfig) => void;
  onSave: () => Promise<boolean>;
  onGenerate: () => Promise<void>;
};

type WizardStep = {
  id: string;
  title: string;
  hint: string;
};

const STEPS: WizardStep[] = [
  { id: "canvas", title: "画布格式", hint: "确定这份 PPT 的基础尺寸和生成方式。" },
  { id: "count", title: "页数设置", hint: "设定期望生成的页面数量与主题模式。" },
  { id: "audience", title: "目标受众", hint: "说明这份内容主要给谁看。" },
  { id: "scenario", title: "使用场景", hint: "描述汇报、培训或提案的具体场景。" },
  { id: "style", title: "风格目标", hint: "决定整体表达方式与视觉气质。" },
  { id: "color", title: "颜色方案", hint: "选择简洁、可读的配色方案。" },
  { id: "icons", title: "图标策略", hint: "控制图标来源和展示密度。" },
  { id: "typography", title: "字体与图片", hint: "调整字体、图片策略与补充说明。" }
];

export function WizardPanel({ value, saveFeedback, generateFeedback, isDirty, onChange, onSave, onGenerate }: WizardPanelProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [paletteText, setPaletteText] = useState(value.color_scheme.join(", "));
  const isSaving = saveFeedback.status === "loading";
  const isGenerating = generateFeedback.status === "loading";
  const activeFeedback: AsyncFeedback =
    saveFeedback.status !== "idle" ? saveFeedback : generateFeedback.status !== "idle" ? generateFeedback : { status: "idle" };

  useEffect(() => {
    setPaletteText(value.color_scheme.join(", "));
  }, [value.color_scheme]);

  function updateColorScheme(nextValue: string) {
    setPaletteText(nextValue);
    const colors = nextValue
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 6);
    onChange({ ...value, color_scheme: colors });
  }

  const currentStep = STEPS[stepIndex];

  return (
    <Card
      eyebrow="高级配置"
      title="精细化生成向导"
      actions={
        <div className="card-actions-inline">
          {isExpanded ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => void onSave()} isLoading={isSaving} loadingLabel="正在保存..." disabled={isGenerating}>
                保存草稿
              </Button>
              <Button size="sm" onClick={() => void onGenerate()} isLoading={isGenerating} loadingLabel="正在启动..." disabled={isSaving}>
                按当前配置生成
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIsExpanded(false)} disabled={isSaving || isGenerating}>
                收起配置
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setIsExpanded(true)}>
              展开高级配置
            </Button>
          )}
        </div>
      }
    >
      {isExpanded ? (
        <div className="panel-stack">
          <div className="stepper">
            {STEPS.map((step, index) => (
              <button
                key={step.id}
                type="button"
                className={`stepper-item ${index === stepIndex ? "stepper-item-active" : ""}`}
                onClick={() => setStepIndex(index)}
              >
                <span>{index + 1}</span>
                <strong>{step.title}</strong>
              </button>
            ))}
          </div>

          <div className="step-card">
            <div className="step-card-header">
              <div>
                <p className="eyebrow">步骤 {stepIndex + 1}</p>
                <h3>{currentStep.title}</h3>
              </div>
              <div className="step-header-meta">
                <span className="meta-chip">
                  {stepIndex + 1} / {STEPS.length}
                </span>
                <p className="muted">{currentStep.hint}</p>
              </div>
            </div>

            {currentStep.id === "canvas" ? (
              <div className="field-grid">
                <label>
                  画布格式
                  <select value={value.canvas_format} onChange={(event) => onChange({ ...value, canvas_format: event.target.value })}>
                    <option value="ppt169">16:9 宽屏</option>
                    <option value="ppt43">4:3 标准</option>
                  </select>
                </label>
                <label>
                  生成方式
                  <select
                    value={value.template_mode}
                    onChange={(event) => onChange({ ...value, template_mode: event.target.value as WizardConfig["template_mode"] })}
                  >
                    <option value="free">自由设计</option>
                    <option value="template">套用模板</option>
                  </select>
                </label>
                <label className="field-span-2">
                  模板名称
                  <input
                    placeholder="可选，填写模板标识"
                    value={value.template_name || ""}
                    onChange={(event) => onChange({ ...value, template_name: event.target.value || null })}
                  />
                </label>
              </div>
            ) : null}

            {currentStep.id === "count" ? (
              <div className="field-grid">
                <label>
                  页数
                  <input
                    type="number"
                    min={3}
                    max={50}
                    value={value.page_count}
                    onChange={(event) => onChange({ ...value, page_count: Number(event.target.value) })}
                  />
                </label>
                <label>
                  主题模式
                  <select
                    value={value.theme_mode}
                    onChange={(event) => onChange({ ...value, theme_mode: event.target.value as WizardConfig["theme_mode"] })}
                  >
                    <option value="light">浅色</option>
                    <option value="dark">深色</option>
                  </select>
                </label>
              </div>
            ) : null}

            {currentStep.id === "audience" ? (
              <div className="field-grid">
                <label className="field-span-2">
                  目标受众
                  <input
                    placeholder="例如：管理层、销售负责人、投资人"
                    value={value.target_audience}
                    onChange={(event) => onChange({ ...value, target_audience: event.target.value })}
                  />
                </label>
              </div>
            ) : null}

            {currentStep.id === "scenario" ? (
              <div className="field-grid">
                <label className="field-span-2">
                  使用场景
                  <input
                    placeholder="例如：季度复盘、培训课件、客户提案"
                    value={value.use_case}
                    onChange={(event) => onChange({ ...value, use_case: event.target.value })}
                  />
                </label>
              </div>
            ) : null}

            {currentStep.id === "style" ? (
              <div className="field-grid">
                <label>
                  风格目标
                  <select
                    value={value.style_objective}
                    onChange={(event) => onChange({ ...value, style_objective: event.target.value as WizardConfig["style_objective"] })}
                  >
                    <option value="general">通用商务</option>
                    <option value="consulting">咨询风格</option>
                    <option value="top_consulting">高层汇报</option>
                  </select>
                </label>
                <label>
                  气质关键词
                  <input
                    placeholder="例如：专业、稳重、克制"
                    value={value.accent_tone}
                    onChange={(event) => onChange({ ...value, accent_tone: event.target.value })}
                  />
                </label>
              </div>
            ) : null}

            {currentStep.id === "color" ? (
              <div className="field-grid">
                <label className="field-span-2">
                  配色方案
                  <input value={paletteText} onChange={(event) => updateColorScheme(event.target.value)} />
                </label>
                <div className="palette-preview field-span-2">
                  {value.color_scheme.map((color) => (
                    <span key={color} className="palette-chip">
                      <i style={{ background: color }} />
                      {color}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {currentStep.id === "icons" ? (
              <div className="field-grid">
                <label>
                  图标策略
                  <select
                    value={value.icon_strategy}
                    onChange={(event) => onChange({ ...value, icon_strategy: event.target.value as WizardConfig["icon_strategy"] })}
                  >
                    <option value="builtin">内置图标</option>
                    <option value="emoji">表情符号</option>
                    <option value="ai">智能生成</option>
                    <option value="custom">自定义</option>
                  </select>
                </label>
                <label>
                  图标库
                  <select
                    value={value.icon_library}
                    onChange={(event) => onChange({ ...value, icon_library: event.target.value as WizardConfig["icon_library"] })}
                  >
                    <option value="chunk">内置图标库</option>
                    <option value="tabler-filled">实心图标库</option>
                    <option value="tabler-outline">线框图标库</option>
                  </select>
                </label>
              </div>
            ) : null}

            {currentStep.id === "typography" ? (
              <div className="field-grid">
                <label>
                  标题字体
                  <input
                    value={value.typography_title_font}
                    onChange={(event) => onChange({ ...value, typography_title_font: event.target.value })}
                  />
                </label>
                <label>
                  正文字体
                  <input
                    value={value.typography_body_font}
                    onChange={(event) => onChange({ ...value, typography_body_font: event.target.value })}
                  />
                </label>
                <label>
                  正文字号
                  <input
                    type="number"
                    min={14}
                    max={32}
                    value={value.body_font_size}
                    onChange={(event) => onChange({ ...value, body_font_size: Number(event.target.value) })}
                  />
                </label>
                <label>
                  图片策略
                  <select
                    value={value.image_strategy}
                    onChange={(event) => onChange({ ...value, image_strategy: event.target.value as WizardConfig["image_strategy"] })}
                  >
                    <option value="none">不使用图片</option>
                    <option value="existing">使用现有素材</option>
                    <option value="ai">智能生成图片</option>
                    <option value="placeholder">占位图</option>
                  </select>
                </label>
                <label className="field-span-2">
                  附加说明
                  <textarea
                    rows={4}
                    placeholder="例如：图表尽量简洁，避免密集表格，每页只突出一个核心结论。"
                    value={value.additional_instructions || ""}
                    onChange={(event) => onChange({ ...value, additional_instructions: event.target.value })}
                  />
                </label>
              </div>
            ) : null}
          </div>

          <div className="wizard-footer">
            <div className="inline-actions">
              {isDirty ? <span className="inline-note">有未保存修改</span> : <span className="inline-note inline-note-muted">当前修改已保存</span>}
              <Button variant="ghost" onClick={() => setStepIndex((index) => Math.max(index - 1, 0))} disabled={stepIndex === 0 || isSaving || isGenerating}>
                上一步
              </Button>
              <Button
                variant="secondary"
                onClick={() => setStepIndex((index) => Math.min(index + 1, STEPS.length - 1))}
                disabled={stepIndex === STEPS.length - 1 || isSaving || isGenerating}
              >
                下一步
              </Button>
            </div>

            {activeFeedback.message ? (
              <p className={`feedback feedback-${activeFeedback.status === "error" ? "error" : "success"}`}>{activeFeedback.message}</p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="wizard-collapsed">
          <p className="section-copy">高级配置默认已收起。只有在需要精细调整页数、风格、字体、配色和图片策略时再展开。</p>
          <div className="wizard-summary-grid">
            <span className="meta-chip">页数：{value.page_count}</span>
            <span className="meta-chip">受众：{value.target_audience || "未设置"}</span>
            <span className="meta-chip">场景：{value.use_case || "未设置"}</span>
            <span className="meta-chip">主题：{value.theme_mode === "dark" ? "深色" : "浅色"}</span>
            <span className="meta-chip">图片：{value.image_strategy === "none" ? "不使用图片" : "已配置图片策略"}</span>
            {isDirty ? <span className="meta-chip wizard-summary-warning">有未保存修改</span> : null}
          </div>
          {activeFeedback.message ? (
            <p className={`feedback feedback-${activeFeedback.status === "error" ? "error" : "success"}`}>{activeFeedback.message}</p>
          ) : null}
        </div>
      )}
    </Card>
  );
}
