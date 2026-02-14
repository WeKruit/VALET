import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import { Button } from "@valet/ui/components/button";
import { Input } from "@valet/ui/components/input";
import { Textarea } from "@valet/ui/components/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@valet/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@valet/ui/components/select";
import { HelpCircle, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { useQueryClient } from "@tanstack/react-query";

type QaCategory =
  | "work_authorization"
  | "experience"
  | "compensation"
  | "availability"
  | "identity"
  | "custom";

type QaUsageMode = "always_use" | "ask_each_time" | "decline_to_answer";

type AnswerSource = "user_input" | "resume_inferred" | "application_learned";

interface QaEntry {
  id: string;
  category: QaCategory;
  question: string;
  answer: string;
  usageMode: QaUsageMode;
  source: AnswerSource;
  timesUsed: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

const CATEGORY_LABELS: Record<QaCategory, string> = {
  work_authorization: "Work Authorization",
  experience: "Experience",
  compensation: "Compensation",
  availability: "Availability",
  identity: "Identity",
  custom: "Custom",
};

const CATEGORY_BADGE_VARIANT: Record<QaCategory, "info" | "success" | "warning" | "error" | "copilot" | "autopilot" | "default"> = {
  work_authorization: "info",
  experience: "success",
  compensation: "warning",
  availability: "copilot",
  identity: "autopilot",
  custom: "default",
};

const SOURCE_LABELS: Record<AnswerSource, string> = {
  user_input: "Manual",
  resume_inferred: "From Resume",
  application_learned: "Learned",
};

const SOURCE_BADGE_VARIANT: Record<AnswerSource, "info" | "success" | "autopilot"> = {
  user_input: "info",
  resume_inferred: "success",
  application_learned: "autopilot",
};

const USAGE_MODE_LABELS: Record<QaUsageMode, string> = {
  always_use: "Always Use",
  ask_each_time: "Ask Each Time",
  decline_to_answer: "Decline to Answer",
};

const CATEGORIES: QaCategory[] = [
  "work_authorization",
  "experience",
  "compensation",
  "availability",
  "identity",
  "custom",
];

interface FormData {
  category: QaCategory;
  question: string;
  answer: string;
  usageMode: QaUsageMode;
}

const EMPTY_FORM: FormData = {
  category: "custom",
  question: "",
  answer: "",
  usageMode: "always_use",
};

export function QaBankSettings() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<QaEntry | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);

  const { data, isLoading } = api.qaBank.list.useQuery({
    queryKey: ["qa-bank"],
    queryData: { query: {} },
    staleTime: 1000 * 60 * 5,
  });

  const createEntry = api.qaBank.create.useMutation({
    onSuccess: (data) => {
      if (data.status === 201) {
        toast.success("Answer saved.");
        queryClient.invalidateQueries({ queryKey: ["qa-bank"] });
        closeDialog();
      }
    },
    onError: () => {
      toast.error("Failed to save answer. Please try again.");
    },
  });

  const updateEntry = api.qaBank.update.useMutation({
    onSuccess: (data) => {
      if (data.status === 200) {
        toast.success("Answer updated.");
        queryClient.invalidateQueries({ queryKey: ["qa-bank"] });
        closeDialog();
      }
    },
    onError: () => {
      toast.error("Failed to update answer. Please try again.");
    },
  });

  const deleteEntry = api.qaBank.delete.useMutation({
    onSuccess: () => {
      toast.success("Answer deleted.");
      queryClient.invalidateQueries({ queryKey: ["qa-bank"] });
    },
    onError: () => {
      toast.error("Failed to delete answer. Please try again.");
    },
  });

  const entries: QaEntry[] = data?.status === 200 ? (data.body.data as QaEntry[]) : [];

  // Group entries by category
  const grouped = CATEGORIES.reduce<Record<string, QaEntry[]>>((acc, cat) => {
    const items = entries.filter((e) => e.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  function openAddDialog() {
    setEditingEntry(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEditDialog(entry: QaEntry) {
    setEditingEntry(entry);
    setForm({
      category: entry.category,
      question: entry.question,
      answer: entry.answer,
      usageMode: entry.usageMode,
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingEntry(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit() {
    if (!form.question.trim() || !form.answer.trim()) {
      toast.error("Question and answer are required.");
      return;
    }

    if (editingEntry) {
      updateEntry.mutate({
        params: { id: editingEntry.id },
        body: {
          answer: form.answer,
          usageMode: form.usageMode,
        },
      });
    } else {
      createEntry.mutate({
        body: {
          category: form.category,
          question: form.question,
          answer: form.answer,
          usageMode: form.usageMode,
          source: "user_input",
        },
      });
    }
  }

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const isSaving = createEntry.isPending || updateEntry.isPending;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <LoadingSpinner />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Q&A Bank</CardTitle>
            <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
              {entries.length} saved answer{entries.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={openAddDialog}>
            <Plus className="mr-1 h-4 w-4" />
            Add Answer
          </Button>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-[var(--wk-radius-2xl)] bg-[var(--wk-surface-sunken)]">
                <HelpCircle className="h-6 w-6 text-[var(--wk-text-tertiary)]" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">
                No saved answers yet
              </h3>
              <p className="mt-1 max-w-sm text-sm text-[var(--wk-text-secondary)]">
                Add answers to common screening questions. VALET will use them
                to auto-fill applications.
              </p>
              <Button variant="secondary" className="mt-4" onClick={openAddDialog}>
                <Plus className="mr-1 h-4 w-4" />
                Add Your First Answer
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([category, items]) => (
                <div key={category}>
                  <div className="mb-3 flex items-center gap-2">
                    <Badge variant={CATEGORY_BADGE_VARIANT[category as QaCategory]}>
                      {CATEGORY_LABELS[category as QaCategory]}
                    </Badge>
                    <span className="text-xs text-[var(--wk-text-tertiary)]">
                      {items.length} answer{items.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {items.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start justify-between gap-3 rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] p-4"
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-sm font-medium">{entry.question}</p>
                          <p className="text-sm text-[var(--wk-text-secondary)] line-clamp-2">
                            {entry.answer}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Badge variant={SOURCE_BADGE_VARIANT[entry.source]}>
                              {SOURCE_LABELS[entry.source]}
                            </Badge>
                            <Badge variant="secondary">
                              {USAGE_MODE_LABELS[entry.usageMode]}
                            </Badge>
                            <span className="text-xs text-[var(--wk-text-tertiary)]">
                              Used {entry.timesUsed} time{entry.timesUsed !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(entry)}
                            title="Edit answer"
                          >
                            <Pencil className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirmId(entry.id)}
                            title="Delete answer"
                          >
                            <Trash2 className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingEntry ? "Edit Answer" : "Add Answer"}
            </DialogTitle>
            <DialogDescription>
              {editingEntry
                ? "Update your saved answer."
                : "Add an answer to a common screening question."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Category</label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, category: v as QaCategory }))
                }
                disabled={!!editingEntry}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Question</label>
              <Input
                className="mt-1"
                placeholder="e.g. Are you authorized to work in the US?"
                value={form.question}
                onChange={(e) =>
                  setForm((f) => ({ ...f, question: e.target.value }))
                }
                disabled={!!editingEntry}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Answer</label>
              <Textarea
                className="mt-1 min-h-[100px]"
                placeholder="Your answer..."
                value={form.answer}
                onChange={(e) =>
                  setForm((f) => ({ ...f, answer: e.target.value }))
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium">Usage Mode</label>
              <Select
                value={form.usageMode}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, usageMode: v as QaUsageMode }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="always_use">Always Use</SelectItem>
                  <SelectItem value="ask_each_time">Ask Each Time</SelectItem>
                  <SelectItem value="decline_to_answer">Decline to Answer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={isSaving}
              onClick={handleSubmit}
            >
              {isSaving ? "Saving..." : editingEntry ? "Update" : "Add Answer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Answer</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this saved answer? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteEntry.isPending}
              onClick={() => {
                if (deleteConfirmId) {
                  deleteEntry.mutate(
                    { params: { id: deleteConfirmId }, body: {} },
                    { onSuccess: () => setDeleteConfirmId(null) }
                  );
                }
              }}
            >
              {deleteEntry.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
