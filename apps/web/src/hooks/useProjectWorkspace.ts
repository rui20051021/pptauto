import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { DEFAULT_WIZARD } from "../lib/constants";
import type {
  Artifact,
  AsyncFeedback,
  ProjectDetail,
  ProjectSummary,
  Run,
  RunLog,
  Slide,
  WizardConfig
} from "../types";

type WorkspaceState = {
  project: ProjectDetail | null;
  summary: ProjectSummary | null;
  runs: Run[];
  runLogs: RunLog[];
  selectedRunId: string | null;
  slides: Slide[];
  artifacts: Artifact[];
  wizard: WizardConfig;
  status: AsyncFeedback;
};

const idleFeedback: AsyncFeedback = { status: "idle" };

export function useProjectWorkspace(token: string | null, projectId: string | undefined) {
  const [state, setState] = useState<WorkspaceState>({
    project: null,
    summary: null,
    runs: [],
    runLogs: [],
    selectedRunId: null,
    slides: [],
    artifacts: [],
    wizard: DEFAULT_WIZARD,
    status: { status: "loading" }
  });

  const requestIdRef = useRef(0);
  const selectedRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedRunIdRef.current = state.selectedRunId;
  }, [state.selectedRunId]);

  const loadWorkspace = useCallback(async () => {
    if (!token || !projectId) {
      return;
    }

    const resolvedToken = token;
    const resolvedProjectId = projectId;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setState((current) => ({ ...current, status: { status: "loading" } }));

    try {
      const [project, summary, runs] = await Promise.all([
        api.getProject(resolvedToken, resolvedProjectId),
        api.getProjectSummary(resolvedToken, resolvedProjectId),
        api.getProjectRuns(resolvedToken, resolvedProjectId),
      ]);

      const preferredRunId = selectedRunIdRef.current && runs.some((run) => run.id === selectedRunIdRef.current) ? selectedRunIdRef.current : null;
      const selectedRunId = preferredRunId || runs[0]?.id || project.latest_run?.id || null;
      const [runLogs, slides, artifacts] = selectedRunId
        ? await Promise.all([
            api.getRunLogs(resolvedToken, selectedRunId),
            api.getSlides(resolvedToken, resolvedProjectId, selectedRunId),
            api.getArtifacts(resolvedToken, resolvedProjectId, selectedRunId)
          ])
        : [[], [], []];

      if (requestIdRef.current !== requestId) {
        return;
      }

      setState({
        project,
        summary,
        runs,
        runLogs,
        selectedRunId,
        slides,
        artifacts,
        wizard: project.wizard_config ? { ...DEFAULT_WIZARD, ...project.wizard_config } : DEFAULT_WIZARD,
        status: { status: "success" }
      });
    } catch (error) {
      if (requestIdRef.current !== requestId) {
        return;
      }
      setState((current) => ({
        ...current,
        status: {
          status: "error",
          message: error instanceof Error ? error.message : "加载项目失败。"
        }
      }));
    }
  }, [projectId, token]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  async function refresh() {
    await loadWorkspace();
  }

  async function selectRun(runId: string) {
    if (!token || !projectId) {
      return;
    }
    try {
      const [runLogs, slides, artifacts] = await Promise.all([
        api.getRunLogs(token, runId),
        api.getSlides(token, projectId, runId),
        api.getArtifacts(token, projectId, runId)
      ]);
      setState((current) => ({
        ...current,
        selectedRunId: runId,
        runLogs,
        slides,
        artifacts
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        status: { status: "error", message: error instanceof Error ? error.message : "加载任务日志失败。" }
      }));
    }
  }

  async function refreshRun(runId: string) {
    if (!token || !projectId) {
      return;
    }

    const resolvedToken = token;
    const resolvedProjectId = projectId;

    try {
      const [run, runs, runLogs, summary, slides, artifacts] = await Promise.all([
        api.getRun(resolvedToken, runId),
        api.getProjectRuns(resolvedToken, resolvedProjectId),
        api.getRunLogs(resolvedToken, runId),
        api.getProjectSummary(resolvedToken, resolvedProjectId),
        api.getSlides(resolvedToken, resolvedProjectId, runId),
        api.getArtifacts(resolvedToken, resolvedProjectId, runId)
      ]);

      setState((current) => ({
        ...current,
        summary,
        runs: runs.map((item) => (item.id === run.id ? run : item)),
        runLogs,
        selectedRunId: run.id,
        slides,
        artifacts,
        project: current.project ? { ...current.project, latest_run: summary.latest_run || current.project.latest_run } : current.project,
        status: idleFeedback
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        status: { status: "error", message: error instanceof Error ? error.message : "刷新任务失败。" }
      }));
    }
  }

  return {
    ...state,
    setWizard: (wizard: WizardConfig) => setState((current) => ({ ...current, wizard })),
    setStatus: (feedback: AsyncFeedback) => setState((current) => ({ ...current, status: feedback })),
    refresh,
    selectRun,
    refreshRun
  };
}
