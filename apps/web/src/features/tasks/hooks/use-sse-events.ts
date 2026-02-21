import { useEffect, useRef, useCallback, useState } from "react";
import { API_BASE_URL, getAccessToken } from "@/lib/api-client";

/** Parsed progress event from SSE stream. */
export interface SSEProgressEvent {
  id: string;
  step: string;
  progress_pct: number;
  description: string;
  action_index: number;
  total_actions_estimate: number;
  current_action?: string;
  started_at: string;
  elapsed_ms: number;
  eta_ms: number | null;
  execution_mode?: string;
  manual_id?: string;
  step_cost_cents?: number;
  timestamp: string;
}

export type SSEStatus = "connecting" | "connected" | "disconnected" | "done";

/**
 * Hook that connects to the SSE endpoint for real-time execution progress.
 *
 * Uses EventSource API with automatic reconnection (built-in).
 * Auth token is passed as a query parameter (EventSource cannot set headers).
 * Falls back gracefully if SSE is not available.
 *
 * @param taskId - The VALET task UUID
 * @param enabled - Whether to connect (false for terminal tasks)
 */
export function useSSEEvents(taskId: string, enabled: boolean) {
  const [latestEvent, setLatestEvent] = useState<SSEProgressEvent | null>(null);
  const [status, setStatus] = useState<SSEStatus>("disconnected");
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!enabled) return;

    const token = getAccessToken();
    if (!token) {
      setStatus("disconnected");
      return;
    }

    setStatus("connecting");

    // EventSource cannot send custom headers, so we pass the JWT as a query param.
    // The SSE endpoint verifies it inline (same pattern as the WebSocket handler).
    const url = `${API_BASE_URL}/api/v1/tasks/${taskId}/events?token=${encodeURIComponent(token)}`;

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setStatus("connected");
    };

    // Handle progress events
    es.addEventListener("progress", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as SSEProgressEvent;
        const enriched = { ...data, id: event.lastEventId || data.id };
        setLatestEvent(enriched);
      } catch {
        // Ignore malformed events
      }
    });

    // Handle completion signal
    es.addEventListener("done", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        setStatus("done");
        setLatestEvent((prev) => (prev ? { ...prev, step: data.step, progress_pct: 100 } : null));
      } catch {
        // Ignore
      }
      es.close();
    });

    es.onerror = () => {
      // EventSource auto-reconnects on error. If it's fully closed, update status.
      if (es.readyState === EventSource.CLOSED) {
        setStatus("disconnected");
      } else {
        setStatus("connecting");
      }
    };
  }, [taskId, enabled]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [connect]);

  return {
    latestEvent,
    status,
  };
}
