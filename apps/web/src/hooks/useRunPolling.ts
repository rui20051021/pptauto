import { useEffect } from "react";
import type { Run } from "../types";

const ACTIVE_STATUSES = new Set(["queued", "running"]);

export function useRunPolling(run: Run | null | undefined, onPoll: () => void, intervalMs = 3000) {
  useEffect(() => {
    if (!run || !ACTIVE_STATUSES.has(run.status)) {
      return;
    }

    const timer = window.setInterval(() => {
      onPoll();
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs, onPoll, run]);
}
