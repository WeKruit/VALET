import { useState } from "react";
import { Card, CardContent } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Input } from "@valet/ui/components/input";
import { Badge } from "@valet/ui/components/badge";
import { Mail, ChevronDown, ChevronUp, ShieldCheck, AlertTriangle, Check } from "lucide-react";

interface GmailStepProps {
  onConnect: (email: string, appPassword: string) => void;
  onSkip: () => void;
  isConnecting?: boolean;
  connectionError?: string | null;
  alreadyConnected?: boolean;
}

export function GmailStep({
  onConnect,
  onSkip,
  isConnecting,
  connectionError,
  alreadyConnected,
}: GmailStepProps) {
  const [email, setEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);

  const isValidEmail = email.endsWith("@gmail.com") && email.length > 10;
  const isValidPassword = appPassword.replace(/\s/g, "").length >= 16;
  const canConnect = isValidEmail && isValidPassword && !isConnecting;

  if (alreadyConnected) {
    return (
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h2 className="font-display text-xl font-semibold">Email for Verifications</h2>
        </div>
        <Card>
          <CardContent className="p-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-[var(--wk-status-success)]">
              <Check className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Gmail connected</p>
              <p className="text-xs text-[var(--wk-text-secondary)]">
                VALET can read verification codes automatically.
              </p>
            </div>
            <Badge variant="success">Connected</Badge>
          </CardContent>
        </Card>
        <Button variant="cta" size="lg" className="w-full" onClick={onSkip}>
          Continue
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="font-display text-xl font-semibold">Email for Verifications</h2>
        <p className="text-sm text-[var(--wk-text-secondary)]">
          Many platforms send verification codes by email. VALET can read these automatically if you
          connect a Gmail account.
        </p>
      </div>

      {/* Recommendation card */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-blue-600" />
            <p className="text-sm font-medium">
              We recommend a dedicated Gmail for job applications
            </p>
          </div>
          <ul className="text-xs text-[var(--wk-text-secondary)] space-y-1 ml-6 list-disc">
            <li>Keeps your personal inbox clean</li>
            <li>Avoids 2FA conflicts with your main Google account</li>
            <li>VALET only reads verification emails -- nothing else</li>
            <li>You can delete the account when you're done job hunting</li>
          </ul>
        </CardContent>
      </Card>

      {/* Setup instructions (collapsible) */}
      <button
        type="button"
        className="flex items-center gap-2 text-sm text-[var(--wk-copilot)] hover:underline mx-auto"
        onClick={() => setShowInstructions(!showInstructions)}
      >
        {showInstructions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        How to set up a Gmail App Password
      </button>

      {showInstructions && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <ol className="text-xs text-[var(--wk-text-secondary)] space-y-2 list-decimal ml-4">
              <li>
                Go to{" "}
                <span className="font-medium text-[var(--wk-text-primary)]">
                  accounts.google.com
                </span>{" "}
                and create a new account (or use an existing one)
              </li>
              <li>Use this email when signing up on job platforms (LinkedIn, Workday, etc.)</li>
              <li>Enable IMAP: Gmail Settings &gt; Forwarding and POP/IMAP &gt; Enable IMAP</li>
              <li>
                Generate an App Password: Google Account &gt; Security &gt; 2-Step Verification &gt;
                App passwords
              </li>
              <li>Copy the 16-character app password and paste it below</li>
            </ol>
          </CardContent>
        </Card>
      )}

      {/* 2FA warning */}
      <div className="flex items-start gap-2 rounded-[var(--wk-radius-md)] bg-amber-50 px-3 py-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">
          If your Gmail has 2-Step Verification enabled, you must use an App Password. A regular
          password will not work. VALET never disables your 2FA.
        </p>
      </div>

      {/* Input fields */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium">Gmail address</label>
            <Input
              type="email"
              placeholder="yourname@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">App Password</label>
            <Input
              type="password"
              placeholder="xxxx xxxx xxxx xxxx"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-[var(--wk-text-tertiary)] mt-1">
              16-character password from Google Account &gt; Security &gt; App passwords
            </p>
          </div>

          {connectionError && (
            <p className="text-sm text-[var(--wk-status-error)]">{connectionError}</p>
          )}
        </CardContent>
      </Card>

      {/* Trust copy */}
      <div className="flex items-start gap-2 text-xs text-[var(--wk-text-tertiary)]">
        <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          Your app password is encrypted at rest (AES-256) and used only to read verification emails
          from job platforms. It is never used to send emails or access other Google services.
        </p>
      </div>

      <div className="space-y-3">
        <Button
          variant="cta"
          size="lg"
          className="w-full"
          disabled={!canConnect}
          onClick={() => onConnect(email, appPassword)}
        >
          {isConnecting ? "Connecting..." : "Connect Gmail"}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="w-full"
          onClick={onSkip}
          disabled={isConnecting}
        >
          Skip for Now
        </Button>
      </div>
    </div>
  );
}
