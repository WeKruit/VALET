import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import {
  Monitor,
  MonitorOff,
  Maximize2,
  Minimize2,
  MousePointer,
  Eye,
  ExternalLink,
} from "lucide-react";

interface LiveViewProps {
  url: string;
  isVisible: boolean;
  onToggle: () => void;
  readOnly?: boolean;
  type?: "novnc" | "kasm" | "kasmvnc";
}

export function LiveView({
  url,
  isVisible,
  onToggle,
  readOnly = false,
  type = "novnc",
}: LiveViewProps) {
  const [isFullWidth, setIsFullWidth] = useState(false);
  const [viewOnly, setViewOnly] = useState(true);

  const effectiveViewOnly = readOnly || viewOnly;
  const iframeUrl = url
    ? `${url}/vnc.html?autoconnect=true&resize=scale&view_only=${effectiveViewOnly}`
    : "";

  if (!url) {
    return null;
  }

  const isKasm = type === "kasm";
  const isKasmVnc = type === "kasmvnc";
  // WEK-183: Feature flag — inline iframe requires kasm.wekruit.dev domain + real cert.
  // Until then, default to new-tab for Kasm/KasmVNC sessions with self-signed certs.
  const kasmInlineEnabled = import.meta.env.VITE_KASM_INLINE_IFRAME === "true";
  const useKasmIframe = isKasm && kasmInlineEnabled;
  const useKasmVncIframe = isKasmVnc && kasmInlineEnabled;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-[var(--wk-copilot)]" />
            <CardTitle className="text-lg">Live View</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {isVisible && (!isKasm || useKasmIframe) && (!isKasmVnc || useKasmVncIframe) && (
              <>
                {!readOnly && !isKasm && (
                  <Button
                    variant={viewOnly ? "ghost" : "primary"}
                    size="sm"
                    onClick={() => setViewOnly(!viewOnly)}
                    title={viewOnly ? "Take Control" : "View Only"}
                  >
                    {viewOnly ? (
                      <>
                        <MousePointer className="h-4 w-4 mr-1.5" />
                        Take Control
                      </>
                    ) : (
                      <>
                        <Eye className="h-4 w-4 mr-1.5" />
                        View Only
                      </>
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsFullWidth(!isFullWidth)}
                  title={isFullWidth ? "Collapse" : "Expand"}
                >
                  {isFullWidth ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>
              </>
            )}
            <Button variant="secondary" size="sm" onClick={onToggle}>
              {isVisible ? (
                <>
                  <MonitorOff className="h-4 w-4 mr-1.5" />
                  Hide
                </>
              ) : (
                <>
                  <Monitor className="h-4 w-4 mr-1.5" />
                  Show
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      {isVisible &&
        ((isKasm && !useKasmIframe) || (isKasmVnc && !useKasmVncIframe) ? (
          <CardContent>
            <div className="flex flex-col items-center justify-center gap-4 py-8 rounded-[var(--wk-radius-md)] border border-[var(--wk-border-primary)] bg-[var(--wk-bg-secondary)]">
              <Monitor className="h-12 w-12 text-[var(--wk-text-tertiary)]" />
              <div className="text-center">
                <p className="text-sm font-medium text-[var(--wk-text-primary)]">
                  Browser automation is running
                </p>
                <p className="mt-1 text-xs text-[var(--wk-text-tertiary)]">
                  Opens in a new tab with full desktop view
                </p>
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  Only one person can view at a time.
                </p>
              </div>
              <Button
                variant="primary"
                onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="h-4 w-4 mr-1.5" />
                Watch Live
              </Button>
            </div>
          </CardContent>
        ) : (
          <CardContent>
            <div
              className={`relative overflow-hidden rounded-[var(--wk-radius-md)] border border-[var(--wk-border-primary)] bg-black ${
                isFullWidth ? "w-full" : "max-w-4xl"
              }`}
            >
              <div className="aspect-video">
                <iframe
                  key={useKasmIframe || useKasmVncIframe ? "kasm" : String(viewOnly)}
                  src={useKasmIframe || useKasmVncIframe ? url : iframeUrl}
                  title={
                    useKasmIframe
                      ? "Kasm Live View"
                      : useKasmVncIframe
                        ? "KasmVNC Live View"
                        : "noVNC Live View"
                  }
                  className="h-full w-full border-0"
                  allow="clipboard-read; clipboard-write"
                  {...(!useKasmIframe &&
                    !useKasmVncIframe && {
                      sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
                    })}
                />
              </div>
            </div>
            {useKasmIframe || useKasmVncIframe ? (
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-[var(--wk-text-tertiary)]">
                  Watching browser automation in real time
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  Open in new tab
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-[var(--wk-text-tertiary)]">
                {viewOnly
                  ? "Watching browser automation in real time (view only)"
                  : "Interactive mode — you have keyboard and mouse control"}
              </p>
            )}
          </CardContent>
        ))}
    </Card>
  );
}
