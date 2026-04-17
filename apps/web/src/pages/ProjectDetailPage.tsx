import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { QuickGeneratePanel } from "../components/project/QuickGeneratePanel";
import { ModelIntegrationPanel } from "../components/project/ModelIntegrationPanel";
import { SourcePanel } from "../components/project/SourcePanel";
import { WizardPanel } from "../components/project/WizardPanel";
import { RunsPanel } from "../components/project/RunsPanel";
import { ArtifactPanel } from "../components/project/ArtifactPanel";
import { ProjectHeader } from "../components/project/ProjectHeader";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingBlock } from "../components/ui/LoadingBlock";
import { api } from "../lib/api";
import { DEFAULT_WIZARD } from "../lib/constants";
import { analyzeQuickBrief } from "../lib/quickBrief";
import { useProjectWorkspace } from "../hooks/useProjectWorkspace";
import { useRunPolling } from "../hooks/useRunPolling";
import { useTransientFeedback } from "../hooks/useTransientFeedback";
import type { WizardConfig } from "../types";

type ProjectDetailPageProps = {
  token: string;
};

export function ProjectDetailPage({ token }: ProjectDetailPageProps) {
  const { projectId } = useParams();
  const workspace = useProjectWorkspace(token, projectId);
  const { feedback: uploadState, setFeedback: setUploadState } = useTransientFeedback();
  const { feedback: wizardState, setFeedback: setWizardState } = useTransientFeedback();
  const { feedback: generateState, setFeedback: setGenerateState } = useTransientFeedback();

  const activeRun =
    workspace.runs.find((run) => run.id === workspace.selectedRunId) ||
    workspace.summary?.latest_run ||
    workspace.project?.latest_run ||
    null;

  const persistedWizard = workspace.project?.wizard_config ? { ...DEFAULT_WIZARD, ...workspace.project.wizard_config } : DEFAULT_WIZARD;
  const hasUnsavedWizardChanges = useMemo(
    () => JSON.stringify(workspace.wizard) !== JSON.stringify(persistedWizard),
    [persistedWizard, workspace.wizard]
  );
  const quickBriefAnalysis = useMemo(
    () => analyzeQuickBrief(workspace.wizard.additional_instructions || "", workspace.wizard),
    [workspace.wizard]
  );
  const canQuickGenerate = Boolean(
    (workspace.wizard.additional_instructions || "").trim() || workspace.project?.sources.length
  );

  useRunPolling(activeRun, () => {
    if (activeRun) {
      void workspace.refreshRun(activeRun.id);
    }
  });

  async function handleUpload(urls: string, files: FileList | null): Promise<boolean> {
    if (!projectId) {
      return false;
    }
    setUploadState({ status: "loading" });
    try {
      const form = new FormData();
      urls
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean)
        .forEach((value) => form.append("urls", value));
      Array.from(files || []).forEach((file) => form.append("files", file));
      await api.uploadSources(token, projectId, form);
      setUploadState({ status: "success", message: "素材上传成功。" });
      await workspace.refresh();
      return true;
    } catch (error) {
      setUploadState({ status: "error", message: error instanceof Error ? error.message : "上传素材失败。" });
      return false;
    }
  }

  async function handleSaveWizard(): Promise<boolean> {
    if (!projectId) {
      return false;
    }
    setWizardState({ status: "loading" });
    try {
      await api.saveWizard(token, projectId, workspace.wizard);
      setWizardState({ status: "success", message: "向导配置已保存。" });
      await workspace.refresh();
      return true;
    } catch (error) {
      setWizardState({ status: "error", message: error instanceof Error ? error.message : "保存向导配置失败。" });
      return false;
    }
  }

  async function launchGeneration(nextWizard: WizardConfig, successMessage: string) {
    if (!projectId) {
      return;
    }
    setGenerateState({ status: "loading" });
    try {
      workspace.setWizard(nextWizard);
      await api.saveWizard(token, projectId, nextWizard);
      const run = await api.generateProject(token, projectId, {});
      setGenerateState({ status: "success", message: successMessage });
      await workspace.refresh();
      await workspace.selectRun(run.id);
      await workspace.refreshRun(run.id);
    } catch (error) {
      setGenerateState({ status: "error", message: error instanceof Error ? error.message : "启动生成任务失败。" });
    }
  }

  async function handleGenerate() {
    await launchGeneration(workspace.wizard, "生成任务已启动。");
  }

  async function handleQuickGenerate() {
    const brief = workspace.wizard.additional_instructions?.trim() || "";
    const hasSources = Boolean(workspace.project?.sources.length);
    if (!brief && !hasSources) {
      setGenerateState({ status: "error", message: "请先上传素材，或直接写下你希望生成的 PPT 要求。" });
      return;
    }
    if (brief) {
      await launchGeneration(quickBriefAnalysis.wizard, "已按文字要求启动生成任务。");
      return;
    }
    await launchGeneration(workspace.wizard, "已按当前上传素材启动生成任务。");
  }

  async function handleRefreshWorkspace() {
    await workspace.refresh();
  }

  if (workspace.status.status === "loading" && !workspace.project) {
    return <LoadingBlock label="正在加载项目工作台..." />;
  }

  if (!workspace.project) {
    return (
      <div className="page-stack">
        <EmptyState
          title="项目不可用"
          description={workspace.status.message || "无法加载这个项目，请刷新页面或返回项目列表重试。"}
        />
        <div>
          <Button variant="secondary" onClick={() => void workspace.refresh()}>
            重试
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <ProjectHeader
        project={workspace.project}
        summary={workspace.summary}
        onRefresh={() => void handleRefreshWorkspace()}
        isRefreshing={workspace.status.status === "loading"}
      />

      {workspace.status.status === "error" && workspace.status.message ? (
        <p className="feedback feedback-error">{workspace.status.message}</p>
      ) : null}

      <div className="panel-stack">
        <ModelIntegrationPanel token={token} />
        <QuickGeneratePanel
          brief={workspace.wizard.additional_instructions || ""}
          canGenerate={canQuickGenerate}
          hints={quickBriefAnalysis.hints}
          feedback={generateState}
          onChange={(value) => workspace.setWizard({ ...workspace.wizard, additional_instructions: value })}
          onGenerate={handleQuickGenerate}
        />
        <SourcePanel sources={workspace.project.sources} feedback={uploadState} onUpload={handleUpload} />
        <WizardPanel
          value={workspace.wizard}
          saveFeedback={wizardState}
          generateFeedback={generateState}
          isDirty={hasUnsavedWizardChanges}
          onChange={workspace.setWizard}
          onSave={handleSaveWizard}
          onGenerate={handleGenerate}
        />
        <RunsPanel
          runs={workspace.runs}
          selectedRunId={workspace.selectedRunId}
          logs={workspace.runLogs}
          feedback={workspace.status}
          onRefreshRun={workspace.refreshRun}
        />
        <ArtifactPanel token={token} artifacts={workspace.artifacts} />
      </div>
    </div>
  );
}
