import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Input } from "@valet/ui/components/input";
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
  Plus,
  Pencil,
  Trash2,
  X,
  Briefcase,
  GraduationCap,
  Link as LinkIcon,
  FileText,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { useQueryClient } from "@tanstack/react-query";

interface WorkEntry {
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  description: string;
}

interface EducationEntry {
  school: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  gpa: string;
}

const EMPTY_WORK: WorkEntry = {
  company: "",
  title: "",
  startDate: "",
  endDate: "",
  description: "",
};

const EMPTY_EDUCATION: EducationEntry = {
  school: "",
  degree: "",
  field: "",
  startDate: "",
  endDate: "",
  gpa: "",
};

export function ProfileSettings() {
  const queryClient = useQueryClient();

  const { data, isLoading } = api.users.getProfile.useQuery({
    queryKey: ["users", "profile"],
    queryData: {},
    staleTime: 1000 * 60 * 5,
  });

  const updateProfile = api.users.updateProfile.useMutation({
    onSuccess: (data) => {
      if (data.status === 200) {
        toast.success("Profile saved.");
        queryClient.invalidateQueries({ queryKey: ["users", "profile"] });
      }
    },
    onError: () => {
      toast.error("Failed to save profile. Please try again.");
    },
  });

  // Fetch parsed resumes for skill import
  const { data: resumesData } = api.resumes.list.useQuery({
    queryKey: ["resumes"],
    queryData: {},
    staleTime: 1000 * 60 * 5,
  });

  const resumeSkills = useMemo(() => {
    const resumes = resumesData?.status === 200 ? resumesData.body.data : [];
    const allSkills = new Set<string>();
    for (const r of resumes) {
      if (r.status === "parsed" && r.parsedData?.skills) {
        for (const s of r.parsedData.skills) allSkills.add(s);
      }
    }
    return Array.from(allSkills);
  }, [resumesData]);

  const [showImportPicker, setShowImportPicker] = useState(false);
  const [selectedImportSkills, setSelectedImportSkills] = useState<Set<string>>(new Set());

  const profile = data?.status === 200 ? data.body : null;

  // Personal info state
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");

  // Skills state
  const [skills, setSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState("");

  // Work history state
  const [workHistory, setWorkHistory] = useState<WorkEntry[]>([]);
  const [workDialogOpen, setWorkDialogOpen] = useState(false);
  const [editingWorkIndex, setEditingWorkIndex] = useState<number | null>(null);
  const [workForm, setWorkForm] = useState<WorkEntry>(EMPTY_WORK);

  // Education state
  const [education, setEducation] = useState<EducationEntry[]>([]);
  const [eduDialogOpen, setEduDialogOpen] = useState(false);
  const [editingEduIndex, setEditingEduIndex] = useState<number | null>(null);
  const [eduForm, setEduForm] = useState<EducationEntry>(EMPTY_EDUCATION);

  useEffect(() => {
    if (profile) {
      setPhone(profile.phone ?? "");
      setLocation(profile.location ?? "");
      setLinkedinUrl(profile.linkedinUrl ?? "");
      setGithubUrl(profile.githubUrl ?? "");
      setPortfolioUrl(profile.portfolioUrl ?? "");
      setSkills(profile.skills ?? []);
      setWorkHistory((profile.workHistory as WorkEntry[]) ?? []);
      setEducation((profile.education as EducationEntry[]) ?? []);
    }
  }, [profile]);

  function handleSavePersonalInfo() {
    updateProfile.mutate({
      body: {
        ...(phone && { phone }),
        ...(location && { location }),
        ...(linkedinUrl && { linkedinUrl }),
        ...(githubUrl && { githubUrl }),
        ...(portfolioUrl && { portfolioUrl }),
      },
    });
  }

  function handleSaveSkills() {
    updateProfile.mutate({
      body: { skills },
    });
  }

  function addSkill() {
    const trimmed = newSkill.trim();
    if (!trimmed) return;
    if (skills.includes(trimmed)) {
      toast.error("Skill already added.");
      return;
    }
    setSkills((prev) => [...prev, trimmed]);
    setNewSkill("");
  }

  function removeSkill(skill: string) {
    setSkills((prev) => prev.filter((s) => s !== skill));
  }

  function handleSkillKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addSkill();
    }
  }

  // Work history handlers
  function openAddWork() {
    setEditingWorkIndex(null);
    setWorkForm(EMPTY_WORK);
    setWorkDialogOpen(true);
  }

  function openEditWork(index: number) {
    const entry = workHistory[index] as WorkEntry | undefined;
    if (!entry) return;
    setEditingWorkIndex(index);
    setWorkForm({
      company: entry.company ?? "",
      title: entry.title ?? "",
      startDate: entry.startDate ?? "",
      endDate: entry.endDate ?? "",
      description: entry.description ?? "",
    });
    setWorkDialogOpen(true);
  }

  function saveWork() {
    if (!workForm.company.trim() || !workForm.title.trim()) {
      toast.error("Company and title are required.");
      return;
    }
    if (editingWorkIndex !== null) {
      const updated = [...workHistory];
      updated[editingWorkIndex] = workForm;
      setWorkHistory(updated);
    } else {
      setWorkHistory((prev) => [workForm, ...prev]);
    }
    setWorkDialogOpen(false);
    toast.success("Work history updated. Click Save to persist.");
  }

  function deleteWork(index: number) {
    setWorkHistory((prev) => prev.filter((_, i) => i !== index));
    toast.success("Entry removed. Click Save to persist.");
  }

  // Education handlers
  function openAddEdu() {
    setEditingEduIndex(null);
    setEduForm(EMPTY_EDUCATION);
    setEduDialogOpen(true);
  }

  function openEditEdu(index: number) {
    const entry = education[index] as EducationEntry | undefined;
    if (!entry) return;
    setEditingEduIndex(index);
    setEduForm({
      school: entry.school ?? "",
      degree: entry.degree ?? "",
      field: entry.field ?? "",
      startDate: entry.startDate ?? "",
      endDate: entry.endDate ?? "",
      gpa: entry.gpa ?? "",
    });
    setEduDialogOpen(true);
  }

  function saveEdu() {
    if (!eduForm.school.trim() || !eduForm.degree.trim()) {
      toast.error("School and degree are required.");
      return;
    }
    if (editingEduIndex !== null) {
      const updated = [...education];
      updated[editingEduIndex] = eduForm;
      setEducation(updated);
    } else {
      setEducation((prev) => [eduForm, ...prev]);
    }
    setEduDialogOpen(false);
    toast.success("Education updated. Click Save to persist.");
  }

  function deleteEdu(index: number) {
    setEducation((prev) => prev.filter((_, i) => i !== index));
    toast.success("Entry removed. Click Save to persist.");
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
    <div className="space-y-6">
      {/* Personal Info */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Full Name</label>
              <Input
                className="mt-1"
                value={profile?.name ?? ""}
                disabled
              />
              <p className="mt-1 text-xs text-[var(--wk-text-tertiary)]">
                Managed by your Google account
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input
                className="mt-1"
                type="email"
                value={profile?.email ?? ""}
                disabled
              />
            </div>
            <div>
              <label className="text-sm font-medium">Phone</label>
              <Input
                className="mt-1"
                type="tel"
                placeholder="+1 555-123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Location</label>
              <Input
                className="mt-1"
                placeholder="City, State"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <LinkIcon className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
              Links
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium">LinkedIn</label>
                <Input
                  className="mt-1"
                  type="url"
                  placeholder="https://linkedin.com/in/..."
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">GitHub</label>
                <Input
                  className="mt-1"
                  type="url"
                  placeholder="https://github.com/..."
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">Portfolio</label>
                <Input
                  className="mt-1"
                  type="url"
                  placeholder="https://yoursite.com"
                  value={portfolioUrl}
                  onChange={(e) => setPortfolioUrl(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="primary"
              disabled={updateProfile.isPending}
              onClick={handleSavePersonalInfo}
            >
              {updateProfile.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Skills */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Skills</CardTitle>
          {resumeSkills.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                // Pre-select skills not already in profile
                const toImport = new Set(resumeSkills.filter((s) => !skills.includes(s)));
                setSelectedImportSkills(toImport);
                setShowImportPicker(true);
              }}
            >
              <FileText className="mr-1 h-4 w-4" />
              Import from Resume
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Add a skill (e.g. React, Python, Project Management)"
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              onKeyDown={handleSkillKeyDown}
              className="flex-1"
            />
            <Button variant="secondary" size="sm" onClick={addSkill}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Import picker inline */}
          {showImportPicker && (
            <div className="rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-default)] bg-[var(--wk-surface-sunken)]/30 p-3 space-y-2">
              <p className="text-xs font-medium text-[var(--wk-text-secondary)]">
                Select skills from your parsed resume to import:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {resumeSkills.map((skill) => {
                  const alreadyAdded = skills.includes(skill);
                  const isSelected = selectedImportSkills.has(skill);
                  return (
                    <button
                      key={skill}
                      disabled={alreadyAdded}
                      onClick={() => {
                        setSelectedImportSkills((prev) => {
                          const next = new Set(prev);
                          if (next.has(skill)) next.delete(skill);
                          else next.add(skill);
                          return next;
                        });
                      }}
                      className={`inline-flex items-center gap-1 rounded-[var(--wk-radius-full)] px-2.5 py-1 text-xs font-medium transition-colors ${
                        alreadyAdded
                          ? "bg-[var(--wk-surface-sunken)] text-[var(--wk-text-tertiary)] cursor-not-allowed"
                          : isSelected
                            ? "bg-[var(--wk-text-primary)] text-[var(--wk-surface-page)]"
                            : "bg-[var(--wk-surface-white)] text-[var(--wk-text-secondary)] border border-[var(--wk-border-default)] hover:border-[var(--wk-border-strong)]"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                      {skill}
                      {alreadyAdded && <span className="text-[10px]">(added)</span>}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowImportPicker(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={selectedImportSkills.size === 0}
                  onClick={() => {
                    setSkills((prev) => [...prev, ...Array.from(selectedImportSkills)]);
                    setShowImportPicker(false);
                    toast.success(`${selectedImportSkills.size} skill${selectedImportSkills.size === 1 ? "" : "s"} imported. Click Save to persist.`);
                  }}
                >
                  Import {selectedImportSkills.size > 0 ? `(${selectedImportSkills.size})` : ""}
                </Button>
              </div>
            </div>
          )}

          {skills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {skills.map((skill) => (
                <Badge key={skill} variant="default" className="gap-1 pr-1">
                  {skill}
                  <button
                    onClick={() => removeSkill(skill)}
                    className="ml-1 cursor-pointer rounded-full p-0.5 transition-colors hover:bg-[var(--wk-surface-sunken)]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--wk-text-tertiary)]">
              No skills added yet. Add skills to help VALET match you with relevant jobs.
            </p>
          )}

          <div className="flex justify-end">
            <Button
              variant="primary"
              disabled={updateProfile.isPending}
              onClick={handleSaveSkills}
            >
              {updateProfile.isPending ? "Saving..." : "Save Skills"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Work History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Work History</CardTitle>
          <Button variant="secondary" size="sm" onClick={openAddWork}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </CardHeader>
        <CardContent>
          {workHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-[var(--wk-radius-2xl)] bg-[var(--wk-surface-sunken)]">
                <Briefcase className="h-6 w-6 text-[var(--wk-text-tertiary)]" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">
                No work history
              </h3>
              <p className="mt-1 max-w-sm text-sm text-[var(--wk-text-secondary)]">
                Add your work experience to help VALET tailor your applications.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {workHistory.map((entry, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-3 rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] p-4"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--wk-radius-lg)] bg-[var(--wk-surface-sunken)]">
                      <Briefcase className="h-5 w-5 text-[var(--wk-text-secondary)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{entry.title}</p>
                      <p className="text-sm text-[var(--wk-text-secondary)]">
                        {entry.company}
                      </p>
                      <p className="text-xs text-[var(--wk-text-tertiary)]">
                        {entry.startDate}
                        {entry.endDate ? ` - ${entry.endDate}` : " - Present"}
                      </p>
                      {entry.description && (
                        <p className="mt-1 text-sm text-[var(--wk-text-secondary)] line-clamp-2">
                          {entry.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditWork(i)}
                      title="Edit work experience"
                      aria-label={`Edit ${entry.title} at ${entry.company}`}
                    >
                      <Pencil className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteWork(i)}
                      title="Remove work experience"
                      aria-label={`Remove ${entry.title} at ${entry.company}`}
                    >
                      <Trash2 className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {workHistory.length > 0 && (
            <div className="flex justify-end pt-4">
              <Button
                variant="primary"
                disabled={updateProfile.isPending}
                onClick={() => updateProfile.mutate({ body: { workHistory: workHistory as unknown[] } })}
              >
                {updateProfile.isPending ? "Saving..." : "Save Work History"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Education */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Education</CardTitle>
          <Button variant="secondary" size="sm" onClick={openAddEdu}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </CardHeader>
        <CardContent>
          {education.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-[var(--wk-radius-2xl)] bg-[var(--wk-surface-sunken)]">
                <GraduationCap className="h-6 w-6 text-[var(--wk-text-tertiary)]" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">
                No education entries
              </h3>
              <p className="mt-1 max-w-sm text-sm text-[var(--wk-text-secondary)]">
                Add your education to improve application accuracy.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {education.map((entry, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-3 rounded-[var(--wk-radius-lg)] border border-[var(--wk-border-subtle)] p-4"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--wk-radius-lg)] bg-[var(--wk-surface-sunken)]">
                      <GraduationCap className="h-5 w-5 text-[var(--wk-text-secondary)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {entry.degree}{entry.field ? `, ${entry.field}` : ""}
                      </p>
                      <p className="text-sm text-[var(--wk-text-secondary)]">
                        {entry.school}
                      </p>
                      <p className="text-xs text-[var(--wk-text-tertiary)]">
                        {entry.startDate}
                        {entry.endDate ? ` - ${entry.endDate}` : " - Present"}
                        {entry.gpa ? ` | GPA: ${entry.gpa}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditEdu(i)}
                      title="Edit education"
                      aria-label={`Edit ${entry.degree} at ${entry.school}`}
                    >
                      <Pencil className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteEdu(i)}
                      title="Remove education"
                      aria-label={`Remove ${entry.degree} at ${entry.school}`}
                    >
                      <Trash2 className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {education.length > 0 && (
            <div className="flex justify-end pt-4">
              <Button
                variant="primary"
                disabled={updateProfile.isPending}
                onClick={() => updateProfile.mutate({ body: { education: education as unknown[] } })}
              >
                {updateProfile.isPending ? "Saving..." : "Save Education"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Work History Dialog */}
      <Dialog open={workDialogOpen} onOpenChange={(open) => !open && setWorkDialogOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingWorkIndex !== null ? "Edit Work Experience" : "Add Work Experience"}
            </DialogTitle>
            <DialogDescription>
              {editingWorkIndex !== null
                ? "Update your work experience details."
                : "Add a new work experience entry."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium">Job Title</label>
                <Input
                  className="mt-1"
                  placeholder="Software Engineer"
                  value={workForm.title}
                  onChange={(e) =>
                    setWorkForm((f) => ({ ...f, title: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Company</label>
                <Input
                  className="mt-1"
                  placeholder="Acme Inc."
                  value={workForm.company}
                  onChange={(e) =>
                    setWorkForm((f) => ({ ...f, company: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Start Date</label>
                <Input
                  className="mt-1"
                  type="month"
                  value={workForm.startDate}
                  onChange={(e) =>
                    setWorkForm((f) => ({ ...f, startDate: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">End Date</label>
                <Input
                  className="mt-1"
                  type="month"
                  placeholder="Leave blank if current"
                  value={workForm.endDate}
                  onChange={(e) =>
                    setWorkForm((f) => ({ ...f, endDate: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <textarea
                className="mt-1 flex min-h-[80px] w-full rounded-[var(--wk-radius-md)] border border-[var(--wk-border-default)] hover:border-[var(--wk-border-strong)] bg-[var(--wk-surface-white)] px-3 py-2 text-sm text-[var(--wk-text-primary)] placeholder:text-[var(--wk-text-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wk-border-strong)] focus-visible:ring-offset-2 transition-colors"
                placeholder="Describe your responsibilities and achievements..."
                value={workForm.description}
                onChange={(e) =>
                  setWorkForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setWorkDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveWork}>
              {editingWorkIndex !== null ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Education Dialog */}
      <Dialog open={eduDialogOpen} onOpenChange={(open) => !open && setEduDialogOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingEduIndex !== null ? "Edit Education" : "Add Education"}
            </DialogTitle>
            <DialogDescription>
              {editingEduIndex !== null
                ? "Update your education details."
                : "Add a new education entry."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">School</label>
                <Input
                  className="mt-1"
                  placeholder="University of Example"
                  value={eduForm.school}
                  onChange={(e) =>
                    setEduForm((f) => ({ ...f, school: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Degree</label>
                <Input
                  className="mt-1"
                  placeholder="B.S."
                  value={eduForm.degree}
                  onChange={(e) =>
                    setEduForm((f) => ({ ...f, degree: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Field of Study</label>
                <Input
                  className="mt-1"
                  placeholder="Computer Science"
                  value={eduForm.field}
                  onChange={(e) =>
                    setEduForm((f) => ({ ...f, field: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Start Date</label>
                <Input
                  className="mt-1"
                  type="month"
                  value={eduForm.startDate}
                  onChange={(e) =>
                    setEduForm((f) => ({ ...f, startDate: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">End Date</label>
                <Input
                  className="mt-1"
                  type="month"
                  placeholder="Leave blank if current"
                  value={eduForm.endDate}
                  onChange={(e) =>
                    setEduForm((f) => ({ ...f, endDate: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">GPA (optional)</label>
                <Input
                  className="mt-1"
                  placeholder="3.8"
                  value={eduForm.gpa}
                  onChange={(e) =>
                    setEduForm((f) => ({ ...f, gpa: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEduDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveEdu}>
              {editingEduIndex !== null ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
