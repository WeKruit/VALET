import { api } from "@/lib/api-client";

export function useCreditLedger(page = 1, pageSize = 20) {
  const { data, isLoading, isError } = api.credits.getLedger.useQuery({
    queryKey: ["credits", "ledger", page, pageSize],
    queryData: { query: { page, pageSize } },
    staleTime: 1000 * 30,
  });

  const body = data?.status === 200 ? data.body : null;

  return {
    entries: body?.entries ?? [],
    total: body?.total ?? 0,
    page: body?.page ?? page,
    pageSize: body?.pageSize ?? pageSize,
    isLoading,
    isError,
  };
}
