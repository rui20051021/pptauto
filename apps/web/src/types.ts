export type AsyncStatus = "idle" | "loading" | "success" | "error";

export type AsyncFeedback = {
  status: AsyncStatus;
  message?: string;
};

export type AuthToken = {
  access_token: string;
  token_type: string;
};

export type User = {
  id: string;
  email: string;
  full_name?: string | null;
  created_at: string;
};

export type Project = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  canvas_format: string;
  template_mode: string;
  wizard_config?: WizardConfig | null;
  created_at: string;
  updated_at: string;
};

export type ProjectSource = {
  id: string;
  source_type: string;
  original_name: string;
  content_type?: string | null;
  size_bytes?: number | null;
  source_url?: string | null;
  storage_key: string;
  normalized_markdown_key?: string | null;
  created_at: string;
};

export type Run = {
  id: string;
  project_id: string;
  status: string;
  current_stage: string;
  error_message?: string | null;
  request_payload?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
};

export type RunLog = {
  id: number;
  stage: string;
  level: string;
  message: string;
  details?: Record<string, unknown> | null;
  created_at: string;
};

export type Slide = {
  id: string;
  page_number: number;
  title: string;
  preview_url: string;
  notes_storage_key?: string | null;
};

export type Artifact = {
  id: string;
  artifact_type: string;
  filename: string;
  content_type: string;
  size_bytes?: number | null;
  created_at: string;
  download_url: string;
};

export type ProjectDetail = Project & {
  sources: ProjectSource[];
  latest_run?: Run | null;
};

export type ProjectSummary = {
  project_id: string;
  source_count: number;
  slide_count: number;
  artifact_count: number;
  run_count: number;
  artifact_type_counts: Record<string, number>;
  latest_run?: Run | null;
};

export type WizardConfig = {
  canvas_format: string;
  page_count: number;
  target_audience: string;
  use_case: string;
  style_objective: "general" | "consulting" | "top_consulting";
  color_scheme: string[];
  template_mode: "free" | "template";
  template_name?: string | null;
  icon_strategy: "builtin" | "emoji" | "ai" | "custom";
  icon_library: "chunk" | "tabler-filled" | "tabler-outline";
  typography_title_font: string;
  typography_body_font: string;
  body_font_size: number;
  image_strategy: "none" | "existing" | "ai" | "placeholder";
  theme_mode: "light" | "dark";
  accent_tone: string;
  additional_instructions?: string | null;
};

export type ModelIntegration = {
  requested_provider: string;
  effective_provider: string;
  model_name: string;
  base_url?: string | null;
  configured: boolean;
  using_external_ai: boolean;
  api_key_masked?: string | null;
  source: string;
  warning_code?: string | null;
};

export type ModelIntegrationUpdate = {
  provider?: "mock" | "openai";
  model_name?: string;
  base_url?: string | null;
  api_key?: string | null;
  clear_api_key?: boolean;
};

export type ModelIntegrationTestResult = {
  success: boolean;
  requested_provider: string;
  effective_provider: string;
  model_name: string;
  base_url?: string | null;
  reply: string;
};
