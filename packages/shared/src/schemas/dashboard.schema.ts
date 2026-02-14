import { z } from "zod";

// ─── Dashboard Stats (same shape as taskStatsResponse but with failed) ───
export const dashboardStatsResponse = z.object({
  total: z.number(),
  completed: z.number(),
  inProgress: z.number(),
  needsReview: z.number(),
  failed: z.number(),
});

// ─── Trends (daily counts over last 30 days) ───
export const dashboardTrendPoint = z.object({
  date: z.string(),
  count: z.number(),
});

export const dashboardTrendsResponse = z.object({
  trends: z.array(dashboardTrendPoint),
});

// ─── Platform Breakdown ───
export const dashboardBreakdownItem = z.object({
  platform: z.string(),
  count: z.number(),
});

export const dashboardBreakdownResponse = z.object({
  breakdown: z.array(dashboardBreakdownItem),
});

// ─── Inferred Types ───
export type DashboardStatsResponse = z.infer<typeof dashboardStatsResponse>;
export type DashboardTrendPoint = z.infer<typeof dashboardTrendPoint>;
export type DashboardTrendsResponse = z.infer<typeof dashboardTrendsResponse>;
export type DashboardBreakdownItem = z.infer<typeof dashboardBreakdownItem>;
export type DashboardBreakdownResponse = z.infer<typeof dashboardBreakdownResponse>;
