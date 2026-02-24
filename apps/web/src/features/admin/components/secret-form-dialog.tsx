import { useState, useEffect } from "react";
import { Button } from "@valet/ui/components/button";
import { Input } from "@valet/ui/components/input";
import { Textarea } from "@valet/ui/components/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@valet/ui/components/dialog";
import { toast } from "sonner";
import { useUpsertSecretVars } from "../hooks/use-secrets-sync";
import type { SecretVar } from "../hooks/use-secrets-sync";

const KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
const RUNTIME_VARS = new Set([
  "GH_WORKER_ID",
  "COMMIT_SHA",
  "BUILD_TIME",
  "EC2_INSTANCE_ID",
  "EC2_IP",
  "IMAGE_TAG",
]);

export function SecretFormDialog({
  open,
  onClose,
  env,
  project,
  editVar,
}: {
  open: boolean;
  onClose: () => void;
  env: "staging" | "production";
  project: "valet" | "ghosthands";
  editVar: SecretVar | null;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const upsertMutation = useUpsertSecretVars();

  const isEdit = editVar !== null;

  useEffect(() => {
    if (editVar) {
      setKey(editVar.key);
      setValue(editVar.value);
    } else {
      setKey("");
      setValue("");
    }
    setError(null);
  }, [editVar, open]);

  const validate = (): boolean => {
    if (!key.trim()) {
      setError("Key is required");
      return false;
    }
    if (!KEY_PATTERN.test(key)) {
      setError("Key must match [A-Z_][A-Z0-9_]* (e.g. DATABASE_URL)");
      return false;
    }
    if (RUNTIME_VARS.has(key)) {
      setError(`${key} is a runtime-injected variable and cannot be set here`);
      return false;
    }
    if (!value) {
      setError("Value is required");
      return false;
    }
    setError(null);
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      await upsertMutation.mutateAsync({
        env,
        project,
        vars: [{ key, value }],
      });
      toast.success(isEdit ? `Updated ${key}` : `Added ${key}`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save secret");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Secret" : "Add Secret"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label htmlFor="secret-key" className="text-sm font-medium">
              Key
            </label>
            <Input
              id="secret-key"
              placeholder="DATABASE_URL"
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              disabled={isEdit}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="secret-value" className="text-sm font-medium">
              Value
            </label>
            <Textarea
              id="secret-value"
              placeholder="Enter secret value..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={3}
              className="font-mono text-sm"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <p className="text-xs text-[var(--wk-text-tertiary)]">
            Target:{" "}
            <code>
              {project}/{env}
            </code>
          </p>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={upsertMutation.isPending}>
            {upsertMutation.isPending ? "Saving..." : isEdit ? "Update" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
