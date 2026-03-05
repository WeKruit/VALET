import { useState } from "react";
import { Card, CardContent } from "@valet/ui/components/card";
import { Input } from "@valet/ui/components/input";
import { Button } from "@valet/ui/components/button";
import { Plus, Trash2, X, Pencil, Check, AlertTriangle } from "lucide-react";
import type { ParsedResumeData } from "../hooks/use-resume-parse";

/** The structured shape that matches the updateProfile contract */
export interface ProfileConfirmPayload {
  phone: string;
  location: string;
  skills: string[];
  workHistory: Array<{
    title: string;
    company: string;
    location?: string;
    startDate?: string | null;
    endDate?: string | null;
    description?: string;
    bullets?: string[];
    achievements?: string[];
  }>;
  education: Array<{
    school: string;
    degree: string;
    fieldOfStudy?: string;
    gpa?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    expectedGraduation?: string | null;
    honors?: string | null;
  }>;
}

interface QuickReviewProps {
  /** Parsed resume data (primary source during onboarding) */
  parsedData?: ParsedResumeData | null;
  /** Overall parse confidence (0-1) — show warnings below this */
  parseConfidence?: number | null;
  onConfirm: (updates: ProfileConfirmPayload) => void;
  isSaving?: boolean;
}

/** Format a work-history entry for display */
function formatWorkEntry(w: ProfileConfirmPayload["workHistory"][number]): string {
  const dateRange = w.startDate ? ` (${w.startDate}–${w.endDate ?? "Present"})` : "";
  return `${w.title} at ${w.company}${dateRange}`;
}

