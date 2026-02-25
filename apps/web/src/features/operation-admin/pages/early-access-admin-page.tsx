import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Input } from "@valet/ui/components/input";
import { Badge } from "@valet/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@valet/ui/components/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@valet/ui/components/dialog";
import { Skeleton } from "@valet/ui/components/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@valet/ui/components/dropdown-menu";
import {
  Search,
  RefreshCw,
  Users,
  MoreVertical,
  Rocket,
  MailIcon,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { formatRelativeTime } from "@/lib/utils";
import {
  useEarlyAccessList,
  useEarlyAccessStats,
  usePromoteEarlyAccess,
  useResendEarlyAccess,
  useRemoveEarlyAccess,
} from "../hooks/use-early-access-admin";

const ALL = "__all__" as const;

type EmailStatusFilter = typeof ALL | "pending" | "sent" | "promoted" | "failed";

interface ConfirmAction {
  type: "promote" | "delete";
  id: string;
  name: string;
  email: string;
}

function emailStatusBadge(status: string) {
  switch (status) {
    case "sent":
      return <Badge variant="success">Sent</Badge>;
    case "promoted":
      return <Badge variant="info">Promoted</Badge>;
    case "pending":
      return <Badge variant="warning">Pending</Badge>;
    case "failed":
      return <Badge variant="error">Failed</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function StatCard({
  label,
  value,
  icon: Icon,
  variant,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  variant: "default" | "warning" | "success" | "error";
}) {
  const bgMap = {
    default: "bg-[var(--wk-surface-raised)]",
    warning: "bg-[color-mix(in_srgb,var(--wk-status-warning)_8%,transparent)]",
    success: "bg-[color-mix(in_srgb,var(--wk-status-success)_8%,transparent)]",
    error: "bg-[color-mix(in_srgb,var(--wk-status-error)_8%,transparent)]",
  };
  const iconMap = {
    default: "text-[var(--wk-text-secondary)]",
    warning: "text-[var(--wk-status-warning)]",
    success: "text-[var(--wk-status-success)]",
    error: "text-[var(--wk-status-error)]",
  };
  return (
    <Card className="flex-1 min-w-[140px]">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--wk-radius-lg)] ${bgMap[variant]}`}
          >
            <Icon className={`h-4 w-4 ${iconMap[variant]}`} />
          </div>
          <div>
            <p className="text-2xl font-semibold font-display text-[var(--wk-text-primary)]">
              {value}
            </p>
            <p className="text-xs text-[var(--wk-text-tertiary)]">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function EarlyAccessAdminPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EmailStatusFilter>(ALL);
  const [page, setPage] = useState(1);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const listQuery = useEarlyAccessList({
    page,
    limit: 25,
    ...(search ? { search } : {}),
    ...(statusFilter !== ALL ? { emailStatus: statusFilter } : {}),
  });
  const statsQuery = useEarlyAccessStats();
  const promoteMutation = usePromoteEarlyAccess();
  const resendMutation = useResendEarlyAccess();
  const removeMutation = useRemoveEarlyAccess();

  const listData = listQuery.data?.status === 200 ? listQuery.data.body : null;
  const items = listData?.items ?? [];
  const total = listData?.total ?? 0;
  const totalPages = listData?.totalPages ?? 1;

  const statsData = statsQuery.data?.status === 200 ? statsQuery.data.body : null;
  const byStatus = statsData?.byStatus ?? {};

  function handleConfirm() {
    if (!confirmAction) return;

    if (confirmAction.type === "promote") {
      promoteMutation.mutate(
        { params: { id: confirmAction.id }, body: {} },
        {
          onSuccess: (res) => {
            if (res.status === 200) {
              toast.success(`Promoted ${confirmAction.email} to beta.`);
            } else {
              toast.error("Failed to promote user.");
            }
            setConfirmAction(null);
          },
          onError: () => {
            toast.error("Failed to promote user.");
            setConfirmAction(null);
          },
        },
      );
    } else {
      removeMutation.mutate(
        { params: { id: confirmAction.id }, body: {} },
        {
          onSuccess: (res) => {
            if (res.status === 200) {
              toast.success(`Removed ${confirmAction.email}.`);
            } else {
              toast.error("Failed to remove submission.");
            }
            setConfirmAction(null);
          },
          onError: () => {
            toast.error("Failed to remove submission.");
            setConfirmAction(null);
          },
        },
      );
    }
  }

  function handleResend(id: string, email: string) {
    resendMutation.mutate(
      { params: { id }, body: {} },
      {
        onSuccess: (res) => {
          if (res.status === 200) {
            toast.success(`Resent email to ${email}.`);
          } else {
            toast.error("Failed to resend email.");
          }
        },
        onError: () => {
          toast.error("Failed to resend email.");
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-display font-semibold text-[var(--wk-text-primary)]">
          Early Access
        </h1>
        <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
          Manage waitlist submissions and beta invites
        </p>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        <StatCard label="Total" value={statsData?.total ?? 0} icon={Users} variant="default" />
        <StatCard label="Pending" value={byStatus["pending"] ?? 0} icon={Clock} variant="warning" />
        <StatCard
          label="Sent"
          value={byStatus["sent"] ?? 0}
          icon={CheckCircle2}
          variant="success"
        />
        <StatCard label="Failed" value={byStatus["failed"] ?? 0} icon={XCircle} variant="error" />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--wk-text-tertiary)]" />
              <Input
                placeholder="Search by name or email..."
                aria-label="Search submissions by name or email"
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v: string) => {
                setStatusFilter(v as EmailStatusFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Email Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="promoted">Promoted</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                listQuery.refetch();
                statsQuery.refetch();
              }}
              title="Refresh"
              aria-label="Refresh data"
            >
              <RefreshCw className={`h-4 w-4 ${listQuery.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Submissions
            {total > 0 && (
              <span className="text-sm font-normal text-[var(--wk-text-secondary)]">({total})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {listQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : listQuery.isError ? (
            <div className="py-12 text-center text-sm text-[var(--wk-status-error)]">
              Failed to load submissions. Please try refreshing.
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="mx-auto h-10 w-10 text-[var(--wk-text-tertiary)]" />
              <p className="mt-3 text-sm font-medium text-[var(--wk-text-primary)]">
                No submissions found
              </p>
              <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
                {search || statusFilter !== ALL
                  ? "Try adjusting your filters."
                  : "No one has signed up for early access yet."}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--wk-border-subtle)]">
                      <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                        Name
                      </th>
                      <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                        Email
                      </th>
                      <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                        Source
                      </th>
                      <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                        Email Status
                      </th>
                      <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                        Submitted
                      </th>
                      <th className="pb-3 text-right font-medium text-[var(--wk-text-secondary)]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--wk-border-subtle)]">
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        className="group hover:bg-[var(--wk-surface-raised)] transition-colors"
                      >
                        <td className="py-3 pr-4">
                          <span className="font-medium text-[var(--wk-text-primary)]">
                            {item.name}
                          </span>
                          {item.referralCode && (
                            <span className="ml-2 text-xs text-[var(--wk-text-tertiary)]">
                              ref: {item.referralCode}
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-[var(--wk-text-secondary)]">{item.email}</td>
                        <td className="py-3 pr-4">
                          <Badge variant="secondary">{item.source}</Badge>
                        </td>
                        <td className="py-3 pr-4">{emailStatusBadge(item.emailStatus)}</td>
                        <td className="py-3 pr-4 text-[var(--wk-text-secondary)]">
                          {formatRelativeTime(item.createdAt)}
                        </td>
                        <td className="py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={`Actions for ${item.name}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() =>
                                  setConfirmAction({
                                    type: "promote",
                                    id: item.id,
                                    name: item.name,
                                    email: item.email,
                                  })
                                }
                              >
                                <Rocket className="mr-2 h-4 w-4" />
                                Promote to Beta
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleResend(item.id, item.email)}
                                disabled={resendMutation.isPending}
                              >
                                <MailIcon className="mr-2 h-4 w-4" />
                                Resend Email
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-[var(--wk-status-error)] focus:text-[var(--wk-status-error)]"
                                onClick={() =>
                                  setConfirmAction({
                                    type: "delete",
                                    id: item.id,
                                    name: item.name,
                                    email: item.email,
                                  })
                                }
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-[var(--wk-border-subtle)] pt-4">
                  <p className="text-sm text-[var(--wk-text-secondary)]">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Confirm Dialog */}
      <Dialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => !open && setConfirmAction(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.type === "promote" ? "Promote to Beta" : "Delete Submission"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.type === "promote" ? (
                <>
                  This will send a beta welcome email to{" "}
                  <span className="font-medium text-[var(--wk-text-primary)]">
                    {confirmAction?.email}
                  </span>{" "}
                  and grant them access.
                </>
              ) : (
                <>
                  Are you sure you want to delete the submission from{" "}
                  <span className="font-medium text-[var(--wk-text-primary)]">
                    {confirmAction?.email}
                  </span>
                  ? This action cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              variant={confirmAction?.type === "delete" ? "destructive" : "primary"}
              onClick={handleConfirm}
              disabled={promoteMutation.isPending || removeMutation.isPending}
            >
              {promoteMutation.isPending || removeMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" />
                  {confirmAction?.type === "promote" ? "Promoting..." : "Deleting..."}
                </>
              ) : confirmAction?.type === "promote" ? (
                <>
                  <Rocket className="h-4 w-4" />
                  Promote
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
