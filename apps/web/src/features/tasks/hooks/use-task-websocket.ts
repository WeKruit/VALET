import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRealtimeStore } from "@/stores/realtime.store";

const WS_BASE_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8000/api/v1/ws";

const MAX_RECONNECT_DELAY = 30_000;

export function useTaskWebSocket(taskId: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const queryClient = useQueryClient();
  const { setStatus, setLastMessage } = useRealtimeStore();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");

    const token = localStorage.getItem("wk-access-token");
    const params = new URLSearchParams({ taskId });
    if (token) params.set("token", token);
    const ws = new WebSocket(`${WS_BASE_URL}?${params}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      reconnectAttempt.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        setLastMessage(message);

        // Invalidate relevant queries based on message type
        if (
          message.type === "task_update" ||
          message.type === "task_needs_human" ||
          message.type === "task_resumed" ||
          message.type === "state_change" ||
          message.type === "completed" ||
          message.type === "error"
        ) {
          queryClient.invalidateQueries({ queryKey: ["tasks", taskId] });
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      wsRef.current = null;

      // Exponential backoff reconnect
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempt.current), MAX_RECONNECT_DELAY);
      reconnectAttempt.current++;
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [taskId, queryClient, setStatus, setLastMessage]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    status: useRealtimeStore((s) => s.status),
    lastMessage: useRealtimeStore((s) => s.lastMessage),
  };
}
