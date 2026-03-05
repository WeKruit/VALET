import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@valet/ui/components/button";
import { Badge } from "@valet/ui/components/badge";
import { Globe, Keyboard, Loader2, WifiOff, X, Clock } from "lucide-react";

type SessionState = "connecting" | "connected" | "paused" | "expired" | "disconnected";

interface PageMeta {
  url: string;
  title: string;
}

/**
 * Browser Session Page — renders a live screenshot stream from the
 * VALET WebSocket proxy, with click/type/scroll interactivity.
 *
 * Route: /browser-session/:token
 * No auth guard — the token IS the auth.
 */
export function BrowserSessionPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<SessionState>("connecting");
  const [pageMeta, setPageMeta] = useState<PageMeta>({ url: "", title: "" });
  const [lastError, setLastError] = useState<string | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [frameSize, setFrameSize] = useState({ width: 1440, height: 900 });

  // Build WS URL from the same host as the API
  const wsBaseUrl = import.meta.env.VITE_WS_URL ?? "ws://localhost:8000/api/v1/ws";
  // Extract the base origin from the WS URL (ws://host:port/api/v1/ws → ws://host:port)
  const wsOrigin = wsBaseUrl.replace(/\/api\/v1\/ws$/, "");
  const wsUrl = `${wsOrigin}/api/v1/ws/browser-session/${token}`;

  useEffect(() => {
    if (!token) return;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setState("connecting");
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as Record<string, unknown>;

        if (msg.type === "session_state") {
          setState(msg.state as SessionState);
        } else if (msg.type === "page_meta") {
          setPageMeta({
            url: (msg.url as string) ?? "",
            title: (msg.title as string) ?? "",
          });
        } else if (msg.type === "frame") {
          const base64 = msg.data as string;
          const format = (msg.format as string) ?? "jpeg";
          drawFrame(base64, format);
        } else if (msg.type === "error") {
          setLastError(msg.message as string);
        } else if (msg.type === "pong") {
          // heartbeat ack
        }
      } catch {
        // ignore malformed
      }
    };

    ws.onclose = (event) => {
      if (event.code === 4001) {
        setState("expired");
        setLastError("Session token is invalid or expired");
      } else if (event.code === 4002) {
        setState("expired");
      } else {
        setState("disconnected");
      }
    };

    ws.onerror = () => {
      setLastError("WebSocket connection error");
      setState("disconnected");
    };

    // Ping every 15s
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 15_000);

    return () => {
      clearInterval(pingInterval);
      ws.close();
      wsRef.current = null;
    };
  }, [token, wsUrl]);

  const drawFrame = useCallback((base64: string, format: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const img = new Image();
    img.onload = () => {
      setFrameSize({ width: img.width, height: img.height });
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.drawImage(img, 0, 0);
    };
    img.src = `data:image/${format};base64,${base64}`;
  }, []);

  const sendMessage = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = Math.round((e.clientX - rect.left) * scaleX);
      const y = Math.round((e.clientY - rect.top) * scaleY);
      sendMessage({ type: "click", x, y });
    },
    [sendMessage],
  );

  const handleScroll = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = Math.round((e.clientX - rect.left) * scaleX);
      const y = Math.round((e.clientY - rect.top) * scaleY);
      sendMessage({ type: "scroll", x, y, deltaX: e.deltaX, deltaY: e.deltaY });
    },
    [sendMessage],
  );

  const handleTypeSubmit = useCallback(() => {
    if (textInput.trim()) {
      sendMessage({ type: "type", text: textInput });
      setTextInput("");
    }
  }, [textInput, sendMessage]);

  const stateConfig: Record<SessionState, { label: string; color: string }> = {
    connecting: { label: "Connecting...", color: "text-amber-500" },
    connected: { label: "Connected", color: "text-green-500" },
    paused: { label: "Paused", color: "text-amber-500" },
    expired: { label: "Session Expired", color: "text-red-500" },
    disconnected: { label: "Disconnected", color: "text-red-500" },
  };

  const isActive = state === "connected" || state === "connecting";

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-[var(--wk-text-secondary)]">Invalid session URL</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[var(--wk-surface-base)]">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-[var(--wk-border-subtle)] px-4 py-2">
        <div className="flex items-center gap-3">
          <Globe className="h-4 w-4 text-[var(--wk-text-secondary)]" />
          <div className="flex flex-col">
            <span className="text-sm font-medium truncate max-w-md">
              {pageMeta.title || "Browser Session"}
            </span>
            {pageMeta.url && (
              <span className="text-xs text-[var(--wk-text-tertiary)] truncate max-w-md">
                {pageMeta.url}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* State indicator */}
          <Badge variant={state === "connected" ? "default" : "secondary"} className="gap-1.5">
            {state === "connecting" && <Loader2 className="h-3 w-3 animate-spin" />}
            {state === "disconnected" && <WifiOff className="h-3 w-3" />}
            {state === "expired" && <Clock className="h-3 w-3" />}
            <span className={stateConfig[state].color}>{stateConfig[state].label}</span>
          </Badge>

          {/* Type button */}
          {isActive && (
            <Button variant="secondary" size="sm" onClick={() => setShowTextInput(!showTextInput)}>
              <Keyboard className="h-4 w-4 mr-1" />
              Type
            </Button>
          )}

          {/* Close */}
          <Button variant="ghost" size="sm" onClick={() => window.close()}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Text input bar */}
      {showTextInput && isActive && (
        <div className="flex items-center gap-2 border-b border-[var(--wk-border-subtle)] px-4 py-2 bg-[var(--wk-surface-sunken)]">
          <input
            type="text"
            className="flex-1 rounded-md border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-base)] px-3 py-1.5 text-sm"
            placeholder="Type text to send..."
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleTypeSubmit();
            }}
            autoFocus
          />
          <Button variant="primary" size="sm" onClick={handleTypeSubmit}>
            Send
          </Button>
        </div>
      )}

      {/* Canvas / content area */}
      <div className="flex-1 overflow-auto flex items-center justify-center bg-black">
        {state === "expired" || state === "disconnected" ? (
          <div className="text-center text-white space-y-4">
            <WifiOff className="h-12 w-12 mx-auto opacity-50" />
            <p className="text-lg">{stateConfig[state].label}</p>
            {lastError && <p className="text-sm opacity-70">{lastError}</p>}
            <Button variant="secondary" onClick={() => navigate(-1)}>
              Go Back
            </Button>
          </div>
        ) : state === "connecting" ? (
          <div className="text-center text-white space-y-4">
            <Loader2 className="h-12 w-12 mx-auto animate-spin opacity-50" />
            <p className="text-lg">Connecting to browser session...</p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            width={frameSize.width}
            height={frameSize.height}
            className="max-w-full max-h-full cursor-pointer"
            style={{ imageRendering: "auto" }}
            onClick={handleCanvasClick}
            onWheel={handleScroll}
          />
        )}
      </div>
    </div>
  );
}
