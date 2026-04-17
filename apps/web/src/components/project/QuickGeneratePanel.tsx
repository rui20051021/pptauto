import type { AsyncFeedback } from "../../types";
import type { QuickBriefHint } from "../../lib/quickBrief";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

type QuickGeneratePanelProps = {
  brief: string;
  canGenerate: boolean;
  hints: QuickBriefHint[];
  feedback: AsyncFeedback;
  onChange: (value: string) => void;
  onGenerate: () => Promise<void>;
};

export function QuickGeneratePanel({ brief, canGenerate, hints, feedback, onChange, onGenerate }: QuickGeneratePanelProps) {
  const isGenerating = feedback.status === "loading";

  return (
    <Card
      eyebrow="快捷生成"
      title="直接描述你要的 PPT"
      actions={
        <Button onClick={() => void onGenerate()} isLoading={isGenerating} loadingLabel="正在生成..." disabled={!canGenerate}>
          一键生成 PPT
        </Button>
      }
    >
      <div className="panel-stack">
        <p className="section-copy">
          不想逐项点向导时，直接把要求写在这里。支持一句话写清页数、受众、场景、风格、16:9 / 4:3、深色 / 浅色和是否要图片；如果已经上传素材，不写这里也可以直接生成。
        </p>
        <textarea
          className="quick-brief-input"
          rows={6}
          placeholder="示例：做一份给管理层看的 10 页季度经营复盘 PPT，16:9，深色，咨询风格，重点讲收入、利润、风险和下季度动作。"
          value={brief}
          onChange={(event) => onChange(event.target.value)}
        />

        {hints.length ? (
          <div className="panel-stack">
            <div className="hint-chip-list">
              {hints.map((hint) => (
                <span key={`${hint.label}-${hint.value}`} className="hint-chip">
                  {hint.label}：{hint.value}
                </span>
              ))}
            </div>
            <p className="muted">系统会把这些识别到的设置自动带入生成参数，其余参数沿用当前项目配置。</p>
          </div>
        ) : (
          <p className="muted">还没有识别到明确参数也没关系，系统会按当前项目配置生成；如果你已经上传了素材，也可以直接点击生成。</p>
        )}

        {feedback.message ? (
          <p className={`feedback feedback-${feedback.status === "error" ? "error" : "success"}`}>{feedback.message}</p>
        ) : null}
      </div>
    </Card>
  );
}
