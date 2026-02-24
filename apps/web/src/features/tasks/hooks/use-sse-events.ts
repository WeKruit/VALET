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

/**
 * SSE hook for real-time task progress events.
 *
 * Resilient to Fly.io multi-machine routing: the server starts from "0"
 * (beginning of Redis stream) on fresh connections, and from the browser's
 * Last-Event-ID on reconnect. We track the last seen event ID client-side
 * so duplicate/replayed events are silently dropped.
 */
export function useSSEEvents(taskId: string | undefined, enabled: boolean) {
  const [latestEvent, setLatestEvent] = useState<SSEProgressEvent | null>(null);
  const [status, setStatus] = useState<SSEStatus>("idle");
  const esRef = useRef<EventSource | null>(null);
  // Track the last event ID we processed so we can skip duplicates on replay
  const lastSeenIdRef = useRef<string | null>(null);

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
        const msgEvent = e as MessageEvent;
        const eventId = msgEvent.lastEventId;

        // Skip duplicates: Redis stream IDs are lexicographically ordered
        // (e.g. "1708900000000-0"). If we've already processed this ID or a
        // later one, drop the event.
        if (eventId && lastSeenIdRef.current) {
          if (eventId <= lastSeenIdRef.current) return;
        }

        const data = JSON.parse(msgEvent.data) as SSEProgressEvent;
        if (eventId) {
          lastSeenIdRef.current = eventId;
        }
        setLatestEvent(data);
      } catch {
        // Ignore malformed events
      }
    });

    es.onerror = () => {
      // EventSource auto-reconnects and sends Last-Event-ID header
      // automatically. The server will resume from that cursor.
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
