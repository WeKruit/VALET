import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Badge } from "@valet/ui/components/badge";
import { Input } from "@valet/ui/components/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@valet/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@valet/ui/components/select";
import { KeyRound, Mail, Plus, Trash2, Shield, AlertTriangle } from "lucide-react";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import {
  usePlatformCredentials,
  useCreatePlatformCredential,
  useDeletePlatformCredential,
  useMailboxCredentials,
  useCreateMailboxCredential,
  useDeleteMailboxCredential,
} from "../hooks/use-credentials";
import { formatDistanceToNow } from "date-fns";

const PLATFORM_OPTIONS = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "greenhouse", label: "Greenhouse" },
  { value: "lever", label: "Lever" },
  { value: "workday", label: "Workday" },
  { value: "other", label: "Other" },
] as const;

const MAILBOX_PROVIDER_OPTIONS = [
  { value: "gmail", label: "Gmail" },
  { value: "outlook", label: "Outlook" },
  { value: "yahoo", label: "Yahoo" },
  { value: "other", label: "Other" },
] as const;

function statusBadge(status: string) {
  if (status === "active")
    return (
      <Badge
        variant="default"
        className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
      >
        Active
      </Badge>
    );
  if (status === "expired") return <Badge variant="error">Expired</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

export function CredentialSettings() {
  return (
    <div className="space-y-6">
      <PlatformCredentialsSection />
      <MailboxCredentialsSection />

      <Card>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-[var(--wk-text-tertiary)] mt-0.5 shrink-0" />
            <div className="text-sm text-[var(--wk-text-secondary)]">
              <p className="font-medium text-[var(--wk-text-primary)]">Encryption & security</p>
              <p className="mt-1">
                All credentials are encrypted at rest using AES-256-GCM. Secrets are never returned
                in API responses and are only decrypted at the moment of use during automation. You
                can revoke any credential at any time.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PlatformCredentialsSection() {
  const { data, isLoading, isError } = usePlatformCredentials();
  const createMutation = useCreatePlatformCredential();
  const deleteMutation = useDeletePlatformCredential();

  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [form, setForm] = useState({
    platform: "",
    domain: "",
    loginIdentifier: "",
    secret: "",
  });

  const credentials = data?.status === 200 ? data.body.data : [];

  function handleCreate() {
    createMutation.mutate(
      {
        body: {
          platform: form.platform,
          domain: form.domain || null,
          loginIdentifier: form.loginIdentifier,
          secret: form.secret,
        },
      },
      {
        onSuccess: () => {
          setShowAdd(false);
          setForm({ platform: "", domain: "", loginIdentifier: "", secret: "" });
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Platform Credentials</CardTitle>
            <p className="text-sm text-[var(--wk-text-secondary)] mt-1">
              Login credentials for job platforms. Used by VALET to apply on your behalf.
            </p>
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <p className="text-sm text-[var(--wk-status-error)] py-4 text-center">
            Failed to load credentials.
          </p>
        ) : credentials.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-[var(--wk-radius-2xl)] bg-[var(--wk-surface-sunken)]">
              <KeyRound className="h-6 w-6 text-[var(--wk-text-tertiary)]" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold">No platform credentials</h3>
            <p className="mt-1 max-w-xs text-sm text-[var(--wk-text-secondary)]">
              Add your login credentials so VALET can apply to jobs on your behalf.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {credentials.map((cred) => (
              <div
                key={cred.id}
                className="flex items-center justify-between rounded-[var(--wk-radius-md)] px-3 py-2.5 hover:bg-[var(--wk-surface-sunken)] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <KeyRound className="h-4 w-4 text-[var(--wk-text-tertiary)] shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium capitalize">{cred.platform}</span>
                      {statusBadge(cred.status)}
                    </div>
                    <p className="text-xs text-[var(--wk-text-secondary)] truncate">
                      {cred.loginIdentifier}
                      {cred.lastVerifiedAt
                        ? ` · Verified ${formatDistanceToNow(new Date(cred.lastVerifiedAt), { addSuffix: true })}`
                        : " · Not yet verified"}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(cred.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5 text-[var(--wk-status-error)]" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogTitle>Add Platform Credential</DialogTitle>
          <DialogDescription>
            Enter your login details for a job platform. Your password is encrypted at rest.
          </DialogDescription>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Platform</label>
              <Select
                value={form.platform}
                onValueChange={(v) => setForm((f) => ({ ...f, platform: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORM_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Login / Email</label>
              <Input
                value={form.loginIdentifier}
                onChange={(e) => setForm((f) => ({ ...f, loginIdentifier: e.target.value }))}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Password / Secret</label>
              <Input
                type="password"
                value={form.secret}
                onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                placeholder="Enter password"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Domain (optional)</label>
              <Input
                value={form.domain}
                onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
                placeholder="e.g. mycompany.greenhouse.io"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                !form.platform || !form.loginIdentifier || !form.secret || createMutation.isPending
              }
            >
              {createMutation.isPending ? "Saving..." : "Save Credential"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={confirmDelete != null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <DialogContent>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--wk-radius-lg)] bg-red-50 dark:bg-red-950/30">
              <AlertTriangle className="h-5 w-5 text-[var(--wk-status-error)]" />
            </div>
            <div>
              <DialogTitle>Remove Credential</DialogTitle>
              <DialogDescription>
                This will permanently remove this credential. VALET will no longer be able to log in
                to this platform automatically.
              </DialogDescription>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (confirmDelete) {
                  deleteMutation.mutate(
                    { params: { id: confirmDelete } },
                    { onSettled: () => setConfirmDelete(null) },
                  );
                }
              }}
            >
              {deleteMutation.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function MailboxCredentialsSection() {
  const { data, isLoading, isError } = useMailboxCredentials();
  const createMutation = useCreateMailboxCredential();
  const deleteMutation = useDeleteMailboxCredential();

  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [form, setForm] = useState({
    provider: "",
    emailAddress: "",
    secret: "",
    accessMode: "app_password",
  });

  const credentials = data?.status === 200 ? data.body.data : [];

  function handleCreate() {
    createMutation.mutate(
      {
        body: {
          provider: form.provider,
          emailAddress: form.emailAddress,
          secret: form.secret,
          accessMode: form.accessMode,
        },
      },
      {
        onSuccess: () => {
          setShowAdd(false);
          setForm({ provider: "", emailAddress: "", secret: "", accessMode: "app_password" });
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Mailbox Credentials</CardTitle>
            <p className="text-sm text-[var(--wk-text-secondary)] mt-1">
              Email access for confirmation tracking and application follow-ups.
            </p>
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : isError ? (
          <p className="text-sm text-[var(--wk-status-error)] py-4 text-center">
            Failed to load mailbox credentials.
          </p>
        ) : credentials.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-[var(--wk-radius-2xl)] bg-[var(--wk-surface-sunken)]">
              <Mail className="h-6 w-6 text-[var(--wk-text-tertiary)]" />
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold">No mailbox credentials</h3>
            <p className="mt-1 max-w-xs text-sm text-[var(--wk-text-secondary)]">
              Add email access so VALET can track application confirmations.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {credentials.map((cred) => (
              <div
                key={cred.id}
                className="flex items-center justify-between rounded-[var(--wk-radius-md)] px-3 py-2.5 hover:bg-[var(--wk-surface-sunken)] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Mail className="h-4 w-4 text-[var(--wk-text-tertiary)] shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{cred.emailAddress}</span>
                      {statusBadge(cred.status)}
                    </div>
                    <p className="text-xs text-[var(--wk-text-secondary)]">
                      {cred.provider} · {cred.accessMode}
                      {cred.twoFactorEnabled ? " · 2FA" : ""}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(cred.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5 text-[var(--wk-status-error)]" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogTitle>Add Mailbox Credential</DialogTitle>
          <DialogDescription>
            Enter your email credentials. We recommend using an app password instead of your main
            password.
          </DialogDescription>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Provider</label>
              <Select
                value={form.provider}
                onValueChange={(v) => setForm((f) => ({ ...f, provider: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {MAILBOX_PROVIDER_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email Address</label>
              <Input
                type="email"
                value={form.emailAddress}
                onChange={(e) => setForm((f) => ({ ...f, emailAddress: e.target.value }))}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">App Password / Secret</label>
              <Input
                type="password"
                value={form.secret}
                onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                placeholder="Enter app password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                !form.provider || !form.emailAddress || !form.secret || createMutation.isPending
              }
            >
              {createMutation.isPending ? "Saving..." : "Save Credential"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={confirmDelete != null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <DialogContent>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--wk-radius-lg)] bg-red-50 dark:bg-red-950/30">
              <AlertTriangle className="h-5 w-5 text-[var(--wk-status-error)]" />
            </div>
            <div>
              <DialogTitle>Remove Mailbox Credential</DialogTitle>
              <DialogDescription>
                VALET will no longer be able to track application confirmations via this email.
              </DialogDescription>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (confirmDelete) {
                  deleteMutation.mutate(
                    { params: { id: confirmDelete } },
                    { onSettled: () => setConfirmDelete(null) },
                  );
                }
              }}
            >
              {deleteMutation.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
