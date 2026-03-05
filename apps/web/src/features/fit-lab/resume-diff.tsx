import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiffChange {
  section: string;
  field: string;
  before: string;
  after: string;
  reason: string;
}

interface DiffData {
  changedSections?: string[];
  changes?: DiffChange[];
}

interface ResumeDiffProps {
  diffData: DiffData;
  compact?: boolean;
}

export function ResumeDiff({ diffData, compact = false }: ResumeDiffProps) {
  const changes = diffData.changes ?? [];
  const changedSections = diffData.changedSections ?? [];

  if (changes.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className={compact ? "text-xs" : "text-sm"}>Resume Changes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-4 text-center text-xs text-[var(--wk-text-tertiary)]">
            No changes were made
          </p>
        </CardContent>
      </Card>
    );
  }

  // Group changes by section
  const grouped = changes.reduce<Record<string, DiffChange[]>>((acc, change) => {
    const key = change.section;
    if (!acc[key]) acc[key] = [];
    acc[key].push(change);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className={compact ? "text-xs" : "text-sm"}>
            Resume Changes ({changes.length})
          </CardTitle>
          <Badge variant="info" className="text-[9px]">
            {changedSections.length} section{changedSections.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {Object.entries(grouped).map(([section, sectionChanges]) => (
          <SectionGroup
            key={section}
            section={section}
            changes={sectionChanges}
            compact={compact}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function SectionGroup({
  section,
  changes,
  compact,
}: {
  section: string;
  changes: DiffChange[];
  compact: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-[var(--wk-radius-md)] border border-[var(--wk-border-subtle)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 p-2 text-left cursor-pointer hover:bg-[var(--wk-surface-sunken)] transition-colors rounded-t-[var(--wk-radius-md)]"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--wk-text-tertiary)]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--wk-text-tertiary)]" />
        )}
        <span className="text-xs font-medium text-[var(--wk-text-primary)]">{section}</span>
        <Badge variant="secondary" className="ml-auto text-[9px]">
          {changes.length}
        </Badge>
      </button>
      {expanded && (
        <div className="space-y-1.5 p-2 pt-0">
          {changes.map((change, i) => (
            <ChangeItem key={i} change={change} compact={compact} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChangeItem({ change, compact }: { change: DiffChange; compact: boolean }) {
  const [showReason, setShowReason] = useState(false);

  return (
    <div className="rounded-[var(--wk-radius-sm)] bg-[var(--wk-surface-sunken)] p-2">
      <p className="text-[10px] font-medium text-[var(--wk-text-tertiary)] mb-1">{change.field}</p>
      <div className={cn("space-y-1", compact && "text-[10px]")}>
        <div className="flex items-start gap-1.5">
          <span className="shrink-0 mt-0.5 inline-block h-2 w-2 rounded-full bg-[var(--wk-status-error)]" />
          <p className="text-xs text-[var(--wk-text-secondary)] line-through decoration-[var(--wk-status-error)]/30">
            {change.before}
          </p>
        </div>
        <div className="flex items-start gap-1.5">
          <span className="shrink-0 mt-0.5 inline-block h-2 w-2 rounded-full bg-[var(--wk-status-success)]" />
          <p className="text-xs text-[var(--wk-text-primary)]">{change.after}</p>
        </div>
      </div>
      {change.reason && (
        <button
          onClick={() => setShowReason(!showReason)}
          className="mt-1 flex items-center gap-1 text-[10px] text-[var(--wk-copilot)] hover:underline cursor-pointer"
        >
          <ArrowRight className="h-2.5 w-2.5" />
          {showReason ? "Hide reason" : "Why?"}
        </button>
      )}
      {showReason && (
        <p className="mt-1 text-[10px] text-[var(--wk-text-tertiary)] italic pl-3.5">
          {change.reason}
        </p>
      )}
    </div>
  );
}
