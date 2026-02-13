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
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api, API_BASE_URL, getAccessToken } from "@/lib/api-client";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { useQueryClient } from "@tanstack/react-query";

const MAX_RESUMES = 5;

export function ResumeSettings() {
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = api.resumes.list.useQuery({
    queryKey: ["resumes"],
    queryData: {},
    staleTime: 1000 * 60 * 5,
    refetchInterval: (query) => {
      const resumes = query.state.data?.status === 200 ? query.state.data.body.data : [];
      return resumes.some((r) => r.status === "parsing" || r.status === "uploading") ? 3000 : false;
    },
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

  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete(id: string) {
    setIsDeleting(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE_URL}/api/v1/resumes/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 204 || res.status === 200) {
        toast.success("Resume deleted.");
        queryClient.invalidateQueries({ queryKey: ["resumes"] });
        setDeleteId(null);
      } else {
        const body = await res.json().catch(() => null);
        console.error("Delete failed:", res.status, body);
        toast.error(body?.message ?? "Failed to delete resume.");
      }
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Failed to delete resume. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  const setDefault = api.resumes.setDefault.useMutation({
    onSuccess: () => {
      toast.success("Default resume updated.");
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
    },
    onError: () => {
      toast.error("Failed to set default resume. Please try again.");
    },
  });

  const retryParse = api.resumes.retryParse.useMutation({
    onSuccess: () => {
      toast.success("Re-parsing resume...");
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
    },
    onError: () => {
      toast.error("Failed to retry parsing. Please try again.");
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
              {resumes.map((resume) => {
                const isExpanded = expandedId === resume.id;
                const pd = resume.parsedData;
                return (
                  <div
                    key={resume.id}
                    className={cn(
                      "rounded-[var(--wk-radius-lg)] border overflow-hidden",
                      resume.isDefault
                        ? "border-[var(--wk-accent-amber)] bg-amber-50/50"
                        : "border-[var(--wk-border-subtle)]"
                    )}
                  >
                    <div className="flex items-start justify-between gap-4 p-4">
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
                        {resume.status === "parsed" && pd && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedId(isExpanded ? null : resume.id)}
                            title={isExpanded ? "Hide parsed data" : "View parsed data"}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
                            )}
                          </Button>
                        )}
                        {(resume.status === "parsing" || resume.status === "parse_failed") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={retryParse.isPending}
                            onClick={() =>
                              retryParse.mutate({
                                params: { id: resume.id },
                                body: {},
                              })
                            }
                            title="Retry parsing"
                          >
                            <RotateCcw className={cn("h-4 w-4 text-[var(--wk-text-tertiary)]", retryParse.isPending && "animate-spin")} />
                          </Button>
                        )}
                        {!resume.isDefault && resume.status === "parsed" && (
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
                    {/* Parsed data expandable section */}
                    {isExpanded && pd && (
                      <div className="border-t border-[var(--wk-border-subtle)] px-4 py-3 space-y-3 bg-[var(--wk-surface-sunken)]/30">
                        {pd.fullName && (
                          <div>
                            <p className="text-xs font-medium text-[var(--wk-text-tertiary)] uppercase tracking-wider">Name</p>
                            <p className="text-sm">{pd.fullName}</p>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          {pd.email && (
                            <div>
                              <p className="text-xs font-medium text-[var(--wk-text-tertiary)] uppercase tracking-wider">Email</p>
                              <p className="text-sm">{pd.email}</p>
                            </div>
                          )}
                          {pd.phone && (
                            <div>
                              <p className="text-xs font-medium text-[var(--wk-text-tertiary)] uppercase tracking-wider">Phone</p>
                              <p className="text-sm">{pd.phone}</p>
                            </div>
                          )}
                          {pd.location && (
                            <div>
                              <p className="text-xs font-medium text-[var(--wk-text-tertiary)] uppercase tracking-wider">Location</p>
                              <p className="text-sm">{pd.location}</p>
                            </div>
                          )}
                          {pd.totalYearsExperience != null && (
                            <div>
                              <p className="text-xs font-medium text-[var(--wk-text-tertiary)] uppercase tracking-wider">Experience</p>
                              <p className="text-sm">{pd.totalYearsExperience} years</p>
                            </div>
                          )}
                          {pd.workAuthorization && (
                            <div>
                              <p className="text-xs font-medium text-[var(--wk-text-tertiary)] uppercase tracking-wider">Work Auth</p>
                              <p className="text-sm">{pd.workAuthorization}</p>
                            </div>
                          )}
                        </div>
                        {pd.skills && pd.skills.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-[var(--wk-text-tertiary)] uppercase tracking-wider mb-1">Skills</p>
                            <div className="flex flex-wrap gap-1">
                              {pd.skills.map((skill) => (
                                <span key={skill} className="inline-flex items-center rounded-[var(--wk-radius-full)] bg-[var(--wk-surface-sunken)] px-2 py-0.5 text-xs text-[var(--wk-text-secondary)]">
                                  {skill}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {pd.education && pd.education.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-[var(--wk-text-tertiary)] uppercase tracking-wider mb-1">Education</p>
                            <div className="space-y-1.5">
                              {pd.education.map((edu, i) => (
                                <div key={i} className="text-sm">
                                  <p className="font-medium">
                                    {edu.degree}
                                    {edu.fieldOfStudy ? `, ${edu.fieldOfStudy}` : ""}
                                  </p>
                                  <p className="text-[var(--wk-text-secondary)]">
                                    {edu.school}
                                    {edu.startDate || edu.endDate
                                      ? ` (${edu.startDate ?? "?"} – ${edu.endDate ?? (edu.expectedGraduation ? `Expected ${edu.expectedGraduation}` : "present")})`
                                      : ""}
                                    {edu.gpa ? ` — GPA: ${edu.gpa}` : ""}
                                    {edu.honors ? ` — ${edu.honors}` : ""}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {pd.workHistory && pd.workHistory.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-[var(--wk-text-tertiary)] uppercase tracking-wider mb-1">
                              Work Experience ({pd.workHistory.length})
                            </p>
                            <div className="space-y-2.5">
                              {pd.workHistory.map((job, i) => (
                                <div key={i} className="text-sm">
                                  <p className="font-medium">{job.title}</p>
                                  <p className="text-[var(--wk-text-secondary)]">
                                    {job.company}
                                    {job.location ? `, ${job.location}` : ""}
                                    {job.startDate || job.endDate
                                      ? ` (${job.startDate ?? "?"} – ${job.endDate ?? "present"})`
                                      : ""}
                                  </p>
                                  {job.bullets && job.bullets.length > 0 && (
                                    <ul className="mt-1 space-y-0.5 text-[var(--wk-text-secondary)]">
                                      {job.bullets.map((bullet, bi) => (
                                        <li key={bi} className="flex gap-1.5">
                                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--wk-text-tertiary)]" />
                                          <span>{bullet}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {pd.projects && pd.projects.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-[var(--wk-text-tertiary)] uppercase tracking-wider mb-1">Projects</p>
                            <div className="space-y-1.5">
                              {pd.projects.map((proj, i) => (
                                <div key={i} className="text-sm">
                                  <p className="font-medium">{proj.name}</p>
                                  {proj.description && <p className="text-[var(--wk-text-secondary)]">{proj.description}</p>}
                                  {proj.technologies && proj.technologies.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      {proj.technologies.map((tech) => (
                                        <span key={tech} className="inline-flex items-center rounded-[var(--wk-radius-full)] bg-[var(--wk-surface-sunken)] px-1.5 py-0.5 text-[10px] text-[var(--wk-text-tertiary)]">
                                          {tech}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {pd.interests && pd.interests.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-[var(--wk-text-tertiary)] uppercase tracking-wider mb-1">Interests</p>
                            <div className="flex flex-wrap gap-1">
                              {pd.interests.map((interest) => (
                                <span key={interest} className="inline-flex items-center rounded-[var(--wk-radius-full)] bg-[var(--wk-surface-sunken)] px-2 py-0.5 text-xs text-[var(--wk-text-secondary)]">
                                  {interest}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {pd.languages && pd.languages.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-[var(--wk-text-tertiary)] uppercase tracking-wider mb-1">Languages</p>
                            <p className="text-sm text-[var(--wk-text-secondary)]">{pd.languages.join(", ")}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
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
              disabled={isDeleting}
              onClick={() => {
                if (deleteId) {
                  handleDelete(deleteId);
                }
              }}
            >
              {isDeleting ? "Deleting..." : "Delete"}
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
          Parsed
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
