import { api } from "@/lib/api-client";

const STALE_TIME = 1000 * 60 * 5; // 5 minutes

export function useVelocity(period: "7d" | "30d" | "90d") {
  return api.insights.getVelocity.useQuery({
    queryKey: ["insights", "velocity", period],
    queryData: { query: { period } },
    staleTime: STALE_TIME,
  });
}

export function useConversion() {
  return api.insights.getConversionByPlatform.useQuery({
    queryKey: ["insights", "conversion"],
    queryData: {},
    staleTime: STALE_TIME,
  });
}

export function useResponseRates() {
  return api.insights.getResponseRates.useQuery({
    queryKey: ["insights", "response-rates"],
    queryData: {},
    staleTime: STALE_TIME,
  });
}

export function useResumePerformance() {
  return api.insights.getResumePerformance.useQuery({
    queryKey: ["insights", "resume-performance"],
    queryData: {},
    staleTime: STALE_TIME,
  });
}
