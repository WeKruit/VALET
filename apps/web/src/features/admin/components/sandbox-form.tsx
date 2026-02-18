import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@valet/ui/components/dialog";
import { Button } from "@valet/ui/components/button";
import { Input } from "@valet/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@valet/ui/components/select";
import type {
  Sandbox,
  SandboxCreateRequest,
  SandboxEnvironment,
  BrowserEngine,
} from "../types";

const ENVIRONMENTS: { value: SandboxEnvironment; label: string }[] = [
  { value: "dev", label: "Development" },
  { value: "staging", label: "Staging" },
  { value: "prod", label: "Production" },
];

const INSTANCE_TYPES = [
  { value: "t3.medium", label: "t3.medium (2 vCPU / 4 GB)" },
  { value: "t3.large", label: "t3.large (2 vCPU / 8 GB)" },
  { value: "t3.xlarge", label: "t3.xlarge (4 vCPU / 16 GB)" },
  { value: "m5.large", label: "m5.large (2 vCPU / 8 GB)" },
  { value: "m5.xlarge", label: "m5.xlarge (4 vCPU / 16 GB)" },
];

interface SandboxFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: SandboxCreateRequest) => void;
  isPending: boolean;
  sandbox?: Sandbox;
}

export function SandboxForm({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  sandbox,
}: SandboxFormProps) {
  const isEdit = Boolean(sandbox);

  const [name, setName] = useState(sandbox?.name ?? "");
  const [environment, setEnvironment] = useState<SandboxEnvironment>(
    sandbox?.environment ?? "staging",
  );
  const [instanceType, setInstanceType] = useState(
    sandbox?.instanceType ?? "t3.medium",
  );
  const [instanceId, setInstanceId] = useState(sandbox?.instanceId ?? "");
  const [capacity, setCapacity] = useState(String(sandbox?.capacity ?? 5));
  const [novncUrl, setNovncUrl] = useState(sandbox?.novncUrl ?? "");
  const [browserEng, setBrowserEng] = useState<BrowserEngine>(
    sandbox?.browserEngine ?? "adspower",
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      environment,
      instanceId: instanceId.trim(),
      instanceType,
      capacity: Number(capacity),
      browserEngine: browserEng,
      ...(novncUrl.trim() ? { novncUrl: novncUrl.trim() } : {}),
    });
  }

  const isValid =
    name.trim().length > 0 &&
    instanceId.trim().length > 0 &&
    Number(capacity) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Sandbox" : "Register Sandbox"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update sandbox configuration."
              : "Register a new EC2 sandbox instance for browser automation."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="sandbox-name"
              className="text-sm font-medium text-[var(--wk-text-primary)]"
            >
              Name
            </label>
            <Input
              id="sandbox-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. worker-stg-01"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="sandbox-instance-id"
              className="text-sm font-medium text-[var(--wk-text-primary)]"
            >
              Instance ID
            </label>
            <Input
              id="sandbox-instance-id"
              value={instanceId}
              onChange={(e) => setInstanceId(e.target.value)}
              placeholder="e.g. i-0abcd1234ef567890"
              required
              disabled={isEdit}
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="sandbox-env"
              className="text-sm font-medium text-[var(--wk-text-primary)]"
            >
              Environment
            </label>
            <Select
              value={environment}
              onValueChange={(v) => setEnvironment(v as SandboxEnvironment)}
            >
              <SelectTrigger id="sandbox-env">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENVIRONMENTS.map((env) => (
                  <SelectItem key={env.value} value={env.value}>
                    {env.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <label
                htmlFor="sandbox-instance-type"
                className="text-sm font-medium text-[var(--wk-text-primary)]"
              >
                Instance Type
              </label>
              <Select value={instanceType} onValueChange={setInstanceType}>
                <SelectTrigger id="sandbox-instance-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INSTANCE_TYPES.map((it) => (
                    <SelectItem key={it.value} value={it.value}>
                      {it.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="sandbox-capacity"
              className="text-sm font-medium text-[var(--wk-text-primary)]"
            >
              Capacity (max concurrent tasks)
            </label>
            <Input
              id="sandbox-capacity"
              type="number"
              min={1}
              max={100}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="sandbox-browser-engine"
              className="text-sm font-medium text-[var(--wk-text-primary)]"
            >
              Browser Engine
            </label>
            <Select
              value={browserEng}
              onValueChange={(v) => setBrowserEng(v as BrowserEngine)}
            >
              <SelectTrigger id="sandbox-browser-engine">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="adspower">AdsPower</SelectItem>
                <SelectItem value="chromium">Chromium</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="sandbox-novnc"
              className="text-sm font-medium text-[var(--wk-text-primary)]"
            >
              noVNC URL (optional)
            </label>
            <Input
              id="sandbox-novnc"
              value={novncUrl}
              onChange={(e) => setNovncUrl(e.target.value)}
              placeholder="http://34.197.248.80:6080"
            />
          </div>

          <DialogFooter>
            <Button
              variant="secondary"
              type="button"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isPending}>
              {isPending
                ? isEdit
                  ? "Saving..."
                  : "Registering..."
                : isEdit
                  ? "Save Changes"
                  : "Register Sandbox"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
