import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Monitor, MonitorOff } from "lucide-react";

interface LiveViewProps {
  url: string;
  isVisible: boolean;
  onToggle: () => void;
  readOnly?: boolean;
  type?: "novnc" | "kasm" | "kasmvnc";
}

export function LiveView({
  url: _url,
  isVisible,
  onToggle,
  readOnly: _readOnly,
  type: _type,
}: LiveViewProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-[var(--wk-copilot)]" />
            <CardTitle className="text-lg">Live View</CardTitle>
          </div>
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
      </CardHeader>
      {isVisible && (
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-3 py-8 rounded-[var(--wk-radius-md)] border border-[var(--wk-border-primary)] bg-[var(--wk-bg-secondary)]">
            <Monitor className="h-10 w-10 text-[var(--wk-text-tertiary)]" />
            <p className="text-sm text-[var(--wk-text-secondary)]">
              Legacy view unavailable — browser session coming soon
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
