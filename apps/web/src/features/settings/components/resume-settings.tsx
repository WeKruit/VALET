import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Badge } from "@valet/ui/components/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@valet/ui/components/dialog";
import {
  Upload,
  FileText,
  Trash2,
  Star,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { useQueryClient } from "@tanstack/react-query";

const MAX_RESUMES = 5;

export function ResumeSettings() {
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = api.resumes.list.useQuery({
    queryKey: ["resumes"],
    queryData: {},
    staleTime: 1000 * 60 * 5,
  });

  const uploadResume = api.resumes.upload.useMutation({
    onSuccess: (data) => {
      if (data.status === 202) {
        toast.success("Resume uploaded. Parsing will begin shortly.");
        queryClient.invalidateQueries({ queryKey: ["resumes"] });
      }
    },
    onError: () => {
      toast.error("Resume upload failed. Please try again.");
    },
  });

  const deleteResume = api.resumes.delete.useMutation({
    onSuccess: () => {
      toast.success("Resume deleted.");
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      setDeleteId(null);
    },
    onError: () => {
      toast.error("Failed to delete resume. Please try again.");
    },
  });

  const setDefault = api.resumes.setDefault.useMutation({
    onSuccess: () => {
      toast.success("Default resume updated.");
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
    },
    onError: () => {
      toast.error("Failed to set default resume. Please try again.");
    },
  });

  const resumes = data?.status === 200 ? data.body.data : [];
  const canUpload = resumes.length < MAX_RESUMES;

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && isValidFile(file)) {
        processFile(file);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  function isValidFile(file: File): boolean {
    const validTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!validTypes.includes(file.type)) {
      toast.error("Only PDF and DOCX files are accepted.");
      return false;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10MB.");
      return false;
    }
    return true;
  }

  function processFile(file: File) {
    if (!canUpload) {
      toast.error(`You can only have ${MAX_RESUMES} resumes. Delete one first.`);
      return;
    }
    uploadResume.mutate({ body: { file } });
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && isValidFile(file)) {
      processFile(file);
    }
    e.target.value = "";
  }

  function formatDate(date: Date | string) {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

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
            <CardTitle>Resumes</CardTitle>
            <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
              {resumes.length} of {MAX_RESUMES} resumes uploaded
            </p>
          </div>
          <Badge variant={canUpload ? "info" : "warning"}>
            {resumes.length}/{MAX_RESUMES}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload zone */}
          {canUpload && (
            <label
              className={cn(
                "flex flex-col items-center justify-center gap-3 p-6",
                "border-2 border-dashed rounded-[var(--wk-radius-lg)] cursor-pointer",
                "transition-colors duration-[var(--wk-duration-fast)]",
                isDragging
                  ? "border-[var(--wk-copilot)] bg-blue-50"
                  : "border-[var(--wk-border-default)] hover:border-[var(--wk-border-strong)]",
                uploadResume.isPending && "pointer-events-none opacity-50"
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept=".pdf,.docx"
                onChange={handleFileSelect}
                className="hidden"
              />
              {uploadResume.isPending ? (
                <>
                  <FileText className="h-8 w-8 text-[var(--wk-copilot)] animate-pulse" />
                  <p className="text-sm text-[var(--wk-text-secondary)]">Uploading...</p>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-[var(--wk-text-tertiary)]" />
                  <div className="text-center">
                    <p className="text-sm font-medium">
                      Drag and drop your resume here
                    </p>
                    <p className="text-xs text-[var(--wk-text-tertiary)]">
                      or click to browse &middot; PDF or DOCX, max 10MB
                    </p>
                  </div>
                </>
              )}
            </label>
          )}

          {/* Resume list */}
          {resumes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-[var(--wk-radius-2xl)] bg-[var(--wk-surface-sunken)]">
                <FileText className="h-6 w-6 text-[var(--wk-text-tertiary)]" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">
                No resumes yet
              </h3>
              <p className="mt-1 max-w-sm text-sm text-[var(--wk-text-secondary)]">
                Upload your first resume to get started. VALET uses it to
                auto-fill job applications.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {resumes.map((resume) => (
                <div
                  key={resume.id}
                  className={cn(
                    "flex items-start justify-between gap-4 rounded-[var(--wk-radius-lg)] border p-4",
                    resume.isDefault
                      ? "border-[var(--wk-accent-amber)] bg-amber-50/50"
                      : "border-[var(--wk-border-subtle)]"
                  )}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--wk-radius-lg)] bg-[var(--wk-surface-sunken)]">
                      <FileText className="h-5 w-5 text-[var(--wk-text-secondary)]" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {resume.filename}
                        </p>
                        {resume.isDefault && (
                          <Badge variant="warning">
                            <Star className="mr-1 h-3 w-3" />
                            Default
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--wk-text-tertiary)]">
                        <span>{formatDate(resume.createdAt)}</span>
                        <span>&middot;</span>
                        <span>{formatSize(resume.fileSizeBytes)}</span>
                        <span>&middot;</span>
                        <StatusBadge status={resume.status} confidence={resume.parsingConfidence} />
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!resume.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={setDefault.isPending}
                        onClick={() =>
                          setDefault.mutate({
                            params: { id: resume.id },
                            body: {},
                          })
                        }
                        title="Set as default"
                      >
                        <Star className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteId(resume.id)}
                      title="Delete resume"
                    >
                      <Trash2 className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Resume</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this resume? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteResume.isPending}
              onClick={() => {
                if (deleteId) {
                  deleteResume.mutate({
                    params: { id: deleteId },
                    body: {},
                  });
                }
              }}
            >
              {deleteResume.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusBadge({
  status,
  confidence,
}: {
  status: string;
  confidence: number | null;
}) {
  switch (status) {
    case "parsed":
      return (
        <Badge variant="success">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Parsed{confidence !== null ? ` (${Math.round(confidence * 100)}%)` : ""}
        </Badge>
      );
    case "parsing":
      return (
        <Badge variant="info">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Parsing
        </Badge>
      );
    case "parse_failed":
      return (
        <Badge variant="error">
          <AlertCircle className="mr-1 h-3 w-3" />
          Failed
        </Badge>
      );
    case "uploading":
      return (
        <Badge variant="info">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Uploading
        </Badge>
      );
    default:
      return <Badge variant="default">{status}</Badge>;
  }
}
