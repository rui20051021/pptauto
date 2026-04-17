import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { translateCanvasFormat, translateTemplateMode } from "../lib/display";
import type { AsyncFeedback, Project } from "../types";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingBlock } from "../components/ui/LoadingBlock";

type ProjectsPageProps = {
  token: string;
};

const idleFeedback: AsyncFeedback = { status: "idle" };

export function ProjectsPage({ token }: ProjectsPageProps) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [pageState, setPageState] = useState<AsyncFeedback>({ status: "loading" });
  const [createState, setCreateState] = useState<AsyncFeedback>(idleFeedback);
  const [form, setForm] = useState({
    name: "",
    description: "",
    canvas_format: "ppt169",
    template_mode: "free" as "free" | "template"
  });
  const isCreating = createState.status === "loading";

  useEffect(() => {
    let cancelled = false;
    api
      .listProjects(token)
      .then((items) => {
        if (cancelled) {
          return;
        }
        setProjects(items);
        setPageState({ status: "success" });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setPageState({ status: "error", message: error instanceof Error ? error.message : "加载项目列表失败。" });
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleCreateProject(event?: FormEvent) {
    event?.preventDefault();
    setCreateState({ status: "loading" });
    try {
      const project = await api.createProject(token, form);
      setCreateState({ status: "success", message: "项目创建成功。" });
      setProjects((current) => [project, ...current]);
      setForm({ name: "", description: "", canvas_format: "ppt169", template_mode: "free" });
      navigate(`/projects/${project.id}`);
    } catch (error) {
      setCreateState({ status: "error", message: error instanceof Error ? error.message : "创建项目失败。" });
    }
  }

  return (
    <div className="page-stack">
      <Card eyebrow="工作台" title="项目面板">
        <form className="panel-stack" onSubmit={handleCreateProject}>
          <div className="project-creation-grid">
            <label>
              项目名称
              <input
                placeholder="例如：董事会季度汇报"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label>
              项目说明
              <input
                placeholder="简要说明这个项目的用途"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              />
            </label>
            <label>
              画布格式
              <select
                value={form.canvas_format}
                onChange={(event) => setForm((current) => ({ ...current, canvas_format: event.target.value }))}
              >
                <option value="ppt169">16:9 宽屏</option>
                <option value="ppt43">4:3 标准</option>
              </select>
            </label>
            <label>
              生成方式
              <select
                value={form.template_mode}
                onChange={(event) =>
                  setForm((current) => ({ ...current, template_mode: event.target.value as "free" | "template" }))
                }
              >
                <option value="free">自由设计</option>
                <option value="template">套用模板</option>
              </select>
            </label>
          </div>

          <div className="toolbar">
            <Button type="submit" isLoading={isCreating} loadingLabel="正在创建项目..." disabled={!form.name.trim()}>
              创建项目
            </Button>
            {createState.message ? (
              <p className={`feedback feedback-${createState.status === "error" ? "error" : "success"}`}>{createState.message}</p>
            ) : null}
          </div>
        </form>
      </Card>

      <Card eyebrow="项目" title="最近项目">
        {pageState.status === "loading" ? <LoadingBlock label="正在加载项目..." /> : null}
        {pageState.status === "error" && pageState.message ? <p className="feedback feedback-error">{pageState.message}</p> : null}

        {pageState.status !== "loading" && !projects.length ? (
          <EmptyState title="还没有项目" description="先创建一个项目，再开始中文化 PPT 生成流程。" />
        ) : null}

        {projects.length ? (
          <div className="project-grid">
            {projects.map((project) => (
              <Link className="project-card-link" key={project.id} to={`/projects/${project.id}`}>
                <div className="project-card-top">
                  <span className="eyebrow">{translateCanvasFormat(project.canvas_format)}</span>
                  <span className="meta-chip">{translateTemplateMode(project.template_mode)}</span>
                </div>
                <strong>{project.name}</strong>
                <p>{project.description || "暂无项目说明。"}</p>
                <span className="project-card-meta">更新于 {new Date(project.updated_at).toLocaleDateString("zh-CN")}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
