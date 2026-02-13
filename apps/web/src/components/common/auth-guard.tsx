import * as React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useConsent } from "@/features/consent/hooks/use-consent";
import { DisclaimerModal } from "@/features/consent/components/disclaimer-modal";
import { LoadingSpinner } from "./loading-spinner";
import { api } from "@/lib/api-client";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const {
    isLoading: consentLoading,
    needsTos,
    copilotAccepted,
    markTosAccepted,
    markCopilotAccepted,
  } = useConsent();

  const isOnboardingPath = location.pathname.startsWith("/onboarding");

  const resumesQuery = api.resumes.list.useQuery({
    queryKey: ["resumes", "list", user?.id],
    queryData: {},
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--wk-surface-page)]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (consentLoading || resumesQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--wk-surface-page)]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Show ToS modal if needed (blocks everything)
  if (needsTos) {
    return (
      <DisclaimerModal
        step="tos"
        onTosAccepted={markTosAccepted}
        onCopilotAccepted={markCopilotAccepted}
      />
    );
  }

  // Determine onboarding completion: has at least 1 resume + copilot disclaimer accepted
  const hasResumes =
    resumesQuery.data?.status === 200 &&
    resumesQuery.data.body.data.length > 0;
  const onboardingComplete = hasResumes && !!copilotAccepted;

  // If onboarding NOT complete and not already on /onboarding → redirect there
  if (!onboardingComplete && !isOnboardingPath) {
    return <Navigate to="/onboarding" replace />;
  }

  // If onboarding IS complete and on /onboarding → redirect to /dashboard
  if (onboardingComplete && isOnboardingPath) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
