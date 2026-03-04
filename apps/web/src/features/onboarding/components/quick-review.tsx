import { useState } from "react";
import { Card, CardContent } from "@valet/ui/components/card";
import { Input } from "@valet/ui/components/input";
import { Textarea } from "@valet/ui/components/textarea";
import { Button } from "@valet/ui/components/button";
import { Pencil, Plus, Trash2, Check, X, AlertTriangle } from "lucide-react";
import type { ParsedResumeData } from "../hooks/use-resume-parse";

interface QuickReviewProps {
  /** Parsed resume data (primary source during onboarding) */
  parsedData?: ParsedResumeData | null;
  /** Legacy profile data (fallback when parsedData not available) */
  profile?: {
    name: string;
    email: string;
    phone: string;
    location: string;
    experience: string[];
    education: string;
    skills: string[];
  };
  /** Overall parse confidence (0-1) — show warnings below this */
  parseConfidence?: number | null;
  onConfirm: (updates: {
    name: string;
    email: string;
    phone: string;
    location: string;
    experience: string[];
    education: string;
    skills: string[];
  }) => void;
  isSaving?: boolean;
}

/** Transform parsedResumeData into editable field values */
function deriveFromParsed(data: ParsedResumeData) {
  return {
    name: data.fullName ?? "",
    email: data.email ?? "",
    phone: data.phone ?? "",
    location: data.location ?? "",
    experience: (data.workHistory ?? []).map(
      (w) =>
        `${w.title} at ${w.company}${w.startDate ? ` (${w.startDate}–${w.endDate ?? "Present"})` : ""}`,
    ),
    education:
      (data.education ?? []).length > 0
        ? `${data.education![0]!.degree}${data.education![0]!.fieldOfStudy ? ` in ${data.education![0]!.fieldOfStudy}` : ""} — ${data.education![0]!.school}`
        : "",
    skills: data.skills ?? [],
  };
}

