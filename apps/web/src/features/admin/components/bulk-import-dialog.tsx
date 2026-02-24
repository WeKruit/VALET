import { useState, useMemo } from "react";
import { Button } from "@valet/ui/components/button";
import { Textarea } from "@valet/ui/components/textarea";
import { Badge } from "@valet/ui/components/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@valet/ui/components/dialog";
import { toast } from "sonner";
import { useUpsertSecretVars } from "../hooks/use-secrets-sync";

const KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

function parseEnvContent(content: string): Array<{ key: string; value: string }> {
  const result: Array<{ key: string; value: string }> = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)/);
    if (!match) continue;
    const key = match[1]!;
    let value = match[2]!.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) {
      result.push({ key, value });
    }
  }
  return result;
}

export function BulkImportDialog({
  open,
  onClose,
  env,
  project,
}: {
  open: boolean;
  onClose: () => void;
  env: "staging" | "production";
  project: "valet" | "ghosthands";
}) {
  const [content, setContent] = useState("");
  const upsertMutation = useUpsertSecretVars();

  const parsed = useMemo(() => parseEnvContent(content), [content]);
  const validVars = parsed.filter((v) => KEY_PATTERN.test(v.key));
  const invalidVars = parsed.filter((v) => !KEY_PATTERN.test(v.key));

  const handleImport = async () => {
    if (validVars.length === 0) {
      toast.error("No valid key-value pairs to import");
      return;
    }
    try {
      const result = await upsertMutation.mutateAsync({
        env,
        project,
        vars: validVars,
      });
      toast.success(`Imported ${result.upserted} secrets`);
      setContent("");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setContent("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Import Secrets</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-xs text-[var(--wk-text-secondary)]">
            Paste .env format content below. Lines starting with # are ignored.
          </p>
          <Textarea
            placeholder={
              "DATABASE_URL=postgres://...\nJWT_SECRET=my-secret\n# Comments are ignored"
            }
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            className="font-mono text-xs"
          />
          {parsed.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant="default"
                  className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                >
                  {validVars.length} valid
                </Badge>
                {invalidVars.length > 0 && (
                  <Badge variant="default" className="bg-red-500/10 text-red-500 border-red-500/20">
                    {invalidVars.length} invalid
                  </Badge>
                )}
              </div>
              <div className="max-h-32 overflow-y-auto text-xs space-y-0.5">
                {validVars.map((v) => (
                  <div
                    key={v.key}
                    className="flex items-center gap-2 text-[var(--wk-text-secondary)]"
                  >
                    <code className="font-medium text-[var(--wk-text-primary)]">{v.key}</code>
                    <span className="text-[var(--wk-text-tertiary)]">= ••••••••</span>
                  </div>
                ))}
                {invalidVars.map((v) => (
                  <div key={v.key} className="flex items-center gap-2 text-red-500">
                    <code className="font-medium">{v.key}</code>
                    <span className="text-[10px]">invalid key format</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-[var(--wk-text-tertiary)]">
            Target:{" "}
            <code>
              {project}/{env}
            </code>
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => {
              setContent("");
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={upsertMutation.isPending || validVars.length === 0}
          >
            {upsertMutation.isPending ? "Importing..." : `Import ${validVars.length} Secrets`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
