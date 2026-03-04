import { Badge } from "@valet/ui/components/badge";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useCredentialReadiness } from "../hooks/use-credentials";

/**
 * Reusable credential readiness indicator.
 * Shows whether the user has the minimum credentials configured
 * for VALET to operate autonomously. Can be used in onboarding,
 * workbench, and settings.
 */
export function CredentialReadinessIndicator({ compact = false }: { compact?: boolean }) {
  const { data, isLoading } = useCredentialReadiness();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--wk-text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        {!compact && <span>Checking credentials...</span>}
      </div>
    );
  }

  const readiness = data?.status === 200 ? data.body : null;
  if (!readiness) return null;

  if (compact) {
    return readiness.overallReady ? (
      <Badge
        variant="default"
        className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
      >
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Ready
      </Badge>
    ) : (
      <Badge variant="secondary">
        <XCircle className="h-3 w-3 mr-1" />
        Setup needed
      </Badge>
    );
  }

  const activePlatforms = readiness.platforms.filter(
    (p) => p.hasCredential && p.status === "active",
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {readiness.overallReady ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <XCircle className="h-4 w-4 text-amber-500" />
        )}
        <span className="text-sm font-medium">
          {readiness.overallReady ? "Credentials ready" : "Credential setup incomplete"}
        </span>
      </div>
      <div className="text-xs text-[var(--wk-text-secondary)] space-y-1">
        <p>
          Platforms: {activePlatforms.length}/{readiness.platforms.length} configured
        </p>
        <p>
          Mailbox: {readiness.mailbox.hasCredential ? readiness.mailbox.status : "not configured"}
        </p>
      </div>
    </div>
  );
}
