import { useEffect, useState } from "react";
import type { AsyncFeedback } from "../types";

const idleFeedback: AsyncFeedback = { status: "idle" };

export function useTransientFeedback(timeoutMs = 2500) {
  const [feedback, setFeedback] = useState<AsyncFeedback>(idleFeedback);

  useEffect(() => {
    if (feedback.status !== "success") {
      return;
    }

    const timer = window.setTimeout(() => {
      setFeedback(idleFeedback);
    }, timeoutMs);

    return () => window.clearTimeout(timer);
  }, [feedback, timeoutMs]);

  return {
    feedback,
    setFeedback,
    resetFeedback: () => setFeedback(idleFeedback)
  };
}
