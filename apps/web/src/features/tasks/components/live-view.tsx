import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Monitor, MonitorOff, Maximize2, Minimize2, MousePointer, Eye } from "lucide-react";

interface LiveViewProps {
  url: string;
  isVisible: boolean;
  onToggle: () => void;
  readOnly?: boolean;
}

export function LiveView({ url, isVisible, onToggle, readOnly = false }: LiveViewProps) {
  const [isFullWidth, setIsFullWidth] = useState(false);
  const [viewOnly, setViewOnly] = useState(true);

  const effectiveViewOnly = readOnly || viewOnly;
  const iframeUrl = url
    ? `${url}/vnc.html?autoconnect=true&resize=scale&view_only=${effectiveViewOnly}`
    : "";

  if (!url) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-[var(--wk-copilot)]" />
            <CardTitle className="text-lg">Live View</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {isVisible && (
              <>
                {!readOnly && (
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
      {isVisible && (
        <CardContent>
          <div
            className={`relative overflow-hidden rounded-[var(--wk-radius-md)] border border-[var(--wk-border-primary)] bg-black ${
              isFullWidth ? "w-full" : "max-w-4xl"
            }`}
          >
            <div className="aspect-video">
              <iframe
                key={String(viewOnly)}
                src={iframeUrl}
                title="noVNC Live View"
                className="h-full w-full border-0"
                allow="clipboard-read; clipboard-write"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--wk-text-tertiary)]">
            {viewOnly
              ? "Watching browser automation in real time (view only)"
              : "Interactive mode — you have keyboard and mouse control"}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
