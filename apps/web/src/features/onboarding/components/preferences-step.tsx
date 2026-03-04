import { useState } from "react";
import { Card, CardContent } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Input } from "@valet/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@valet/ui/components/select";
import { Badge } from "@valet/ui/components/badge";
import { X, AlertTriangle } from "lucide-react";

export interface JobPreferences {
  targetTitles: string[];
  targetLocations: string[];
  companyExclusions: string[];
  experienceLevel: string;
  remotePreference: string;
  minimumSalary: string;
}

interface PreferencesStepProps {
  onContinue: (preferences: JobPreferences) => void;
  isSaving?: boolean;
  initialPreferences?: Partial<JobPreferences>;
}

function TagInput({
  label,
  placeholder,
  tags,
  onAdd,
  onRemove,
  required,
}: {
  label: string;
  placeholder: string;
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (index: number) => void;
  required?: boolean;
}) {
  const [inputValue, setInputValue] = useState("");

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const trimmed = inputValue.trim().replace(/,$/, "");
      if (trimmed && !tags.includes(trimmed)) {
        onAdd(trimmed);
        setInputValue("");
      }
    }
  }

  return (
    <div>
      <label className="text-sm font-medium">
        {label}
        {required && <span className="text-[var(--wk-status-error)] ml-0.5">*</span>}
      </label>
      <Input
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          const trimmed = inputValue.trim();
          if (trimmed && !tags.includes(trimmed)) {
            onAdd(trimmed);
            setInputValue("");
          }
        }}
        className="mt-1"
      />
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {tags.map((tag, i) => (
            <Badge key={tag} variant="default" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="ml-0.5 rounded-full hover:bg-black/10 p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <p className="text-xs text-[var(--wk-text-tertiary)] mt-1">Press Enter or comma to add</p>
    </div>
  );
}

export function PreferencesStep({
  onContinue,
  isSaving,
  initialPreferences,
}: PreferencesStepProps) {
  const [prefs, setPrefs] = useState<JobPreferences>({
    targetTitles: initialPreferences?.targetTitles ?? [],
    targetLocations: initialPreferences?.targetLocations ?? [],
    companyExclusions: initialPreferences?.companyExclusions ?? [],
    experienceLevel: initialPreferences?.experienceLevel ?? "",
    remotePreference: initialPreferences?.remotePreference ?? "",
    minimumSalary: initialPreferences?.minimumSalary ?? "",
  });

  const canContinue =
    prefs.targetTitles.length > 0 &&
    prefs.targetLocations.length > 0 &&
    prefs.experienceLevel !== "" &&
    !isSaving;

  return (
    <div className="max-w-xl mx-auto px-4 space-y-6">
      <div className="text-center space-y-2">
        <h2 className="font-display text-xl font-semibold">Tell VALET what to look for</h2>
        <p className="text-sm text-[var(--wk-text-secondary)]">
          Be specific -- broader preferences mean more applications but lower match quality.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <TagInput
            label="Target job titles"
            placeholder='e.g. "Software Engineer"'
            tags={prefs.targetTitles}
            onAdd={(tag) =>
              setPrefs((p) => ({
                ...p,
                targetTitles: [...p.targetTitles, tag],
              }))
            }
            onRemove={(i) =>
              setPrefs((p) => ({
                ...p,
                targetTitles: p.targetTitles.filter((_, idx) => idx !== i),
              }))
            }
            required
          />

          <TagInput
            label="Target locations"
            placeholder='e.g. "San Francisco, CA" or "Remote"'
            tags={prefs.targetLocations}
            onAdd={(tag) =>
              setPrefs((p) => ({
                ...p,
                targetLocations: [...p.targetLocations, tag],
              }))
            }
            onRemove={(i) =>
              setPrefs((p) => ({
                ...p,
                targetLocations: p.targetLocations.filter((_, idx) => idx !== i),
              }))
            }
            required
          />

          <div>
            <label className="text-sm font-medium">
              Experience level
              <span className="text-[var(--wk-status-error)] ml-0.5">*</span>
            </label>
            <Select
              value={prefs.experienceLevel}
              onValueChange={(v) => setPrefs((p) => ({ ...p, experienceLevel: v }))}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="intern">Intern</SelectItem>
                <SelectItem value="entry">Entry Level</SelectItem>
                <SelectItem value="mid">Mid Level</SelectItem>
                <SelectItem value="senior">Senior</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
                <SelectItem value="principal">Principal</SelectItem>
                <SelectItem value="executive">Executive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Remote preference</label>
            <Select
              value={prefs.remotePreference}
              onValueChange={(v) => setPrefs((p) => ({ ...p, remotePreference: v }))}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="No preference" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="remote">Remote only</SelectItem>
                <SelectItem value="hybrid">Hybrid OK</SelectItem>
                <SelectItem value="onsite">On-site OK</SelectItem>
                <SelectItem value="any">No preference</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Minimum salary (optional)</label>
            <p className="text-xs text-[var(--wk-text-tertiary)] mb-1">
              Jobs below this won't be auto-applied. Leave blank to consider all.
            </p>
            <Input
              type="number"
              placeholder="$"
              value={prefs.minimumSalary}
              onChange={(e) => setPrefs((p) => ({ ...p, minimumSalary: e.target.value }))}
            />
          </div>

          <div className="pt-2 border-t border-[var(--wk-border-subtle)]">
            <TagInput
              label="Companies to exclude"
              placeholder='e.g. "Current Employer Inc."'
              tags={prefs.companyExclusions}
              onAdd={(tag) =>
                setPrefs((p) => ({
                  ...p,
                  companyExclusions: [...p.companyExclusions, tag],
                }))
              }
              onRemove={(i) =>
                setPrefs((p) => ({
                  ...p,
                  companyExclusions: p.companyExclusions.filter((_, idx) => idx !== i),
                }))
              }
            />
            {prefs.companyExclusions.length === 0 && (
              <div className="flex items-center gap-2 mt-2 text-xs text-amber-700 bg-amber-50 rounded-[var(--wk-radius-md)] px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                We recommend excluding at least your current employer.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Button
        variant="cta"
        size="lg"
        className="w-full"
        disabled={!canContinue}
        onClick={() => onContinue(prefs)}
      >
        {isSaving ? "Saving..." : "Continue"}
      </Button>
    </div>
  );
}
