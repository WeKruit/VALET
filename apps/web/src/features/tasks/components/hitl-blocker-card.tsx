import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { Button } from "@valet/ui/components/button";
import { Input } from "@valet/ui/components/input";
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@valet/ui/components/dialog";
import {
  ShieldAlert,
  Bot,
  KeyRound,
  Puzzle,
  ExternalLink,
  Clock,
  Timer,
  ShieldCheck,
} from "lucide-react";
import { useResolveBlocker } from "../hooks/use-tasks";

interface HitlBlockerCardProps {
  taskId: string;
  interaction: {
    type: string;
    screenshotUrl?: string | null;
    pageUrl?: string | null;
    timeoutSeconds?: number | null;
    message?: string | null;
    description?: string | null;
    metadata?: {
      blocker_confidence?: number;
      captcha_type?: string;
      detection_method?: string;
    } | null;
    pausedAt: string;
  };
  onCancel: () => void;
}

const blockerConfig: Record<
  string,
  { label: string; icon: React.ElementType; description: string; color?: string }
> = {
  two_factor: {
    label: "2FA Required",
    icon: ShieldAlert,
    description: "Two-factor authentication is required to continue.",
  },
  bot_check: {
    label: "Bot Check",
    icon: Bot,
    description: "A bot detection check needs to be completed.",
  },
  login_required: {
    label: "Login Required",
    icon: KeyRound,
    description: "You need to log in to the target platform.",
  },
  captcha: {
    label: "Captcha",
    icon: Puzzle,
    description: "A captcha needs to be solved to continue.",
  },
  rate_limited: {
    label: "Rate Limited",
    icon: Timer,
    description: "The site is rate limiting requests. Auto-retry in progress.",
    color: "amber",
  },
  verification: {
    label: "Verification Required",
    icon: ShieldCheck,
    description: "Please complete the verification step.",
  },
};

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function HitlBlockerCard({ taskId, interaction, onCancel }: HitlBlockerCardProps) {
  const resolveBlocker = useResolveBlocker();
  const [remaining, setRemaining] = useState<number | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Countdown timer
  useEffect(() => {
    if (interaction.timeoutSeconds == null || interaction.timeoutSeconds <= 0) {
      setRemaining(null);
      return;
    }

    const pausedAt = new Date(interaction.pausedAt).getTime();

    function computeRemaining() {
      const elapsed = (Date.now() - pausedAt) / 1000;
      const left = (interaction.timeoutSeconds ?? 0) - elapsed;
      return Math.max(0, left);
    }

    setRemaining(computeRemaining());

    const interval = setInterval(() => {
      const left = computeRemaining();
      setRemaining(left);
      if (left <= 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [interaction.timeoutSeconds, interaction.pausedAt]);

  const handleResolve = useCallback(
    (
      resolutionType: "manual" | "code_entry" | "credentials" | "skip",
      resolutionData?: Record<string, unknown>,
    ) => {
      resolveBlocker.mutate({
        params: { id: taskId },
        body: { resolvedBy: "human", resolutionType, resolutionData },
      });
    },
    [taskId, resolveBlocker],
  );

  const config = blockerConfig[interaction.type] ?? {
    label: interaction.type.replace("_", " "),
    icon: ShieldAlert,
    description: "This task requires human intervention.",
  };
  const BlockerIcon = config.icon;
  const isUrgent = remaining != null && remaining < 60;
  const metadata = interaction.metadata;

  return (
    <Card className="border-2 border-amber-500">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--wk-radius-lg)] bg-amber-50 dark:bg-amber-950/30">
              <BlockerIcon className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-lg">{config.label}</CardTitle>
              <p className="text-sm text-[var(--wk-text-secondary)]">{config.description}</p>
              {interaction.description && (
                <p className="text-sm text-[var(--wk-text-secondary)] mt-1">
                  {interaction.description}
                </p>
              )}
            </div>
          </div>
          <Badge variant="warning">Blocked</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Custom message from the worker */}
        {interaction.message && (
          <div className="rounded-[var(--wk-radius-md)] bg-[var(--wk-surface-sunken)] p-3">
            <p className="text-sm text-[var(--wk-text-secondary)]">{interaction.message}</p>
          </div>
        )}

        {/* Metadata info */}
        {metadata &&
          (metadata.captcha_type ||
            metadata.blocker_confidence != null ||
            metadata.detection_method) && (
            <div className="flex flex-wrap items-center gap-2">
              {metadata.captcha_type && <Badge variant="default">{metadata.captcha_type}</Badge>}
              {metadata.blocker_confidence != null && (
                <span className="text-xs text-[var(--wk-text-tertiary)]">
                  Confidence: {Math.round(metadata.blocker_confidence * 100)}%
                </span>
              )}
              {metadata.detection_method && (
                <span className="text-xs text-[var(--wk-text-tertiary)]">
                  via {metadata.detection_method}
                </span>
              )}
            </div>
          )}

        {/* Page URL */}
        {interaction.pageUrl && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)] mb-1">
              Page URL
            </p>
            <a
              href={interaction.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--wk-copilot)] hover:underline flex items-center gap-1"
            >
              <span className="truncate">{interaction.pageUrl}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
        )}

        {/* Screenshot */}
        {interaction.screenshotUrl && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)] mb-2">
              Screenshot
            </p>
            <Dialog>
              <DialogTrigger asChild>
                <button className="cursor-pointer rounded-[var(--wk-radius-md)] border border-[var(--wk-border-subtle)] overflow-hidden hover:opacity-90 transition-opacity">
                  <img
                    src={interaction.screenshotUrl}
                    alt="Blocker screenshot"
                    className="max-h-48 w-full object-cover"
                  />
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl">
                <DialogTitle className="sr-only">Blocker screenshot</DialogTitle>
                <img
                  src={interaction.screenshotUrl}
                  alt="Blocker screenshot (full size)"
                  className="w-full rounded-[var(--wk-radius-md)]"
                />
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Countdown timer */}
        {remaining != null && (
          <div
            className={`flex items-center gap-2 rounded-[var(--wk-radius-md)] px-3 py-2 ${
              isUrgent
                ? "bg-red-50 dark:bg-red-950/30 text-[var(--wk-status-error)]"
                : "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400"
            }`}
          >
            <Clock className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">
              {remaining <= 0 ? "Timeout expired" : `${formatCountdown(remaining)} remaining`}
            </span>
          </div>
        )}

        {/* Type-specific resolution controls */}
        <div className="space-y-3 pt-2">
          {interaction.type === "two_factor" && (
            <div className="space-y-2">
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter 2FA / TOTP code"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
              />
              <Button
                variant="primary"
                className="w-full"
                disabled={resolveBlocker.isPending || !twoFactorCode.trim()}
                onClick={() => handleResolve("code_entry", { code: twoFactorCode.trim() })}
              >
                {resolveBlocker.isPending ? "Submitting..." : "Submit Code"}
              </Button>
            </div>
          )}

          {interaction.type === "login_required" && (
            <div className="space-y-2">
              <Input
                type="text"
                autoComplete="username"
                placeholder="Username or email"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
              />
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
              <Button
                variant="primary"
                className="w-full"
                disabled={resolveBlocker.isPending || !loginUsername.trim() || !loginPassword}
                onClick={() =>
                  handleResolve("credentials", {
                    username: loginUsername.trim(),
                    password: loginPassword,
                  })
                }
              >
                {resolveBlocker.isPending ? "Submitting..." : "Submit Credentials"}
              </Button>
            </div>
          )}

          {interaction.type === "captcha" && (
            <Button
              variant="primary"
              className="w-full"
              disabled={resolveBlocker.isPending}
              onClick={() => handleResolve("manual")}
            >
              {resolveBlocker.isPending ? "Resolving..." : "I've Solved the CAPTCHA"}
            </Button>
          )}

          {interaction.type === "bot_check" && (
            <Button
              variant="primary"
              className="w-full"
              disabled={resolveBlocker.isPending}
              onClick={() => handleResolve("manual")}
            >
              {resolveBlocker.isPending ? "Resolving..." : "I've Completed Verification"}
            </Button>
          )}

          {interaction.type === "rate_limited" && (
            <Button
              variant="primary"
              className="w-full"
              disabled={resolveBlocker.isPending}
              onClick={() => handleResolve("manual")}
            >
              {resolveBlocker.isPending ? "Retrying..." : "Retry Now"}
            </Button>
          )}

          {interaction.type === "verification" && (
            <Button
              variant="primary"
              className="w-full"
              disabled={resolveBlocker.isPending}
              onClick={() => handleResolve("manual")}
            >
              {resolveBlocker.isPending ? "Resolving..." : "I've Completed This Step"}
            </Button>
          )}

          {/* Fallback for unknown types */}
          {![
            "two_factor",
            "login_required",
            "captcha",
            "bot_check",
            "rate_limited",
            "verification",
          ].includes(interaction.type) && (
            <Button
              variant="primary"
              className="w-full"
              disabled={resolveBlocker.isPending}
              onClick={() => handleResolve("manual")}
            >
              {resolveBlocker.isPending ? "Resolving..." : "I've Resolved It"}
            </Button>
          )}

          {/* Skip + Cancel row */}
          <div className="flex gap-3">
            <Button
              variant="ghost"
              className="flex-1"
              disabled={resolveBlocker.isPending}
              onClick={() => handleResolve("skip")}
            >
              Skip This Step
            </Button>
            <Button variant="destructive" onClick={onCancel}>
              Cancel Task
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
