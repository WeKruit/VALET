import * as React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, useCurrentUser } from "@/features/auth/hooks/use-auth";
import { useConsent } from "@/features/consent/hooks/use-consent";
import { DisclaimerModal } from "@/features/consent/components/disclaimer-modal";
import { LoadingSpinner } from "./loading-spinner";
import { api } from "@/lib/api-client";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, isLoading, setUser } = useAuth();
  const location = useLocation();
  const {
    isLoading: consentLoading,
    needsTos,
    copilotAccepted,
    markTosAccepted,
    markCopilotAccepted,
  } = useConsent();

  const currentUserQuery = useCurrentUser();

  // Sync fresh user data (especially role) from API to Zustand store
  React.useEffect(() => {
    if (currentUserQuery.data?.status === 200 && user) {
      const fresh = currentUserQuery.data.body;
      if (fresh.role !== user.role) {
        setUser({
          ...user,
          role: fresh.role as "user" | "developer" | "admin" | "superadmin",
        });
      }
    }
  }, [currentUserQuery.data, user, setUser]);

  const isOnboardingPath = location.pathname.startsWith("/onboarding");

  // All hooks must be called unconditionally (above any early returns)
  const resumesQuery = api.resumes.list.useQuery({
    queryKey: ["resumes", "list", user?.id],
    queryData: {},
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  const profileQuery = api.users.getProfile.useQuery({
    queryKey: ["user-profile", "auth-guard", user?.id],
    queryData: {},
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  // ─── Early returns (no hooks below this line) ───

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

  if (consentLoading || resumesQuery.isLoading || profileQuery.isLoading) {
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

  // Early access gate: waitlisted users (role === "user" or no role) can only see /early-access
  const isEarlyAccessPath = location.pathname === "/early-access";
  const isWaitlisted = !user.role || user.role === "user";
  if (isWaitlisted) {
    if (!isEarlyAccessPath) {
      return <Navigate to="/early-access" replace />;
    }
    return <>{children}</>;
  }

  // Onboarding is complete when the user has uploaded a resume, accepted the
  // copilot disclaimer, AND completed onboarding (server-side timestamp OR
  // localStorage fallback for same-device continuity).
  const hasResumes = resumesQuery.data?.status === 200 && resumesQuery.data.body.data.length > 0;
  const serverOnboardingDone =
    profileQuery.data?.status === 200 && !!profileQuery.data.body.onboardingCompletedAt;
  const localOnboardingDone = !!localStorage.getItem(`valet:onboarding:completed:${user.id}`);
  const onboardingFinished = serverOnboardingDone || localOnboardingDone;
  const onboardingComplete = hasResumes && !!copilotAccepted && onboardingFinished;

  // If onboarding NOT complete and not already on /onboarding → redirect there
  if (!onboardingComplete && !isOnboardingPath) {
    return <Navigate to="/onboarding" replace />;
  }

  // If onboarding IS complete and on /onboarding → redirect to workbench
  if (onboardingComplete && isOnboardingPath) {
    return <Navigate to="/apply" replace />;
  }

  return <>{children}</>;
}
