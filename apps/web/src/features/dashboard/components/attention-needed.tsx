import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { AlertTriangle, ArrowRight, ShieldAlert, Bot, KeyRound, Puzzle } from "lucide-react";
import { useTasks } from "@/features/tasks/hooks/use-tasks";
import { formatDistanceToNow } from "date-fns";

const blockerIcons: Record<string, React.ElementType> = {
  two_factor: ShieldAlert,
  bot_check: Bot,
  login_required: KeyRound,
  captcha: Puzzle,
};

export function AttentionNeeded() {
  const { data } = useTasks({ status: "waiting_human" });
  const waitingTasks = data?.status === 200 ? data.body.data : [];

  if (waitingTasks.length === 0) return null;

  return (
    <Card className="border-[var(--wk-status-warning)] border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-[var(--wk-status-warning)]" />
            <CardTitle className="text-lg">Needs Attention</CardTitle>
            <Badge variant="warning">{waitingTasks.length}</Badge>
          </div>
          <Link
            to="/tasks?status=waiting_human"
            className="flex items-center gap-1 text-xs font-medium text-[var(--wk-text-secondary)] hover:text-[var(--wk-text-primary)] transition-colors"
          >
            View All
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {waitingTasks.slice(0, 5).map((task) => {
            const blockerType = task.interaction?.type;
            const BlockerIcon = blockerType
              ? (blockerIcons[blockerType] ?? AlertTriangle)
              : AlertTriangle;

            return (
              <Link
                key={task.id}
                to={`/tasks/${task.id}`}
                className="flex items-center justify-between rounded-[var(--wk-radius-lg)] p-3 hover:bg-[var(--wk-surface-sunken)] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-[var(--wk-radius-md)] bg-amber-50 dark:bg-amber-950/30 shrink-0">
                    <BlockerIcon className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-medium truncate">
                      {task.jobTitle && task.companyName
                        ? `${task.jobTitle} at ${task.companyName}`
                        : (task.jobTitle ?? task.companyName ?? task.jobUrl)}
                    </span>
                    <span className="text-xs text-[var(--wk-text-tertiary)]">
                      {formatDistanceToNow(new Date(task.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 ml-3">
                  {blockerType ? (
                    <Badge variant="warning" className="text-[10px]">
                      {blockerType.replace("_", " ")}
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="text-[10px]">
                      review
                    </Badge>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
