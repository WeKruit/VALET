import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Badge } from "@valet/ui/components/badge";
import { Tabs, TabsList, TabsTrigger } from "@valet/ui/components/tabs";
import { Skeleton } from "@valet/ui/components/skeleton";
import {
  KeyRound,
  Plus,
  Upload,
  Eye,
  EyeOff,
  Copy,
  Pencil,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSecretVars, useDeleteSecretVars } from "../hooks/use-secrets-sync";
import type { SecretVar } from "../hooks/use-secrets-sync";
import { SecretFormDialog } from "./secret-form-dialog";
import { BulkImportDialog } from "./bulk-import-dialog";

export function SecretsCrudPanel() {
  const [env, setEnv] = useState<"staging" | "production">("staging");
  const [project, setProject] = useState<"valet" | "ghosthands">("valet");
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editVar, setEditVar] = useState<SecretVar | null>(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useSecretVars(env, project);
  const deleteMutation = useDeleteSecretVars();

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleCopy = (value: string) => {
    navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard");
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`Delete secret "${key}" from ${project}/${env}?`)) return;
    try {
      await deleteMutation.mutateAsync({ env, project, keys: [key] });
      toast.success(`Deleted ${key}`);
    } catch {
      toast.error("Failed to delete secret");
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Tabs value={env} onValueChange={(v) => setEnv(v as "staging" | "production")}>
            <TabsList>
              <TabsTrigger value="staging">Staging</TabsTrigger>
              <TabsTrigger value="production">Production</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={project} onValueChange={(v) => setProject(v as "valet" | "ghosthands")}>
            <TabsList>
              <TabsTrigger value="valet">VALET</TabsTrigger>
              <TabsTrigger value="ghosthands">GhostHands</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setBulkImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Bulk Import
          </Button>
          <Button variant="primary" size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Secret
          </Button>
        </div>
      </div>

      {/* Info */}
      {data && (
        <div className="flex items-center gap-3 text-xs text-[var(--wk-text-tertiary)]">
          <span>
            <strong>{data.totalKeys}</strong> keys in{" "}
            <code className="bg-[var(--wk-surface-raised)] px-1 py-0.5 rounded">
              {data.secretId}
            </code>
          </span>
          {data.lastModified && (
            <span>Last modified: {new Date(data.lastModified).toLocaleString()}</span>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <Card>
          <CardContent className="py-8 text-center space-y-3">
            <AlertCircle className="mx-auto h-8 w-8 text-[var(--wk-status-error)]" />
            <p className="text-sm text-[var(--wk-text-secondary)]">Failed to load secrets.</p>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {data && data.vars.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <KeyRound className="mx-auto h-12 w-12 text-[var(--wk-text-tertiary)]" />
            <p className="mt-4 text-sm text-[var(--wk-text-secondary)]">
              No secrets found in <code>{data.secretId}</code>. Add your first secret or use bulk
              import.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Secrets table */}
      {data && data.vars.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Secrets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.vars.map((v) => (
              <SecretRow
                key={v.key}
                secretVar={v}
                revealed={revealedKeys.has(v.key)}
                onToggleReveal={() => toggleReveal(v.key)}
                onCopy={() => handleCopy(v.value)}
                onEdit={() => setEditVar(v)}
                onDelete={() => handleDelete(v.key)}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Add / Edit dialog */}
      <SecretFormDialog
        open={addDialogOpen || editVar !== null}
        onClose={() => {
          setAddDialogOpen(false);
          setEditVar(null);
        }}
        env={env}
        project={project}
        editVar={editVar}
      />

      {/* Bulk import dialog */}
      <BulkImportDialog
        open={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        env={env}
        project={project}
      />
    </div>
  );
}

function SecretRow({
  secretVar,
  revealed,
  onToggleReveal,
  onCopy,
  onEdit,
  onDelete,
}: {
  secretVar: SecretVar;
  revealed: boolean;
  onToggleReveal: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 py-2 rounded-lg border border-[var(--wk-border-subtle)] hover:bg-[var(--wk-surface-raised)] transition-colors",
        secretVar.isRuntime && "opacity-60",
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <code className="text-xs font-medium whitespace-nowrap">{secretVar.key}</code>
        {secretVar.isRuntime && (
          <Badge variant="secondary" className="text-[10px]">
            runtime
          </Badge>
        )}
        <span className="text-xs text-[var(--wk-text-tertiary)] truncate max-w-[300px]">
          {revealed ? secretVar.value : "••••••••"}
        </span>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={onToggleReveal}
          title={revealed ? "Hide" : "Reveal"}
        >
          {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onCopy} title="Copy">
          <Copy className="h-3.5 w-3.5" />
        </Button>
        {!secretVar.isRuntime && (
          <>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onEdit} title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
              onClick={onDelete}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
