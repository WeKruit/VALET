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
 * Falls back gracefully if SSE is not available.
 *
 * @param taskId - The VALET task UUID
 * @param enabled - Whether to connect (false for terminal tasks)
 */
export function useSSEEvents(taskId: string, enabled: boolean) {
  const [events, setEvents] = useState<SSEProgressEvent[]>([]);
  const [status, setStatus] = useState<SSEStatus>("disconnected");
  const [latestEvent, setLatestEvent] = useState<SSEProgressEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!enabled) return;

    const token = getAccessToken();
    if (!token) {
      setStatus("disconnected");
      return;
    }

    setStatus("connecting");

    // EventSource doesn't support custom headers, so we pass the token as a query param.
    // The SSE endpoint uses the standard auth middleware (Authorization header from cookie/onRequest).
    // For EventSource, we'll rely on the existing auth middleware which checks the global onRequest hook.
    const url = `${API_BASE_URL}/api/v1/tasks/${taskId}/events`;

    const es = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = es;

    es.onopen = () => {
      setStatus("connected");
    };

    // Handle progress events
    es.addEventListener("progress", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as SSEProgressEvent;
        // Use the Redis stream message ID as the event ID
        const enriched = { ...data, id: event.lastEventId || data.id };
        setEvents((prev) => [...prev, enriched]);
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
        // Add a final event
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

  /** Clear accumulated events (e.g. when switching tasks). */
  const clearEvents = useCallback(() => {
    setEvents([]);
    setLatestEvent(null);
  }, []);

  return {
    events,
    latestEvent,
    status,
    clearEvents,
  };
}
