import { translateStatus } from "../../lib/display";

type StatusBadgeProps = {
  status: string;
};

const STATUS_CLASS_MAP: Record<string, string> = {
  queued: "neutral",
  running: "info",
  completed: "success",
  failed: "danger",
  awaiting_input: "warning",
  idle: "neutral",
  loading: "info",
  success: "success",
  error: "danger"
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const tone = STATUS_CLASS_MAP[status] || "neutral";
  return <span className={`status-badge status-${tone}`}>{translateStatus(status)}</span>;
}
