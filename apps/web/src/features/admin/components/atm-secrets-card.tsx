import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { Button } from "@valet/ui/components/button";
import { Skeleton } from "@valet/ui/components/skeleton";
import { KeyRound, ExternalLink, ShieldCheck, ShieldOff } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { useAtmSecretsStatus } from "../hooks/use-sandboxes";

interface AtmSecretsCardProps {
  sandboxId: string;
  enabled?: boolean;
}

export function AtmSecretsCard({ sandboxId, enabled = true }: AtmSecretsCardProps) {
  const { data: status, isLoading } = useAtmSecretsStatus(sandboxId, enabled);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Secrets Manager
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (status === null || status === undefined) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Secrets Manager
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--wk-text-tertiary)]">
            Secrets manager not configured for this sandbox.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Secrets Manager
            {status.connected ? (
              <Badge variant="success" className="text-xs">
                Connected
              </Badge>
            ) : (
              <Badge variant="error" className="text-xs">
                Disconnected
              </Badge>
            )}
          </CardTitle>
          <Button variant="secondary" size="sm" asChild>
            <a href="https://infisical-wekruit.fly.dev" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Open Infisical
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoItem label="Provider">{status.provider}</InfoItem>
          <InfoItem label="Project ID">
            {status.projectId ? (
              <span className="font-mono text-xs">{status.projectId}</span>
            ) : (
              <span className="text-[var(--wk-text-tertiary)]">-</span>
            )}
          </InfoItem>
          <InfoItem label="Environment">
            {status.environment ?? <span className="text-[var(--wk-text-tertiary)]">-</span>}
          </InfoItem>
          <InfoItem label="Secret Count">
            <span className="font-semibold tabular-nums">{status.secretCount}</span>
          </InfoItem>
        </div>

        {/* Connection status detail */}
        <div className="mt-4 flex items-center gap-2 text-sm">
          {status.connected ? (
            <>
              <ShieldCheck className="h-4 w-4 text-[var(--wk-status-success)]" />
              <span className="text-[var(--wk-text-secondary)]">
                Infisical agent connected
                {status.lastSyncAt && (
                  <span className="text-[var(--wk-text-tertiary)]">
                    {" "}
                    &middot; Last sync {formatRelativeTime(status.lastSyncAt)}
                  </span>
                )}
              </span>
            </>
          ) : (
            <>
              <ShieldOff className="h-4 w-4 text-[var(--wk-status-error)]" />
              <span className="text-[var(--wk-text-secondary)]">Infisical agent not connected</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InfoItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--wk-text-tertiary)]">
        {label}
      </p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}
