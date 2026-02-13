import { initContract } from "@ts-rest/core";
import {
  dashboardStatsResponse,
  dashboardTrendsResponse,
  dashboardBreakdownResponse,
} from "@valet/shared/schemas";

const c = initContract();

export const dashboardContract = c.router({
  stats: {
    method: "GET",
    path: "/api/v1/dashboard/stats",
    responses: {
      200: dashboardStatsResponse,
    },
    summary: "Get dashboard statistics for the current user",
  },
  trends: {
    method: "GET",
    path: "/api/v1/dashboard/trends",
    responses: {
      200: dashboardTrendsResponse,
    },
    summary: "Get daily application counts over the last 30 days",
  },
  breakdown: {
    method: "GET",
    path: "/api/v1/dashboard/breakdown",
    responses: {
      200: dashboardBreakdownResponse,
    },
    summary: "Get application count breakdown by platform",
  },
});
