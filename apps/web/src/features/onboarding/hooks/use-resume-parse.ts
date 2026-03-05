import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api-client";
import type { z } from "zod";
import type { parsedResumeData } from "@valet/shared/schemas";

export type ParsedResumeData = NonNullable<z.infer<typeof parsedResumeData>>;

export type ParseStatus = "idle" | "uploading" | "parsing" | "parsed" | "failed";

interface UseResumeParseReturn {
  parsedData: ParsedResumeData | null;
  parseStatus: ParseStatus;
  error: string | null;
}

const WS_BASE_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8000/api/v1/ws";

/** How long to wait for a WebSocket event before starting to poll */
const WS_GRACE_PERIOD_MS = 3_000;
/** Polling interval when WebSocket is unavailable */
const POLL_INTERVAL_MS = 2_000;

/**
 * Hook that listens for resume parse completion via WebSocket,
 * with polling fallback if WebSocket is unavailable.
 */
export function useResumeParse(resumeId: string | null): UseResumeParseReturn {
  const [parsedData, setParsedData] = useState<ParsedResumeData | null>(null);
  const [parseStatus, setParseStatus] = useState<ParseStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const graceTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const wsConnected = useRef(false);
  const settled = useRef(false);

  // Resume getById query for polling fallback
  const resumeQuery = api.resumes.getById.useQuery({
    queryKey: ["resume", resumeId ?? "none"],
    queryData: { params: { id: resumeId ?? "" } },
    enabled: false, // Manual refetch only
  });

  const handleParsed = useCallback((data: ParsedResumeData) => {
    if (settled.current) return;
    settled.current = true;
    setParsedData(data);
    setParseStatus("parsed");
    setError(null);
  }, []);

  const handleFailed = useCallback((errorMsg: string) => {
    if (settled.current) return;
    settled.current = true;
    setParseStatus("failed");
    setError(errorMsg);
  }, []);

  // Start polling fallback
  const startPolling = useCallback(() => {
    if (settled.current || !resumeId) return;

    const poll = async () => {
      if (settled.current) return;

      try {
        const result = await resumeQuery.refetch();
        if (result.data?.status === 200) {
          const resume = result.data.body;
          if (resume.status === "parsed" && resume.parsedData) {
            handleParsed(resume.parsedData as ParsedResumeData);
            return;
          }
          if (resume.status === "parse_failed") {
            handleFailed("Resume parsing failed. Please try again.");
            return;
          }
        }
      } catch {
        // Continue polling on error
      }

      if (!settled.current) {
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    void poll();
  }, [resumeId, resumeQuery, handleParsed, handleFailed]);

  useEffect(() => {
    if (!resumeId) {
      setParseStatus("idle");
      setParsedData(null);
      setError(null);
      settled.current = false;
      return;
    }

    settled.current = false;
    setParseStatus("parsing");
    setParsedData(null);
    setError(null);

    // Try WebSocket first
    const token = localStorage.getItem("wk-access-token");
    if (token) {
      const params = new URLSearchParams();
      params.set("token", token);
      const ws = new WebSocket(`${WS_BASE_URL}?${params}`);
      wsRef.current = ws;

      ws.onopen = () => {
        wsConnected.current = true;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.resumeId !== resumeId) return;

          if (message.type === "resume_parsed" && message.parsedData) {
            handleParsed(message.parsedData as ParsedResumeData);
          } else if (message.type === "resume_parsed" && !message.parsedData) {
            // Legacy event without parsedData — fetch via API
            void resumeQuery.refetch().then((result) => {
              if (result.data?.status === 200 && result.data.body.parsedData) {
                handleParsed(result.data.body.parsedData as ParsedResumeData);
              }
            });
          } else if (message.type === "resume_parse_failed") {
            handleFailed(message.error ?? "Resume parsing failed.");
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onclose = () => {
        wsConnected.current = false;
        if (!settled.current) {
          startPolling();
        }
      };

      // Grace period: if no WS event arrives (whether WS is connected or not),
      // start polling as a safety net. Covers the race where the parse event
      // was published before the socket opened.
      graceTimerRef.current = setTimeout(() => {
        if (!settled.current) {
          startPolling();
        }
      }, WS_GRACE_PERIOD_MS);
    } else {
      // No token — polling only
      startPolling();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current);
      }
    };
  }, [resumeId]);

  return { parsedData, parseStatus, error };
}
