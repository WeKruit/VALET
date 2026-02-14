import * as React from "react";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Input } from "@valet/ui/components/input";
import { Button } from "@valet/ui/components/button";
import { Badge } from "@valet/ui/components/badge";
import { X, Plus, Briefcase, MapPin, DollarSign, Building2, Factory } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const REMOTE_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
] as const;

export function JobPreferencesSettings() {
  const queryClient = useQueryClient();

  const { data, isLoading } = api.users.getJobPreferences.useQuery({
    queryKey: ["users", "jobPreferences"],
    queryData: {},
    staleTime: 1000 * 60 * 5,
  });

  const updateJobPrefs = api.users.updateJobPreferences.useMutation({
    onSuccess: (res) => {
      if (res.status === 200) {
        toast.success("Job preferences saved.");
        queryClient.invalidateQueries({ queryKey: ["users", "jobPreferences"] });
      }
    },
    onError: () => {
      toast.error("Failed to save. Please try again.");
    },
  });

  const prefs = data?.status === 200 ? data.body : null;

  const [targetJobTitles, setTargetJobTitles] = useState<string[]>([]);
  const [newJobTitle, setNewJobTitle] = useState("");
  const [preferredLocations, setPreferredLocations] = useState<string[]>([]);
  const [newLocation, setNewLocation] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [salaryCurrency, setSalaryCurrency] = useState("USD");
  const [remotePreference, setRemotePreference] = useState<string>("any");
  const [excludedCompanies, setExcludedCompanies] = useState<string[]>([]);
  const [newExcluded, setNewExcluded] = useState("");
  const [preferredIndustries, setPreferredIndustries] = useState<string[]>([]);
  const [newIndustry, setNewIndustry] = useState("");

  useEffect(() => {
    if (prefs) {
      setTargetJobTitles(prefs.targetJobTitles ?? []);
      setPreferredLocations(prefs.preferredLocations ?? []);
      setSalaryMin(prefs.salaryRange?.min?.toString() ?? "");
      setSalaryMax(prefs.salaryRange?.max?.toString() ?? "");
      setSalaryCurrency(prefs.salaryRange?.currency ?? "USD");
      setRemotePreference(prefs.remotePreference ?? "any");
      setExcludedCompanies(prefs.excludedCompanies ?? []);
      setPreferredIndustries(prefs.preferredIndustries ?? []);
    }
  }, [prefs]);

  function addTag(
    value: string,
    setter: React.Dispatch<React.SetStateAction<string>>,
    list: string[],
    listSetter: React.Dispatch<React.SetStateAction<string[]>>,
  ) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (list.includes(trimmed)) {
      toast.error("Already added.");
      return;
    }
    listSetter((prev) => [...prev, trimmed]);
    setter("");
  }

  function removeTag(
    value: string,
    listSetter: React.Dispatch<React.SetStateAction<string[]>>,
  ) {
    listSetter((prev) => prev.filter((s) => s !== value));
  }

  function handleKeyDown(
    e: React.KeyboardEvent,
    value: string,
    setter: React.Dispatch<React.SetStateAction<string>>,
    list: string[],
    listSetter: React.Dispatch<React.SetStateAction<string[]>>,
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag(value, setter, list, listSetter);
    }
  }

  function handleSave() {
    const salaryRange =
      salaryMin || salaryMax
        ? {
            min: Number(salaryMin) || 0,
            max: Number(salaryMax) || 0,
            currency: salaryCurrency,
          }
        : undefined;

    updateJobPrefs.mutate({
      body: {
        targetJobTitles,
        preferredLocations,
        salaryRange,
        remotePreference: remotePreference as "remote" | "hybrid" | "onsite" | "any",
        excludedCompanies,
        preferredIndustries,
      },
    });
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
      {/* Target Job Titles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
            Target Job Titles
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Software Engineer, Product Manager"
              value={newJobTitle}
              onChange={(e) => setNewJobTitle(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, newJobTitle, setNewJobTitle, targetJobTitles, setTargetJobTitles)}
              className="flex-1"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => addTag(newJobTitle, setNewJobTitle, targetJobTitles, setTargetJobTitles)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {targetJobTitles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {targetJobTitles.map((t) => (
                <Badge key={t} variant="default" className="gap-1 pr-1">
                  {t}
                  <button
                    onClick={() => removeTag(t, setTargetJobTitles)}
                    className="ml-1 cursor-pointer rounded-full p-0.5 transition-colors hover:bg-[var(--wk-surface-sunken)]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preferred Locations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
            Preferred Locations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. San Francisco, New York, London"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, newLocation, setNewLocation, preferredLocations, setPreferredLocations)}
              className="flex-1"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => addTag(newLocation, setNewLocation, preferredLocations, setPreferredLocations)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {preferredLocations.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {preferredLocations.map((l) => (
                <Badge key={l} variant="default" className="gap-1 pr-1">
                  {l}
                  <button
                    onClick={() => removeTag(l, setPreferredLocations)}
                    className="ml-1 cursor-pointer rounded-full p-0.5 transition-colors hover:bg-[var(--wk-surface-sunken)]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Remote Preference */}
      <Card>
        <CardHeader>
          <CardTitle>Remote Preference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {REMOTE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRemotePreference(opt.value)}
                className={cn(
                  "px-4 py-2 rounded-[var(--wk-radius-lg)] text-sm font-medium border transition-colors cursor-pointer",
                  remotePreference === opt.value
                    ? "border-[var(--wk-copilot)] bg-blue-50 text-[var(--wk-copilot)]"
                    : "border-[var(--wk-border-default)] text-[var(--wk-text-secondary)] hover:border-[var(--wk-border-strong)]"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Salary Range */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
            Salary Range
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-sm font-medium">Minimum</label>
              <Input
                className="mt-1"
                type="number"
                placeholder="e.g. 80000"
                value={salaryMin}
                onChange={(e) => setSalaryMin(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Maximum</label>
              <Input
                className="mt-1"
                type="number"
                placeholder="e.g. 150000"
                value={salaryMax}
                onChange={(e) => setSalaryMax(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Currency</label>
              <Input
                className="mt-1"
                maxLength={3}
                placeholder="USD"
                value={salaryCurrency}
                onChange={(e) => setSalaryCurrency(e.target.value.toUpperCase())}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Excluded Companies */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
            Excluded Companies
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-[var(--wk-text-secondary)]">
            VALET will skip job postings from these companies.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Acme Corp"
              value={newExcluded}
              onChange={(e) => setNewExcluded(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, newExcluded, setNewExcluded, excludedCompanies, setExcludedCompanies)}
              className="flex-1"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => addTag(newExcluded, setNewExcluded, excludedCompanies, setExcludedCompanies)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {excludedCompanies.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {excludedCompanies.map((c) => (
                <Badge key={c} variant="default" className="gap-1 pr-1">
                  {c}
                  <button
                    onClick={() => removeTag(c, setExcludedCompanies)}
                    className="ml-1 cursor-pointer rounded-full p-0.5 transition-colors hover:bg-[var(--wk-surface-sunken)]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preferred Industries */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Factory className="h-4 w-4 text-[var(--wk-text-tertiary)]" />
            Preferred Industries
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Technology, Healthcare, Finance"
              value={newIndustry}
              onChange={(e) => setNewIndustry(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, newIndustry, setNewIndustry, preferredIndustries, setPreferredIndustries)}
              className="flex-1"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => addTag(newIndustry, setNewIndustry, preferredIndustries, setPreferredIndustries)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {preferredIndustries.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {preferredIndustries.map((ind) => (
                <Badge key={ind} variant="default" className="gap-1 pr-1">
                  {ind}
                  <button
                    onClick={() => removeTag(ind, setPreferredIndustries)}
                    className="ml-1 cursor-pointer rounded-full p-0.5 transition-colors hover:bg-[var(--wk-surface-sunken)]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button
          variant="primary"
          className="w-full sm:w-auto"
          disabled={updateJobPrefs.isPending}
          onClick={handleSave}
        >
          {updateJobPrefs.isPending ? "Saving..." : "Save Job Preferences"}
        </Button>
      </div>
    </div>
  );
}