export function QuickReview({
  parsedData,
  parseConfidence,
  onConfirm,
  isSaving,
}: QuickReviewProps) {
  // Derive initial structured values from parsedData
  const initialPhone = parsedData?.phone ?? "";
  const initialLocation = parsedData?.location ?? "";
  const initialWorkHistory: ProfileConfirmPayload["workHistory"] = (
    parsedData?.workHistory ?? []
  ).map((w) => ({ ...w }));
  const initialEducation: ProfileConfirmPayload["education"] = (parsedData?.education ?? []).map(
    (e) => ({ ...e }),
  );
  const initialSkills = parsedData?.skills ?? [];

  // Editable fields
  const [phone, setPhone] = useState(initialPhone);
  const [location, setLocation] = useState(initialLocation);

  // Work history — keep structured
  const [workHistory, setWorkHistory] = useState(initialWorkHistory);
  const [addingExp, setAddingExp] = useState(false);
  const [newExpTitle, setNewExpTitle] = useState("");
  const [newExpCompany, setNewExpCompany] = useState("");
  const [editingExpIndex, setEditingExpIndex] = useState<number | null>(null);

  // Education — editable
  const [education, setEducation] = useState(initialEducation);

  // Skills — removable + addable
  const [skills, setSkills] = useState<string[]>(initialSkills);
  const [addingSkill, setAddingSkill] = useState(false);
  const [newSkill, setNewSkill] = useState("");

  const lowConfidence = parseConfidence != null && parseConfidence < 0.7;

  function addExp() {
    const title = newExpTitle.trim();
    const company = newExpCompany.trim();
    if (!title || !company) return;
    setWorkHistory((prev) => [...prev, { title, company }]);
    setNewExpTitle("");
    setNewExpCompany("");
    setAddingExp(false);
  }

  function removeExp(index: number) {
    setWorkHistory((prev) => prev.filter((_, i) => i !== index));
    if (editingExpIndex === index) setEditingExpIndex(null);
  }

  function updateExp(index: number, field: "title" | "company", value: string) {
    setWorkHistory((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)),
    );
  }

  function updateEducation(index: number, field: string, value: string) {
    setEducation((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)),
    );
  }

  function removeSkill(skill: string) {
    setSkills((prev) => prev.filter((s) => s !== skill));
  }

  function addSkillEntry() {
    const trimmed = newSkill.trim();
    if (!trimmed || skills.includes(trimmed)) return;
    setSkills((prev) => [...prev, trimmed]);
    setNewSkill("");
    setAddingSkill(false);
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="font-display text-xl font-semibold">Does this look right?</h2>
        <p className="text-sm text-[var(--wk-text-secondary)]">
          We extracted this from your resume. Edit anything that needs fixing.
        </p>
      </div>

      {lowConfidence && (
        <div className="flex items-start gap-2 p-3 rounded-[var(--wk-radius-md)] bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>Some fields had low extraction confidence. Please review carefully.</p>
        </div>
      )}

      <Card>
        <CardContent className="p-6 space-y-6">
          {/* Basics */}
          <div className="space-y-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
              Your Basics
            </h3>
            <div className="grid gap-4">
              {/* Name — read-only (set by OAuth, not editable via profile update) */}
              <div>
                <label className="text-sm font-medium">Name</label>
                <p className="mt-1 text-sm px-3 py-2 rounded-[var(--wk-radius-md)] bg-[var(--wk-surface-sunken)] text-[var(--wk-text-primary)]">
                  {parsedData?.fullName || (
                    <span className="text-[var(--wk-text-tertiary)] italic">From your account</span>
                  )}
                </p>
              </div>
              {/* Email — read-only (set by OAuth) */}
              <div>
                <label className="text-sm font-medium">Email</label>
                <p className="mt-1 text-sm px-3 py-2 rounded-[var(--wk-radius-md)] bg-[var(--wk-surface-sunken)] text-[var(--wk-text-primary)]">
                  {parsedData?.email || (
                    <span className="text-[var(--wk-text-tertiary)] italic">From your account</span>
                  )}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Phone</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +1 (555) 123-4567"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Location</label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. San Francisco, CA"
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Experience */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
                Experience
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAddingExp(true);
                  setNewExpTitle("");
                  setNewExpCompany("");
                }}
                aria-label="Add experience entry"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
            <div className="space-y-1">
              {workHistory.map((entry, i) => (
                <div key={i} className="group">
                  {editingExpIndex === i ? (
                    <div className="space-y-2 py-1">
                      <Input
                        value={entry.title}
                        onChange={(e) => updateExp(i, "title", e.target.value)}
                        placeholder="Job title"
                        className="text-sm"
                        autoFocus
                      />
                      <Input
                        value={entry.company}
                        onChange={(e) => updateExp(i, "company", e.target.value)}
                        placeholder="Company"
                        className="text-sm"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Escape") {
                            setEditingExpIndex(null);
                          }
                        }}
                      />
                      <Button variant="ghost" size="sm" onClick={() => setEditingExpIndex(null)}>
                        <Check className="h-3 w-3 mr-1" />
                        Done
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <p className="text-sm flex-1">{formatWorkEntry(entry)}</p>
                      <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingExpIndex(i)}
                          aria-label={`Edit experience: ${formatWorkEntry(entry)}`}
                        >
                          <Pencil className="h-3 w-3 text-[var(--wk-text-tertiary)]" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeExp(i)}
                          aria-label={`Remove experience: ${formatWorkEntry(entry)}`}
                        >
                          <Trash2 className="h-3 w-3 text-[var(--wk-text-tertiary)]" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {workHistory.length === 0 && !addingExp && (
                <p className="text-sm text-[var(--wk-text-tertiary)]">
                  No experience entries. Click &quot;Add&quot; to add one.
                </p>
              )}

              {/* Add new experience row */}
              {addingExp && (
                <div className="space-y-2 pt-1">
                  <Input
                    value={newExpTitle}
                    onChange={(e) => setNewExpTitle(e.target.value)}
                    placeholder="Job title (e.g. Software Engineer)"
                    className="text-sm"
                    autoFocus
                  />
                  <Input
                    value={newExpCompany}
                    onChange={(e) => setNewExpCompany(e.target.value)}
                    placeholder="Company (e.g. Acme Corp)"
                    className="text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addExp();
                      }
                      if (e.key === "Escape") {
                        setAddingExp(false);
                      }
                    }}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={addExp}
                      disabled={!newExpTitle.trim() || !newExpCompany.trim()}
                    >
                      Add
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAddingExp(false);
                        setNewExpTitle("");
                        setNewExpCompany("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Education — editable */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
              Education
            </h3>
            {education.length > 0 ? (
              education.map((entry, i) => (
                <div key={i} className="grid gap-2">
                  <Input
                    value={entry.school}
                    onChange={(e) => updateEducation(i, "school", e.target.value)}
                    placeholder="School"
                    className="text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={entry.degree}
                      onChange={(e) => updateEducation(i, "degree", e.target.value)}
                      placeholder="Degree"
                      className="text-sm"
                    />
                    <Input
                      value={entry.fieldOfStudy ?? ""}
                      onChange={(e) => updateEducation(i, "fieldOfStudy", e.target.value)}
                      placeholder="Field of study"
                      className="text-sm"
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-[var(--wk-text-tertiary)]">No education found</p>
            )}
          </div>

          {/* Skills — removable + addable */}
          <div className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
              Skills
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-[var(--wk-radius-full)] bg-[var(--wk-surface-sunken)] text-[var(--wk-text-secondary)]"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => removeSkill(skill)}
                    className="hover:text-[var(--wk-text-primary)] transition-colors"
                    aria-label={`Remove skill: ${skill}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {!addingSkill ? (
                <button
                  type="button"
                  onClick={() => setAddingSkill(true)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-[var(--wk-radius-full)] border border-dashed border-[var(--wk-border-default)] text-[var(--wk-text-tertiary)] hover:text-[var(--wk-text-secondary)] transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              ) : (
                <Input
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  placeholder="New skill"
                  className="text-xs w-32 h-6 px-2"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSkillEntry();
                    }
                    if (e.key === "Escape") {
                      setAddingSkill(false);
                      setNewSkill("");
                    }
                  }}
                  onBlur={() => {
                    if (newSkill.trim()) {
                      addSkillEntry();
                    } else {
                      setAddingSkill(false);
                    }
                  }}
                />
              )}
              {skills.length === 0 && !addingSkill && (
                <p className="text-sm text-[var(--wk-text-tertiary)]">No skills found</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-[var(--wk-text-tertiary)]">
        Everything else can be fine-tuned later in Settings.
      </p>

      <Button
        variant="cta"
        size="lg"
        className="w-full"
        disabled={isSaving}
        onClick={() =>
          onConfirm({
            phone,
            location,
            skills,
            workHistory,
            education,
          })
        }
      >
        {isSaving ? "Saving..." : "Looks Good \u2014 Continue"}
      </Button>
    </div>
  );
}
