import { api } from "@/lib/api-client";

export function useCostConfig() {
  const { data, isLoading, isError } = api.credits.getCostConfig.useQuery({
    queryKey: ["credits", "cost-config"],
    queryData: {},
    staleTime: 1000 * 60 * 30,
  });

  const body = data?.status === 200 ? data.body : null;

  return {
    costs: body?.costs ?? [],
    isLoading,
    isError,
  };
}
