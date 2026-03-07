import { api } from "@/lib/api-client";
import { useAuth } from "@/features/auth/hooks/use-auth";

export function useReferralStats() {
  const { user } = useAuth();
  const { data, isLoading, isError } = api.referrals.getMyReferral.useQuery({
    queryKey: ["referrals", "me", user?.id],
    queryData: {},
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  const body = data?.status === 200 ? data.body : null;

  return {
    code: body?.code ?? "",
    totalReferred: body?.totalReferred ?? 0,
    pendingCount: body?.pendingCount ?? 0,
    activatedCount: body?.activatedCount ?? 0,
    rewardedCount: body?.rewardedCount ?? 0,
    isLoading,
    isError,
  };
}
