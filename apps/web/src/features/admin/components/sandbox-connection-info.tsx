import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@valet/ui/components/tooltip";
import { Terminal, Monitor, HeartPulse, Copy, Check, ExternalLink } from "lucide-react";

interface SandboxConnectionInfoProps {
  publicIp: string | null | undefined;
  sshKeyName?: string | null;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-[var(--wk-status-success)]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{copied ? "Copied!" : "Copy to clipboard"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function SandboxConnectionInfo({
  publicIp,
  sshKeyName,
}: SandboxConnectionInfoProps) {
  if (!publicIp) {
    return null;
  }

  const keyPath = sshKeyName
    ? `~/.ssh/${sshKeyName}.pem`
    : "~/.ssh/valet-worker.pem";
  const sshCommand = `ssh -i ${keyPath} ubuntu@${publicIp}`;
  const novncUrl = `http://${publicIp}:6080/vnc.html`;
  const healthUrl = `http://${publicIp}:8000/health`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Terminal className="h-5 w-5" />
          Connection Info
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ConnectionRow
          icon={<Terminal className="h-4 w-4" />}
          label="SSH"
          value={sshCommand}
        />
        <ConnectionRow
          icon={<Monitor className="h-4 w-4" />}
          label="noVNC"
          value={novncUrl}
          href={novncUrl}
        />
        <ConnectionRow
          icon={<HeartPulse className="h-4 w-4" />}
          label="Health"
          value={healthUrl}
          href={healthUrl}
        />
      </CardContent>
    </Card>
  );
}

function ConnectionRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
        {icon}
        {label}
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-[var(--wk-radius-md)] bg-[var(--wk-surface-sunken)] px-3 py-2 text-xs font-mono text-[var(--wk-text-primary)] overflow-x-auto">
          {value}
        </code>
        <CopyButton text={value} />
        {href && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  asChild
                >
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Open in new tab</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
