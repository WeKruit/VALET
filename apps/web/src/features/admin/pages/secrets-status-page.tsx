import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Badge } from "@valet/ui/components/badge";
import { Tabs, TabsList, TabsTrigger } from "@valet/ui/components/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@valet/ui/components/dialog";
import { Skeleton } from "@valet/ui/components/skeleton";
import { RefreshCw, Upload, KeyRound, ChevronRight, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSecretsDiff, useSyncSecrets } from "../hooks/use-secrets-sync";
import type { TargetDiff } from "../hooks/use-secrets-sync";

export function SecretsStatusPage() {
  const [env, setEnv] = useState<"staging" | "production">("staging");
  const [expandedTargets, setExpandedTargets] = useState<Set<string>>(new Set());
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);

  const { data, isFetching, isError, refetch } = useSecretsDiff(env);
  const syncMutation = useSyncSecrets();

  const toggleExpand = (target: string) => {
    setExpandedTargets((prev) => {
      const next = new Set(prev);
      if (next.has(target)) {
        next.delete(target);
      } else {
        next.add(target);
      }
      return next;
    });
  };

  const handleSync = async () => {
    try {
      await syncMutation.mutateAsync({ env });
      toast.success(`Secrets synced for ${env}.`);
      setSyncDialogOpen(false);
    } catch {
      toast.error("Failed to sync secrets.");
    }
  };

  if (isError) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-bold">Secrets Sync</h1>
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <AlertCircle className="mx-auto h-8 w-8 text-[var(--wk-status-error)]" />
            <p className="text-sm text-[var(--wk-text-secondary)]">Failed to load secrets diff.</p>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-semibold">Secrets Sync</h1>
          <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
            Compare deployed secrets against canonical .env reference files
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} />
            Check Drift
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setSyncDialogOpen(true)}
            disabled={!data}
          >
            <Upload className="mr-2 h-4 w-4" />
            Sync All
          </Button>
        </div>
      </div>

      {/* Environment Tabs */}
      <Tabs value={env} onValueChange={(v) => setEnv(v as "staging" | "production")}>
        <TabsList>
          <TabsTrigger value="staging">Staging</TabsTrigger>
          <TabsTrigger value="production">Production</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryCard label="Total Targets" value={data.summary.total} />
          <SummaryCard label="In Sync" value={data.summary.synced} color="green" />
          <SummaryCard label="Drifted" value={data.summary.drifted} color="amber" />
          <SummaryCard
            label="Errors"
            value={data.summary.errors + data.summary.unavailable}
            color="red"
          />
        </div>
      )}

      {/* Empty state */}
      {!data && !isFetching && (
        <Card>
          <CardContent className="py-12 text-center">
            <KeyRound className="mx-auto h-12 w-12 text-[var(--wk-text-tertiary)]" />
            <p className="mt-4 text-sm text-[var(--wk-text-secondary)]">
              Click &quot;Check Drift&quot; to compare deployed secrets against reference files
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {isFetching && !data && <LoadingSkeleton />}

      {/* Target groups */}
      {data && (
        <>
          <TargetGroup
            title="Fly.io Apps"
            targets={data.targets.filter((t) => t.targetType === "fly")}
            expandedTargets={expandedTargets}
            toggleExpand={toggleExpand}
          />
          <TargetGroup
            title="GitHub Actions"
            targets={data.targets.filter((t) => t.targetType === "gh-actions")}
            expandedTargets={expandedTargets}
            toggleExpand={toggleExpand}
          />
          <TargetGroup
            title="AWS Secrets Manager"
            targets={data.targets.filter((t) => t.targetType === "aws-sm")}
            expandedTargets={expandedTargets}
            toggleExpand={toggleExpand}
          />
        </>
      )}

      {/* Sync confirmation dialog */}
      <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sync Secrets</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--wk-text-secondary)]">
            This will push canonical .env values to all deployed targets for <strong>{env}</strong>.
            This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSyncDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleSync} disabled={syncMutation.isPending}>
              {syncMutation.isPending ? "Syncing..." : "Confirm Sync"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ───

function SummaryCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const colorClass =
    color === "green"
      ? "text-emerald-500"
      : color === "amber"
        ? "text-amber-500"
        : color === "red"
          ? "text-red-500"
          : "text-[var(--wk-text-primary)]";
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs font-medium text-[var(--wk-text-tertiary)] uppercase tracking-wide">
          {label}
        </p>
        <p className={cn("mt-1 text-2xl font-semibold", colorClass)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-[var(--wk-radius-lg)]" />
        ))}
      </div>
      <Skeleton className="h-48 w-full rounded-[var(--wk-radius-lg)]" />
    </div>
  );
}

function TargetGroup({
  title,
  targets,
  expandedTargets,
  toggleExpand,
}: {
  title: string;
  targets: TargetDiff[];
  expandedTargets: Set<string>;
  toggleExpand: (t: string) => void;
}) {
  if (targets.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {targets.map((t) => (
          <TargetRow
            key={t.target}
            target={t}
            expanded={expandedTargets.has(t.target)}
            onToggle={() => toggleExpand(t.target)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function TargetRow({
  target,
  expanded,
  onToggle,
}: {
  target: TargetDiff;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border border-[var(--wk-border-subtle)] rounded-lg">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--wk-surface-raised)] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <ChevronRight className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")} />
          <span className="text-sm font-medium">{target.target}</span>
          <span className="text-xs text-[var(--wk-text-tertiary)]">({target.role})</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--wk-text-tertiary)]">
            {target.matched} matched
            {target.missing.length > 0 && ` · ${target.missing.length} missing`}
            {target.extra.length > 0 && ` · ${target.extra.length} extra`}
            {target.mismatched > 0 && ` · ${target.mismatched} mismatched`}
          </span>
          <StatusBadge status={target.status} missing={target.missing.length} />
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-3 border-t border-[var(--wk-border-subtle)]">
          {target.error && <p className="text-xs text-red-500 mt-2">{target.error}</p>}
          {target.missing.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-red-500 mb-1">
                Missing ({target.missing.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {target.missing.map((k) => (
                  <code
                    key={k}
                    className="text-xs bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded"
                  >
                    {k}
                  </code>
                ))}
              </div>
            </div>
          )}
          {target.extra.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-[var(--wk-text-tertiary)] mb-1">
                Extra ({target.extra.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {target.extra.map((k) => (
                  <code
                    key={k}
                    className="text-xs bg-[var(--wk-surface-raised)] text-[var(--wk-text-secondary)] px-1.5 py-0.5 rounded"
                  >
                    {k}
                  </code>
                ))}
              </div>
            </div>
          )}
          {target.missing.length === 0 && target.extra.length === 0 && !target.error && (
            <p className="text-xs text-[var(--wk-text-tertiary)] mt-2">All keys in sync</p>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, missing }: { status: string; missing: number }) {
  switch (status) {
    case "synced":
      return (
        <Badge
          variant="default"
          className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
        >
          In Sync
        </Badge>
      );
    case "drifted":
      return (
        <Badge variant="default" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
          {missing} drifted
        </Badge>
      );
    case "error":
      return (
        <Badge variant="default" className="bg-red-500/10 text-red-500 border-red-500/20">
          Error
        </Badge>
      );
    case "unavailable":
      return (
        <Badge variant="default" className="bg-gray-500/10 text-gray-500 border-gray-500/20">
          Unavailable
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}
