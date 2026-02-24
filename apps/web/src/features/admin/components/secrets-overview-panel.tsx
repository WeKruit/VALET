import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Badge } from "@valet/ui/components/badge";
import { Tabs, TabsList, TabsTrigger } from "@valet/ui/components/tabs";
import { Skeleton } from "@valet/ui/components/skeleton";
import { Eye, EyeOff, Copy, RefreshCw, Server, Cloud, Link2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSecretVars } from "../hooks/use-secrets-sync";
import type { SecretVar } from "../hooks/use-secrets-sync";

/** Keys that represent connecting endpoints — shown prominently at top */
const ENDPOINT_KEYS = new Set([
  "GHOSTHANDS_API_URL",
  "GHOSTHANDS_CALLBACK_URL",
  "DATABASE_URL",
  "DATABASE_DIRECT_URL",
  "REDIS_URL",
  "SUPABASE_URL",
  "S3_ENDPOINT",
  "KASM_API_URL",
  "CORS_ORIGIN",
  "GOOGLE_CALLBACK_URL",
]);

/** Keys safe to show unmasked by default */
const SAFE_KEYS = new Set([
  "GHOSTHANDS_API_URL",
  "GHOSTHANDS_CALLBACK_URL",
  "CORS_ORIGIN",
  "GOOGLE_CALLBACK_URL",
  "KASM_API_URL",
  "S3_ENDPOINT",
  "S3_REGION",
  "AWS_REGION",
  "GH_DEPLOY_AUTO_TRIGGER",
  "TASK_DISPATCH_MODE",
  "AUTOSCALE_ENABLED",
  "AUTOSCALE_ASG_ENABLED",
  "AUTOSCALE_MAX",
  "AUTOSCALE_MIN",
  "JOBS_PER_WORKER",
  "KASM_DEFAULT_IMAGE_ID",
  "KASM_DEFAULT_USER_ID",
]);

export function SecretsOverviewPanel() {
  const [env, setEnv] = useState<"staging" | "production">("staging");

  return (
    <div className="space-y-4">
      <Tabs value={env} onValueChange={(v) => setEnv(v as "staging" | "production")}>
        <TabsList>
          <TabsTrigger value="staging">Staging</TabsTrigger>
          <TabsTrigger value="production">Production</TabsTrigger>
        </TabsList>
      </Tabs>

      <EnvironmentView env={env} />
    </div>
  );
}

function EnvironmentView({ env }: { env: "staging" | "production" }) {
  const valetQuery = useSecretVars(env, "valet");
  const ghQuery = useSecretVars(env, "ghosthands");

  const allVars = [...(valetQuery.data?.vars ?? []), ...(ghQuery.data?.vars ?? [])];

  // Split into endpoints vs regular secrets
  const endpoints = allVars.filter((v) => ENDPOINT_KEYS.has(v.key));
  const valetSecrets = (valetQuery.data?.vars ?? []).filter((v) => !ENDPOINT_KEYS.has(v.key));
  const ghSecrets = (ghQuery.data?.vars ?? []).filter((v) => !ENDPOINT_KEYS.has(v.key));

  const isLoading = valetQuery.isLoading || ghQuery.isLoading;
  const isError = valetQuery.isError || ghQuery.isError;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-3">
          <AlertCircle className="mx-auto h-8 w-8 text-[var(--wk-status-error)]" />
          <p className="text-sm text-[var(--wk-text-secondary)]">Failed to load secrets.</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              valetQuery.refetch();
              ghQuery.refetch();
            }}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MiniStat label="Environment" value={env} />
        <MiniStat label="Endpoints" value={String(endpoints.length)} />
        <MiniStat label="VALET Keys" value={String(valetQuery.data?.totalKeys ?? 0)} />
        <MiniStat label="GhostHands Keys" value={String(ghQuery.data?.totalKeys ?? 0)} />
      </div>

      {/* Endpoints */}
      {endpoints.length > 0 && (
        <SecretSection
          title="Connecting Endpoints"
          icon={<Link2 className="h-4 w-4" />}
          description="URLs and connection strings used between services"
          vars={endpoints}
          defaultRevealed={SAFE_KEYS}
        />
      )}

      {/* VALET secrets */}
      <SecretSection
        title="VALET (Fly.io)"
        icon={<Cloud className="h-4 w-4" />}
        description={valetQuery.data?.secretId ?? "valet/staging"}
        vars={valetSecrets}
        onRefresh={() => valetQuery.refetch()}
        isRefreshing={valetQuery.isFetching}
      />

      {/* GhostHands secrets */}
      <SecretSection
        title="GhostHands (EC2)"
        icon={<Server className="h-4 w-4" />}
        description={ghQuery.data?.secretId ?? "ghosthands/staging"}
        vars={ghSecrets}
        onRefresh={() => ghQuery.refetch()}
        isRefreshing={ghQuery.isFetching}
      />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-3">
        <p className="text-[10px] font-medium text-[var(--wk-text-tertiary)] uppercase tracking-wide">
          {label}
        </p>
        <p className="mt-0.5 text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function SecretSection({
  title,
  icon,
  description,
  vars,
  defaultRevealed,
  onRefresh,
  isRefreshing,
}: {
  title: string;
  icon: React.ReactNode;
  description: string;
  vars: SecretVar[];
  defaultRevealed?: Set<string>;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  const [revealAll, setRevealAll] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  const isRevealed = (key: string) =>
    revealAll || revealedKeys.has(key) || (defaultRevealed?.has(key) ?? false);

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

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            {icon}
            {title}
            <span className="text-xs text-[var(--wk-text-tertiary)] font-normal">
              {vars.length}
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setRevealAll(!revealAll)}
            >
              {revealAll ? (
                <EyeOff className="h-3.5 w-3.5 mr-1" />
              ) : (
                <Eye className="h-3.5 w-3.5 mr-1" />
              )}
              {revealAll ? "Hide All" : "Reveal All"}
            </Button>
            {onRefresh && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={onRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-[var(--wk-text-tertiary)]">{description}</p>
      </CardHeader>
      <CardContent>
        {vars.length === 0 ? (
          <p className="text-xs text-[var(--wk-text-tertiary)] py-4 text-center">No secrets</p>
        ) : (
          <div className="space-y-0.5">
            {vars.map((v) => (
              <div
                key={v.key}
                className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[var(--wk-surface-raised)] transition-colors group"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <code className="text-xs font-medium whitespace-nowrap text-[var(--wk-text-primary)]">
                    {v.key}
                  </code>
                  {v.isRuntime && (
                    <Badge variant="secondary" className="text-[9px] px-1 py-0">
                      runtime
                    </Badge>
                  )}
                  <span className="text-xs text-[var(--wk-text-tertiary)] truncate max-w-[400px]">
                    {isRevealed(v.key) ? v.value : maskValue(v.value)}
                  </span>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => toggleReveal(v.key)}
                    title={isRevealed(v.key) ? "Hide" : "Reveal"}
                  >
                    {isRevealed(v.key) ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => handleCopy(v.value)}
                    title="Copy"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function maskValue(value: string): string {
  if (value.length <= 8) return "••••••••";
  return value.slice(0, 4) + "••••" + value.slice(-4);
}
