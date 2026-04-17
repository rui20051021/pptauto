import { Link } from "react-router-dom";
import type { ProjectDetail, ProjectSummary } from "../../types";
import { translateCanvasFormat } from "../../lib/display";
import { formatDateTime } from "../../lib/format";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { StatusBadge } from "../ui/StatusBadge";

type ProjectHeaderProps = {
  project: ProjectDetail;
  summary: ProjectSummary | null;
  onRefresh: () => void;
  isRefreshing?: boolean;
};

export function ProjectHeader({ project, summary, onRefresh, isRefreshing = false }: ProjectHeaderProps) {
  return (
    <Card className="project-hero">
      <div className="project-hero-main">
        <div>
          <div className="project-breadcrumbs">
            <Link className="utility-link" to="/">
              全部项目
            </Link>
            <span>/</span>
            <span>{project.slug}</span>
          </div>
          <p className="eyebrow">{translateCanvasFormat(project.canvas_format)}</p>
          <h1 className="page-title">{project.name}</h1>
          <p className="page-copy">{project.description || "暂无项目说明，可以通过向导完善生成需求。"}</p>
        </div>

        <div className="hero-meta">
          {summary?.latest_run ? <StatusBadge status={summary.latest_run.status} /> : <StatusBadge status="idle" />}
          <span className="meta-chip">更新于 {formatDateTime(project.updated_at)}</span>
          <Button variant="ghost" size="sm" onClick={onRefresh} isLoading={isRefreshing} loadingLabel="正在刷新...">
            刷新
          </Button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <span>素材数</span>
          <strong>{summary?.source_count ?? project.sources.length}</strong>
        </div>
        <div className="metric-card">
          <span>页数</span>
          <strong>{summary?.slide_count ?? 0}</strong>
        </div>
        <div className="metric-card">
          <span>产物数</span>
          <strong>{summary?.artifact_count ?? 0}</strong>
        </div>
        <div className="metric-card">
          <span>任务数</span>
          <strong>{summary?.run_count ?? 0}</strong>
        </div>
      </div>
    </Card>
  );
}
