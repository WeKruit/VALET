import { StatsCards } from "../components/stats-cards";
import { ActiveTasks } from "../components/active-tasks";
import { RecentApplications } from "../components/recent-applications";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useDashboardWebSocket } from "../hooks/use-dashboard-websocket";

export function DashboardPage() {
  const user = useAuth((s) => s.user);
  const firstName = user?.name?.split(" ")[0] ?? "there";
  const { status: wsStatus } = useDashboardWebSocket();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold text-[var(--wk-text-primary)]">
            Welcome back, {firstName}
          </h1>
          <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
            Here's what's happening with your applications
          </p>
        </div>
        <div className="flex items-center gap-1.5 pt-1">
          <div
            className={`h-2 w-2 rounded-full transition-colors ${
              wsStatus === "connected"
                ? "bg-[var(--wk-status-success)]"
                : wsStatus === "connecting"
                  ? "bg-[var(--wk-status-warning)] animate-pulse"
                  : "bg-[var(--wk-status-error)]"
            }`}
          />
          <span className="text-xs text-[var(--wk-text-tertiary)]">
            {wsStatus === "connected"
              ? "Live"
              : wsStatus === "connecting"
                ? "Connecting"
                : "Offline"}
          </span>
        </div>
      </div>

      <StatsCards />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ActiveTasks />
        <RecentApplications />
      </div>
    </div>
  );
}
