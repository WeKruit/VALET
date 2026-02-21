import { useState, useEffect, useRef, useCallback } from "react";
import { API_BASE_URL, getAccessToken } from "@/lib/api-client";

export interface SSEProgressEvent {
  step: string;
  progress_pct: string;
  description: string;
  action_index: string;
  total_actions_estimate: string;
  current_action?: string;
  started_at: string;
  elapsed_ms: string;
  eta_ms?: string;
  execution_mode?: string;
  timestamp: string;
}

type SSEStatus = "idle" | "connecting" | "connected" | "error" | "closed";

export function useSSEEvents(taskId: string | undefined, enabled: boolean) {
  const [latestEvent, setLatestEvent] = useState<SSEProgressEvent | null>(null);
  const [status, setStatus] = useState<SSEStatus>("idle");
  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!taskId || !enabled) return;

    const token = getAccessToken();
    if (!token) {
      setStatus("error");
      return;
    }

    const url = `${API_BASE_URL}/api/v1/tasks/${taskId}/events/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;
    setStatus("connecting");

    es.onopen = () => {
      setStatus("connected");
    };

    es.addEventListener("progress", (e) => {
      try {
        const data = JSON.parse(e.data) as SSEProgressEvent;
        setLatestEvent(data);
      } catch {
        // Ignore malformed events
      }
    });

    es.onerror = () => {
      // EventSource auto-reconnects; track the error state
      if (es.readyState === EventSource.CLOSED) {
        setStatus("closed");
      } else {
        setStatus("error");
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [taskId, enabled]);

  useEffect(() => {
    const cleanup = connect();
    return () => {
      cleanup?.();
      setStatus("idle");
    };
  }, [connect]);

  return { latestEvent, status };
}
