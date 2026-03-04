import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Settings, X } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { api } from "@/lib/api-client";

export function CompleteSetupBanner() {
  const user = useAuth((s) => s.user);
  const userId = user?.id;

  const [dismissed, setDismissed] = useState(() => {
    if (!userId) return true;
    return localStorage.getItem(`valet:setup-banner-dismissed:${userId}`) === "true";
  });

  const readiness = api.credentials.checkReadiness.useQuery({
    queryKey: ["credential-readiness", "setup-banner"],
    queryData: {},
    staleTime: 1000 * 60,
    enabled: !!userId && !dismissed && user?.onboardingComplete === true,
  });

  if (!userId || dismissed || user?.onboardingComplete !== true) return null;
  if (readiness.isLoading) return null;

  const isReady = readiness.data?.status === 200 && readiness.data.body.overallReady;

  if (isReady) return null;

  function handleDismiss() {
    localStorage.setItem(`valet:setup-banner-dismissed:${userId}`, "true");
    setDismissed(true);
  }

  return (
    <Card className="border-[var(--wk-copilot)] border">
      <CardContent className="flex items-center gap-3 py-3 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-[var(--wk-radius-md)] bg-[var(--wk-surface-sunken)] shrink-0">
          <Settings className="h-4 w-4 text-[var(--wk-text-secondary)]" />
        </div>
        <p className="flex-1 text-sm text-[var(--wk-text-secondary)]">
          Complete your VALET setup to enable autonomous applications — add platform logins and
          email access
        </p>
        <Button variant="cta" size="sm" asChild>
          <Link to="/settings">Complete Setup</Link>
        </Button>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 p-1 rounded-[var(--wk-radius-md)] text-[var(--wk-text-tertiary)] hover:text-[var(--wk-text-primary)] hover:bg-[var(--wk-surface-sunken)] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </CardContent>
    </Card>
  );
}