export function QuickReview({
  parsedData,
  profile: legacyProfile,
  parseConfidence,
  onConfirm,
  isSaving,
}: QuickReviewProps) {
  // Derive initial values from parsedData (preferred) or legacy profile
  const initial = parsedData
    ? deriveFromParsed(parsedData)
    : (legacyProfile ?? {
        name: "",
        email: "",
        phone: "",
        location: "",
        experience: [],
        education: "",
        skills: [],
      });

  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const [location, setLocation] = useState(initial.location);

  // Experience editing state
  const [experience, setExperience] = useState<string[]>(initial.experience);
  const [editingExpIndex, setEditingExpIndex] = useState<number | null>(null);
  const [editingExpValue, setEditingExpValue] = useState("");
  const [addingExp, setAddingExp] = useState(false);
  const [newExpValue, setNewExpValue] = useState("");

  // Education editing state
  const [education, setEducation] = useState(initial.education);
  const [editingEdu, setEditingEdu] = useState(false);
  const [editingEduValue, setEditingEduValue] = useState(initial.education);

  const [skills] = useState<string[]>(initial.skills);

  const lowConfidence = parseConfidence != null && parseConfidence < 0.7;

  // ─── Experience handlers ───
  function startEditExp(index: number) {
    const entry = experience[index];
    if (entry === undefined) return;
    setEditingExpIndex(index);
    setEditingExpValue(entry);
  }

  function saveEditExp() {
    if (editingExpIndex === null) return;
    const trimmed = editingExpValue.trim();
    if (!trimmed) return;
    setExperience((prev) => prev.map((e, i) => (i === editingExpIndex ? trimmed : e)));
    setEditingExpIndex(null);
    setEditingExpValue("");
  }

  function cancelEditExp() {
    setEditingExpIndex(null);
    setEditingExpValue("");
  }

  function addExp() {
    const trimmed = newExpValue.trim();
    if (!trimmed) return;
    setExperience((prev) => [...prev, trimmed]);
    setNewExpValue("");
    setAddingExp(false);
  }

  function removeExp(index: number) {
    setExperience((prev) => prev.filter((_, i) => i !== index));
    if (editingExpIndex === index) {
      setEditingExpIndex(null);
      setEditingExpValue("");
    }
  }

  // ─── Education handlers ───
  function startEditEdu() {
    setEditingEdu(true);
    setEditingEduValue(education);
  }

  function saveEditEdu() {
    const trimmed = editingEduValue.trim();
    if (!trimmed) return;
    setEducation(trimmed);
    setEditingEdu(false);
  }

  function cancelEditEdu() {
    setEditingEdu(false);
    setEditingEduValue(education);
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
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="mt-1"
                />
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
                Your Experience
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAddingExp(true);
                  setNewExpValue("");
                }}
                aria-label="Add experience entry"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
            <div className="space-y-1">
              {experience.map((exp, i) => (
                <div key={i} className="group flex items-start gap-2">
                  {editingExpIndex === i ? (
                    <div className="flex-1 flex items-center gap-1.5">
                      <Textarea
                        value={editingExpValue}
                        onChange={(e) => setEditingExpValue(e.target.value)}
                        className="min-h-[2rem] text-sm flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            saveEditExp();
                          }
                          if (e.key === "Escape") cancelEditExp();
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={saveEditExp}
                        aria-label="Save experience edit"
                      >
                        <Check className="h-3.5 w-3.5 text-[var(--wk-status-success)]" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelEditExp}
                        aria-label="Cancel experience edit"
                      >
                        <X className="h-3.5 w-3.5 text-[var(--wk-text-tertiary)]" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm flex-1">{exp}</p>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditExp(i)}
                          aria-label={`Edit experience: ${exp}`}
                        >
                          <Pencil className="h-3 w-3 text-[var(--wk-text-tertiary)]" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeExp(i)}
                          aria-label={`Remove experience: ${exp}`}
                        >
                          <Trash2 className="h-3 w-3 text-[var(--wk-text-tertiary)]" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}

              {experience.length === 0 && !addingExp && (
                <p className="text-sm text-[var(--wk-text-tertiary)]">
                  No experience entries. Click "Add" to add one.
                </p>
              )}

              {/* Add new experience row */}
              {addingExp && (
                <div className="flex items-center gap-1.5 pt-1">
                  <Textarea
                    value={newExpValue}
                    onChange={(e) => setNewExpValue(e.target.value)}
                    placeholder="e.g. Software Engineer at Acme Corp (2020-2023)"
                    className="min-h-[2rem] text-sm flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        addExp();
                      }
                      if (e.key === "Escape") {
                        setAddingExp(false);
                        setNewExpValue("");
                      }
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={addExp}
                    disabled={!newExpValue.trim()}
                    aria-label="Confirm add experience"
                  >
                    <Check className="h-3.5 w-3.5 text-[var(--wk-status-success)]" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAddingExp(false);
                      setNewExpValue("");
                    }}
                    aria-label="Cancel add experience"
                  >
                    <X className="h-3.5 w-3.5 text-[var(--wk-text-tertiary)]" />
                  </Button>
                </div>
              )}
            </div>

            {/* Education */}
            <div className="flex items-center justify-between pt-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
                Education
              </h3>
              {!editingEdu && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={startEditEdu}
                  aria-label="Edit education"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
            </div>
            {editingEdu ? (
              <div className="flex items-center gap-1.5">
                <Input
                  value={editingEduValue}
                  onChange={(e) => setEditingEduValue(e.target.value)}
                  className="text-sm flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveEditEdu();
                    }
                    if (e.key === "Escape") cancelEditEdu();
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={saveEditEdu}
                  aria-label="Save education edit"
                >
                  <Check className="h-3.5 w-3.5 text-[var(--wk-status-success)]" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={cancelEditEdu}
                  aria-label="Cancel education edit"
                >
                  <X className="h-3.5 w-3.5 text-[var(--wk-text-tertiary)]" />
                </Button>
              </div>
            ) : (
              <p className="text-sm">
                {education || (
                  <span className="text-[var(--wk-text-tertiary)]">No education found</span>
                )}
              </p>
            )}

            <div className="flex flex-wrap gap-1.5 mt-2">
              {skills.slice(0, 5).map((skill) => (
                <span
                  key={skill}
                  className="inline-flex px-2 py-0.5 text-xs rounded-[var(--wk-radius-full)] bg-[var(--wk-surface-sunken)] text-[var(--wk-text-secondary)]"
                >
                  {skill}
                </span>
              ))}
              {skills.length > 5 && (
                <span className="inline-flex px-2 py-0.5 text-xs rounded-[var(--wk-radius-full)] bg-[var(--wk-surface-sunken)] text-[var(--wk-text-tertiary)]">
                  +{skills.length - 5} more
                </span>
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
            name,
            email,
            phone,
            location,
            experience,
            education,
            skills,
          })
        }
      >
        {isSaving ? "Saving..." : "Looks Good \u2014 Continue"}
      </Button>
    </div>
  );
}
