import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Input } from "@valet/ui/components/input";
import { Textarea } from "@valet/ui/components/textarea";
import { Badge } from "@valet/ui/components/badge";
import { Switch } from "@valet/ui/components/switch";
import { Skeleton } from "@valet/ui/components/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@valet/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@valet/ui/components/dropdown-menu";
import {
  Mail,
  Plus,
  RefreshCw,
  MoreVertical,
  Pencil,
  Eye,
  Send,
  Trash2,
  X,
  ChevronLeft,
  FileCode2,
} from "lucide-react";
import { toast } from "sonner";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { formatRelativeTime } from "@/lib/utils";
import {
  useEmailTemplatesList,
  useCreateEmailTemplate,
  useUpdateEmailTemplate,
  useDeleteEmailTemplate,
  usePreviewEmailTemplate,
  useSendTestEmail,
} from "../hooks/use-email-templates-admin";

// ─── Types ───

interface TemplateVariable {
  name: string;
  required: boolean;
}

interface EmailTemplate {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  mjmlBody: string;
  textBody: string | null;
  variables: TemplateVariable[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TemplateFormState {
  name: string;
  description: string;
  subject: string;
  mjmlBody: string;
  textBody: string;
  variables: string;
  isActive: boolean;
}

const emptyForm: TemplateFormState = {
  name: "",
  description: "",
  subject: "",
  mjmlBody: "",
  textBody: "",
  variables: "[]",
  isActive: true,
};

function templateToForm(t: EmailTemplate): TemplateFormState {
  return {
    name: t.name,
    description: t.description ?? "",
    subject: t.subject,
    mjmlBody: t.mjmlBody,
    textBody: t.textBody ?? "",
    variables: t.variables ? JSON.stringify(t.variables, null, 2) : "[]",
    isActive: t.isActive,
  };
}

const TEMPLATE_NAME_REGEX = /^[a-z0-9_-]+$/;

function isValidTemplateName(name: string): boolean {
  return TEMPLATE_NAME_REGEX.test(name);
}

function parseVariables(raw: string): TemplateVariable[] | undefined {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    return parsed as TemplateVariable[];
  } catch {
    return undefined;
  }
}

// ─── Component ───

export function EmailTemplatesAdminPage() {
  const [view, setView] = useState<"list" | "edit" | "create">("list");
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [form, setForm] = useState<TemplateFormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<EmailTemplate | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [sendTestOpen, setSendTestOpen] = useState(false);
  const [sendTestEmail, setSendTestEmail] = useState("");
  const [sendTestTemplateName, setSendTestTemplateName] = useState("");

  const listQuery = useEmailTemplatesList();
  const createMutation = useCreateEmailTemplate();
  const updateMutation = useUpdateEmailTemplate();
  const deleteMutation = useDeleteEmailTemplate();
  const previewMutation = usePreviewEmailTemplate();
  const sendTestMutation = useSendTestEmail();

  const templates = listQuery.data?.status === 200 ? listQuery.data.body.items : [];

  // ─── Handlers ───

  function openCreate() {
    setForm(emptyForm);
    setEditingTemplate(null);
    setView("create");
  }

  function openEdit(template: EmailTemplate) {
    setForm(templateToForm(template));
    setEditingTemplate(template);
    setView("edit");
  }

  function backToList() {
    setView("list");
    setEditingTemplate(null);
    setForm(emptyForm);
    setPreviewHtml(null);
  }

  function handleSave() {
    if (view === "create" && !isValidTemplateName(form.name)) {
      toast.error(
        "Template name must use only lowercase letters, numbers, hyphens, and underscores.",
      );
      return;
    }

    const variables = parseVariables(form.variables);
    if (form.variables.trim() && !variables) {
      toast.error("Variables must be a valid JSON array.");
      return;
    }

    if (view === "create") {
      createMutation.mutate(
        {
          body: {
            name: form.name,
            ...(form.description ? { description: form.description } : {}),
            subject: form.subject,
            mjmlBody: form.mjmlBody,
            ...(form.textBody ? { textBody: form.textBody } : {}),
            ...(variables ? { variables } : {}),
            isActive: form.isActive,
          },
        },
        {
          onSuccess: (res) => {
            if (res.status === 201) {
              toast.success(`Template "${form.name}" created.`);
              backToList();
            } else if (res.status === 409) {
              toast.error("A template with this name already exists.");
            } else {
              toast.error("Failed to create template.");
            }
          },
          onError: () => {
            toast.error("Failed to create template.");
          },
        },
      );
    } else if (editingTemplate) {
      updateMutation.mutate(
        {
          params: { name: editingTemplate.name },
          body: {
            ...(form.description !== (editingTemplate.description ?? "")
              ? { description: form.description || undefined }
              : {}),
            ...(form.subject !== editingTemplate.subject ? { subject: form.subject } : {}),
            ...(form.mjmlBody !== editingTemplate.mjmlBody ? { mjmlBody: form.mjmlBody } : {}),
            textBody: form.textBody || null,
            ...(variables ? { variables } : {}),
            isActive: form.isActive,
          },
        },
        {
          onSuccess: (res) => {
            if (res.status === 200) {
              toast.success(`Template "${editingTemplate.name}" updated.`);
              backToList();
            } else {
              toast.error("Failed to update template.");
            }
          },
          onError: () => {
            toast.error("Failed to update template.");
          },
        },
      );
    }
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(
      { params: { name: deleteTarget.name }, body: {} },
      {
        onSuccess: (res) => {
          if (res.status === 200) {
            toast.success(`Template "${deleteTarget.name}" deleted.`);
            setDeleteTarget(null);
            if (view !== "list") backToList();
          } else {
            toast.error("Failed to delete template.");
          }
        },
        onError: () => {
          toast.error("Failed to delete template.");
        },
      },
    );
  }

  function handlePreview(templateName: string) {
    // Build sample variables from the form
    const variables = parseVariables(form.variables);
    const sampleVars: Record<string, string | number> = {};
    if (variables) {
      for (const v of variables) {
        sampleVars[v.name] = `[${v.name}]`;
      }
    }

    previewMutation.mutate(
      {
        params: { name: templateName },
        body: { variables: sampleVars },
      },
      {
        onSuccess: (res) => {
          if (res.status === 200) {
            setPreviewHtml(res.body.html);
          } else {
            toast.error("Failed to preview template.");
          }
        },
        onError: () => {
          toast.error("Failed to preview template.");
        },
      },
    );
  }

  function handleSendTest() {
    if (!sendTestEmail || !sendTestTemplateName) return;

    const variables = parseVariables(form.variables);
    const sampleVars: Record<string, string | number> = {};
    if (variables) {
      for (const v of variables) {
        sampleVars[v.name] = `[${v.name}]`;
      }
    }

    sendTestMutation.mutate(
      {
        params: { name: sendTestTemplateName },
        body: { to: sendTestEmail, variables: sampleVars },
      },
      {
        onSuccess: (res) => {
          if (res.status === 200) {
            toast.success(`Test email sent to ${sendTestEmail}.`);
            setSendTestOpen(false);
            setSendTestEmail("");
          } else {
            toast.error("Failed to send test email.");
          }
        },
        onError: () => {
          toast.error("Failed to send test email.");
        },
      },
    );
  }

  // ─── List View ───

  if (view === "list") {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-semibold text-[var(--wk-text-primary)]">
              Email Templates
            </h1>
            <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
              Manage transactional email templates
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => listQuery.refetch()}
              title="Refresh"
              aria-label="Refresh templates"
            >
              <RefreshCw className={`h-4 w-4 ${listQuery.isFetching ? "animate-spin" : ""}`} />
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New Template
            </Button>
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Templates
              {templates.length > 0 && (
                <span className="text-sm font-normal text-[var(--wk-text-secondary)]">
                  ({templates.length})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {listQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : listQuery.isError ? (
              <div className="py-12 text-center text-sm text-[var(--wk-status-error)]">
                Failed to load templates. Please try refreshing.
              </div>
            ) : templates.length === 0 ? (
              <div className="py-12 text-center">
                <Mail className="mx-auto h-10 w-10 text-[var(--wk-text-tertiary)]" />
                <p className="mt-3 text-sm font-medium text-[var(--wk-text-primary)]">
                  No templates yet
                </p>
                <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
                  Create your first email template to get started.
                </p>
                <Button className="mt-4" variant="secondary" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  New Template
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--wk-border-subtle)]">
                      <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                        Name
                      </th>
                      <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                        Subject
                      </th>
                      <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                        Status
                      </th>
                      <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                        Variables
                      </th>
                      <th className="pb-3 pr-4 text-left font-medium text-[var(--wk-text-secondary)]">
                        Last Updated
                      </th>
                      <th className="pb-3 text-right font-medium text-[var(--wk-text-secondary)]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--wk-border-subtle)]">
                    {templates.map((t) => (
                      <tr
                        key={t.id}
                        className="group hover:bg-[var(--wk-surface-raised)] transition-colors cursor-pointer"
                        onClick={() => openEdit(t as EmailTemplate)}
                      >
                        <td className="py-3 pr-4">
                          <div>
                            <span className="font-medium text-[var(--wk-text-primary)]">
                              {t.name}
                            </span>
                            {t.description && (
                              <p className="text-xs text-[var(--wk-text-tertiary)] mt-0.5 truncate max-w-[200px]">
                                {t.description}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-[var(--wk-text-secondary)] max-w-[250px] truncate">
                          {t.subject}
                        </td>
                        <td className="py-3 pr-4">
                          {t.isActive ? (
                            <Badge variant="success">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-[var(--wk-text-secondary)]">
                          {t.variables && t.variables.length > 0 ? (
                            <span className="text-xs font-mono">
                              {t.variables.map((v) => v.name).join(", ")}
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--wk-text-tertiary)]">None</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-[var(--wk-text-secondary)]">
                          {formatRelativeTime(t.updatedAt)}
                        </td>
                        <td className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={`Actions for template ${t.name}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(t as EmailTemplate)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSendTestTemplateName(t.name);
                                  setForm(templateToForm(t as EmailTemplate));
                                  setSendTestEmail("");
                                  setSendTestOpen(true);
                                }}
                              >
                                <Send className="mr-2 h-4 w-4" />
                                Send Test
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-[var(--wk-status-error)] focus:text-[var(--wk-status-error)]"
                                onClick={() => setDeleteTarget(t as EmailTemplate)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delete confirmation dialog */}
        <Dialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Template</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete{" "}
                <span className="font-medium text-[var(--wk-text-primary)]">
                  {deleteTarget?.name}
                </span>
                ? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <>
                    <LoadingSpinner size="sm" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Send Test dialog */}
        <Dialog open={sendTestOpen} onOpenChange={setSendTestOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Send Test Email</DialogTitle>
              <DialogDescription>
                Send a test of <span className="font-medium">{sendTestTemplateName}</span> to verify
                it renders correctly.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="recipient@example.com"
                type="email"
                aria-label="Test email recipient address"
                value={sendTestEmail}
                onChange={(e) => setSendTestEmail(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setSendTestOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSendTest}
                disabled={!sendTestEmail || sendTestMutation.isPending}
              >
                {sendTestMutation.isPending ? (
                  <>
                    <LoadingSpinner size="sm" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send Test
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ─── Edit / Create View ───

  const isEditing = view === "edit";
  const canSave =
    form.name.trim() &&
    form.subject.trim() &&
    form.mjmlBody.trim() &&
    (isEditing || isValidTemplateName(form.name));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={backToList}
          className="h-8 w-8"
          aria-label="Back to template list"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-display font-semibold text-[var(--wk-text-primary)]">
            {isEditing ? `Edit: ${editingTemplate?.name}` : "New Template"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {isEditing && editingTemplate && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handlePreview(editingTemplate.name)}
                disabled={previewMutation.isPending}
              >
                {previewMutation.isPending ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                Preview
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSendTestTemplateName(editingTemplate.name);
                  setSendTestEmail("");
                  setSendTestOpen(true);
                }}
              >
                <Send className="h-4 w-4" />
                Send Test
              </Button>
            </>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!canSave || createMutation.isPending || updateMutation.isPending}
          >
            {createMutation.isPending || updateMutation.isPending ? (
              <>
                <LoadingSpinner size="sm" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Template Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="template-name"
                  className="text-sm font-medium text-[var(--wk-text-primary)]"
                >
                  Name
                </label>
                <Input
                  id="template-name"
                  placeholder="e.g., early-access-confirmation"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  disabled={isEditing}
                  className={isEditing ? "opacity-60" : ""}
                />
                {isEditing ? (
                  <p className="text-xs text-[var(--wk-text-tertiary)]">
                    Template name cannot be changed after creation.
                  </p>
                ) : (
                  <p className="text-xs text-[var(--wk-text-tertiary)]">
                    Lowercase letters, numbers, hyphens, and underscores only.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="template-description"
                  className="text-sm font-medium text-[var(--wk-text-primary)]"
                >
                  Description
                </label>
                <Input
                  id="template-description"
                  placeholder="Brief description of this template"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="template-subject"
                  className="text-sm font-medium text-[var(--wk-text-primary)]"
                >
                  Subject
                </label>
                <Input
                  id="template-subject"
                  placeholder="Email subject line"
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label
                    htmlFor="template-active"
                    className="text-sm font-medium text-[var(--wk-text-primary)]"
                  >
                    Active
                  </label>
                  <p className="text-xs text-[var(--wk-text-tertiary)]">
                    Inactive templates cannot be used to send emails.
                  </p>
                </div>
                <Switch
                  id="template-active"
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileCode2 className="h-4 w-4" />
                Variables
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                aria-label="Template variables (JSON)"
                placeholder={
                  '[\n  { "name": "user_name", "required": true },\n  { "name": "company", "required": false }\n]'
                }
                className="font-mono text-xs min-h-[120px]"
                value={form.variables}
                onChange={(e) => setForm((f) => ({ ...f, variables: e.target.value }))}
              />
              <p className="mt-2 text-xs text-[var(--wk-text-tertiary)]">
                JSON array of variable objects with name and required fields.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Body editors + Preview */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">MJML Body</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                aria-label="MJML email body"
                placeholder="<mjml>...</mjml>"
                className="font-mono text-xs min-h-[280px]"
                value={form.mjmlBody}
                onChange={(e) => setForm((f) => ({ ...f, mjmlBody: e.target.value }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Plain Text Body</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                aria-label="Plain text email body"
                placeholder="Plain text fallback for email clients that don't support HTML..."
                className="font-mono text-xs min-h-[120px]"
                value={form.textBody}
                onChange={(e) => setForm((f) => ({ ...f, textBody: e.target.value }))}
              />
            </CardContent>
          </Card>

          {/* Preview */}
          {previewHtml && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Preview
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Close preview"
                    onClick={() => setPreviewHtml(null)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border border-[var(--wk-border-subtle)] rounded-[var(--wk-radius-lg)] overflow-hidden bg-white">
                  <iframe
                    srcDoc={previewHtml}
                    title="Email preview"
                    className="w-full min-h-[400px] border-0"
                    sandbox=""
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Send Test dialog (shared between list and edit views) */}
      <Dialog open={sendTestOpen} onOpenChange={setSendTestOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription>
              Send a test of <span className="font-medium">{sendTestTemplateName}</span> to verify
              it renders correctly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="recipient@example.com"
              type="email"
              aria-label="Test email recipient address"
              value={sendTestEmail}
              onChange={(e) => setSendTestEmail(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setSendTestOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendTest}
              disabled={!sendTestEmail || sendTestMutation.isPending}
            >
              {sendTestMutation.isPending ? (
                <>
                  <LoadingSpinner size="sm" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Test
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
