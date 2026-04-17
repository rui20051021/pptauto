import type { ProjectDetail, ProjectSummary } from "../../types";
import { translateArtifactType, translateCanvasFormat, translateStyleObjective, translateTemplateMode } from "../../lib/display";
import { RUN_STAGE_LABELS } from "../../lib/constants";
import { formatDateTime } from "../../lib/format";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { StatusBadge } from "../ui/StatusBadge";

type SummarySidebarProps = {
  project: ProjectDetail;
  summary: ProjectSummary | null;
};

export function SummarySidebar({ project, summary }: SummarySidebarProps) {
  const artifactEntries = Object.entries(summary?.artifact_type_counts || {});
  const wizard = project.wizard_config;

  return (
    <div className="sidebar-stack">
      <Card eyebrow="摘要" title="项目概览">
        <div className="summary-list">
          <div className="summary-row">
            <span>项目标识</span>
            <strong>{project.slug}</strong>
          </div>
          <div className="summary-row">
            <span>画布格式</span>
            <strong>{translateCanvasFormat(project.canvas_format)}</strong>
          </div>
          <div className="summary-row">
            <span>生成方式</span>
            <strong>{translateTemplateMode(project.template_mode)}</strong>
          </div>
          <div className="summary-row">
            <span>创建时间</span>
            <strong>{formatDateTime(project.created_at)}</strong>
          </div>
        </div>
      </Card>

      <Card eyebrow="最新任务" title="生成状态">
        {summary?.latest_run ? (
          <div className="panel-stack">
            <div className="summary-row">
              <span>状态</span>
              <StatusBadge status={summary.latest_run.status} />
            </div>
            <div className="summary-row">
              <span>阶段</span>
              <strong>{RUN_STAGE_LABELS[summary.latest_run.current_stage] || summary.latest_run.current_stage}</strong>
            </div>
            <div className="summary-row">
              <span>开始时间</span>
              <strong>{formatDateTime(summary.latest_run.created_at)}</strong>
            </div>
            <div className="summary-row">
              <span>完成时间</span>
              <strong>{formatDateTime(summary.latest_run.completed_at)}</strong>
            </div>
          </div>
        ) : (
          <EmptyState title="还没有任务" description="发起第一次生成后，这里会显示任务状态。" />
        )}
      </Card>

      <Card eyebrow="向导" title="当前简报配置">
        {wizard ? (
          <div className="summary-list">
            <div className="summary-row">
              <span>页数</span>
              <strong>{wizard.page_count}</strong>
            </div>
            <div className="summary-row">
              <span>受众</span>
              <strong>{wizard.target_audience || "暂无"}</strong>
            </div>
            <div className="summary-row">
              <span>场景</span>
              <strong>{wizard.use_case || "暂无"}</strong>
            </div>
            <div className="summary-row">
              <span>风格</span>
              <strong>{translateStyleObjective(wizard.style_objective)}</strong>
            </div>
          </div>
        ) : (
          <EmptyState title="还没有向导配置" description="保存向导后，这里会显示当前配置摘要。" />
        )}
      </Card>

      <Card eyebrow="产物" title="输出类型分布">
        {artifactEntries.length ? (
          <div className="summary-list">
            {artifactEntries.map(([artifactType, count]) => (
              <div key={artifactType} className="summary-row">
                <span>{translateArtifactType(artifactType)}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="还没有产物统计" description="生成完成后，这里会显示产物数量分布。" />
        )}
      </Card>
    </div>
  );
}
