import { api } from "@/lib/api-client";

export function useCreditBalance() {
  const { data, isLoading } = api.credits.getBalance.useQuery({
    queryKey: ["credits", "balance"],
    queryData: {},
    staleTime: 1000 * 60,
  });

  const body = data?.status === 200 ? data.body : null;

  return {
    balance: body?.balance ?? 0,
    trialExpiry: body?.trialExpiry ?? null,
    enforcementEnabled: body?.enforcementEnabled ?? false,
    isLoading,
  };
}
