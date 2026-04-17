import { useEffect, useRef, useState } from "react";
import type { AsyncFeedback, Run, RunLog } from "../../types";
import { formatClockTime, formatDateTime } from "../../lib/format";
import { RUN_STAGE_LABELS } from "../../lib/constants";
import { translateLogLevel } from "../../lib/display";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { StatusBadge } from "../ui/StatusBadge";

type RunsPanelProps = {
  runs: Run[];
  selectedRunId: string | null;
  logs: RunLog[];
  feedback: AsyncFeedback;
  onRefreshRun: (runId: string) => Promise<void>;
};

export function RunsPanel({ runs, selectedRunId, logs, feedback, onRefreshRun }: RunsPanelProps) {
  const [activeAction, setActiveAction] = useState<"select" | "refresh" | null>(null);
  const [activeRunActionId, setActiveRunActionId] = useState<string | null>(null);
  const selectedRun = runs.find((run) => run.id === selectedRunId) || runs[0] || null;
  const consoleRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = consoleRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [logs, selectedRunId]);

  async function handleRefreshRun(runId: string) {
    setActiveAction("refresh");
    setActiveRunActionId(runId);
    try {
      await onRefreshRun(runId);
    } finally {
      setActiveAction(null);
      setActiveRunActionId(null);
    }
  }

  return (
    <Card
      eyebrow="过程"
      title="AI 输出窗口"
      actions={
        selectedRun ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleRefreshRun(selectedRun.id)}
            isLoading={activeAction === "refresh" && activeRunActionId === selectedRun.id}
            loadingLabel="正在刷新..."
          >
            刷新任务
          </Button>
        ) : null
      }
    >
      <div className="panel-stack">
        {feedback.status === "error" && feedback.message ? <p className="feedback feedback-error">{feedback.message}</p> : null}

        {!selectedRun ? (
          <EmptyState title="还没有任务" description="先保存向导配置，再发起第一次生成任务。" />
        ) : (
          <>
            <div className="ai-output-header">
              <div>
                <strong>当前同步输出</strong>
                <p className="muted">
                  开始时间：{formatDateTime(selectedRun.created_at)} ｜ 当前阶段：{RUN_STAGE_LABELS[selectedRun.current_stage] || selectedRun.current_stage}
                </p>
              </div>
              <StatusBadge status={selectedRun.status} />
            </div>

            <div className="ai-console" ref={consoleRef}>
              {logs.length ? (
                logs.map((log) => (
                  <div className="ai-console-line" key={log.id}>
                    <span className="ai-console-time">[{formatClockTime(log.created_at)}]</span>
                    <span className="ai-console-stage">[{RUN_STAGE_LABELS[log.stage] || log.stage}]</span>
                    <span className="ai-console-level">[{translateLogLevel(log.level)}]</span>
                    <span className="ai-console-text">{log.message}</span>
                  </div>
                ))
              ) : (
                <div className="ai-console-empty">
                  生成启动后，这里会连续显示 AI 的处理输出、阶段状态和结果摘要。
                </div>
              )}
            </div>

            {selectedRun.error_message ? <p className="feedback feedback-error">{selectedRun.error_message}</p> : null}
            {activeAction === "refresh" && activeRunActionId === selectedRun.id ? (
              <p className="muted">正在刷新最新输出...</p>
            ) : (
              <p className="muted">页面会在生成中自动轮询刷新，这里会持续追加新的输出内容。</p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
