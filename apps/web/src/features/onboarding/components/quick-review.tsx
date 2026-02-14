import { useState } from "react";
import { Card, CardContent } from "@valet/ui/components/card";
import { Input } from "@valet/ui/components/input";
import { Textarea } from "@valet/ui/components/textarea";
import { Button } from "@valet/ui/components/button";
import { Pencil, Plus, Trash2, Check, X } from "lucide-react";

interface ParsedProfile {
  name: string;
  email: string;
  phone: string;
  location: string;
  experience: string[];
  education: string;
  skills: string[];
}

interface QuickReviewProps {
  profile: ParsedProfile;
  onConfirm: (updates: {
    phone: string;
    location: string;
    experience: string[];
    education: string;
  }) => void;
  isSaving?: boolean;
}

export function QuickReview({ profile, onConfirm, isSaving }: QuickReviewProps) {
  const [phone, setPhone] = useState(profile.phone);
  const [location, setLocation] = useState(profile.location);

  // Experience editing state
  const [experience, setExperience] = useState<string[]>(profile.experience);
  const [editingExpIndex, setEditingExpIndex] = useState<number | null>(null);
  const [editingExpValue, setEditingExpValue] = useState("");
  const [addingExp, setAddingExp] = useState(false);
  const [newExpValue, setNewExpValue] = useState("");

  // Education editing state
  const [education, setEducation] = useState(profile.education);
  const [editingEdu, setEditingEdu] = useState(false);
  const [editingEduValue, setEditingEduValue] = useState(profile.education);

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
        <h2 className="font-display text-xl font-semibold">
          Does this look right?
        </h2>
        <p className="text-sm text-[var(--wk-text-secondary)]">
          We'll use this to fill your applications. You can edit phone and
          location if needed.
        </p>
      </div>

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
                <Input value={profile.name} readOnly className="mt-1 bg-[var(--wk-surface-sunken)]" />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input value={profile.email} readOnly className="mt-1 bg-[var(--wk-surface-sunken)]" />
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
              <p className="text-sm">{education}</p>
            )}

            <div className="flex flex-wrap gap-1.5 mt-2">
              {profile.skills.slice(0, 5).map((skill) => (
                <span
                  key={skill}
                  className="inline-flex px-2 py-0.5 text-xs rounded-[var(--wk-radius-full)] bg-[var(--wk-surface-sunken)] text-[var(--wk-text-secondary)]"
                >
                  {skill}
                </span>
              ))}
              {profile.skills.length > 5 && (
                <span className="inline-flex px-2 py-0.5 text-xs rounded-[var(--wk-radius-full)] bg-[var(--wk-surface-sunken)] text-[var(--wk-text-tertiary)]">
                  +{profile.skills.length - 5} more
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
        onClick={() => onConfirm({ phone, location, experience, education })}
      >
        {isSaving ? "Saving..." : "Looks Good \u2014 Let's Go"}
      </Button>
    </div>
  );
}
