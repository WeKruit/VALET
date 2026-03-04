import { useState } from "react";
import { Card, CardContent } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Input } from "@valet/ui/components/input";
import { Badge } from "@valet/ui/components/badge";
import { Check, Briefcase } from "lucide-react";

interface PlatformCredential {
  platform: string;
  username: string;
  password: string;
}

interface CredentialsStepProps {
  onContinue: () => void;
  onSavePlatform: (credential: PlatformCredential) => void;
  savedPlatforms: string[];
  isSaving?: boolean;
  savingPlatform?: string | null;
  mailboxConnected: boolean;
}

const PLATFORMS = [
  {
    id: "linkedin",
    name: "LinkedIn",
    description: "Most common platform. Strongly recommended.",
    usernameLabel: "Email",
    usernamePlaceholder: "your@email.com",
    requiresPassword: true,
  },
  {
    id: "workday",
    name: "Workday",
    description: "Used by Fortune 500 companies. One login often works across many tenants.",
    usernameLabel: "Username or Email",
    usernamePlaceholder: "username or email",
    requiresPassword: true,
  },
  {
    id: "greenhouse",
    name: "Greenhouse",
    description: "Used by thousands of startups and mid-size companies.",
    usernameLabel: "Email",
    usernamePlaceholder: "your@email.com",
    requiresPassword: true,
  },
  {
    id: "lever",
    name: "Lever",
    description: "Common in tech companies. Often uses email-only login (magic link).",
    usernameLabel: "Email",
    usernamePlaceholder: "your@email.com",
    requiresPassword: false,
  },
] as const;

function PlatformCard({
  platform,
  isSaved,
  isSaving,
  onSave,
  mailboxConnected,
}: {
  platform: (typeof PLATFORMS)[number];
  isSaved: boolean;
  isSaving: boolean;
  onSave: (username: string, password: string) => void;
  mailboxConnected: boolean;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [expanded, setExpanded] = useState(false);

  const showPasswordField =
    platform.requiresPassword || (platform.id === "lever" && !mailboxConnected);

  const leverAutoNote = platform.id === "lever" && mailboxConnected;

  const canSave =
    username.trim().length > 0 && (!showPasswordField || password.length > 0) && !isSaving;

  if (isSaved) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[var(--wk-radius-md)] bg-[var(--wk-surface-sunken)]">
            <Briefcase className="h-4 w-4 text-[var(--wk-text-secondary)]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{platform.name}</p>
            <p className="text-xs text-[var(--wk-text-secondary)]">{platform.description}</p>
          </div>
          <Badge variant="success">
            <Check className="h-3 w-3 mr-1" />
            Saved
          </Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <button
          type="button"
          className="flex items-center gap-3 w-full text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-[var(--wk-radius-md)] bg-[var(--wk-surface-sunken)]">
            <Briefcase className="h-4 w-4 text-[var(--wk-text-secondary)]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{platform.name}</p>
            <p className="text-xs text-[var(--wk-text-secondary)]">{platform.description}</p>
          </div>
          <Badge variant="default">Not connected</Badge>
        </button>

        {expanded && (
          <div className="space-y-3 pt-2 border-t border-[var(--wk-border-subtle)]">
            {leverAutoNote && (
              <p className="text-xs text-emerald-700 bg-emerald-50 rounded-[var(--wk-radius-md)] px-3 py-2">
                Lever uses email-based login. Since you connected your Gmail, VALET can handle Lever
                logins automatically -- no password needed.
              </p>
            )}
            <div>
              <label className="text-xs font-medium">{platform.usernameLabel}</label>
              <Input
                type={platform.usernameLabel === "Email" ? "email" : "text"}
                placeholder={platform.usernamePlaceholder}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1"
              />
            </div>
            {showPasswordField && (
              <div>
                <label className="text-xs font-medium">Password</label>
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1"
                />
              </div>
            )}
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              disabled={!canSave}
              onClick={() => onSave(username.trim(), password)}
            >
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CredentialsStep({
  onContinue,
  onSavePlatform,
  savedPlatforms,
  isSaving,
  savingPlatform,
  mailboxConnected,
}: CredentialsStepProps) {
  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="font-display text-xl font-semibold">Save your platform logins</h2>
        <p className="text-sm text-[var(--wk-text-secondary)]">
          VALET uses these to log in and apply on your behalf. The more platforms you connect, the
          fewer interruptions you'll get.
        </p>
      </div>

      <div className="space-y-3">
        {PLATFORMS.map((platform) => (
          <PlatformCard
            key={platform.id}
            platform={platform}
            isSaved={savedPlatforms.includes(platform.id)}
            isSaving={!!isSaving && savingPlatform === platform.id}
            mailboxConnected={mailboxConnected}
            onSave={(username, password) =>
              onSavePlatform({
                platform: platform.id,
                username,
                password,
              })
            }
          />
        ))}
      </div>

      <p className="text-xs text-center text-[var(--wk-text-tertiary)]">
        Skipping a platform means VALET will pause and ask you to log in manually each time. You can
        add credentials later in Settings.
      </p>

      <Button variant="cta" size="lg" className="w-full" onClick={onContinue}>
        Continue
      </Button>
    </div>
  );
}
