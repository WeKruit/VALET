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
import { ChevronDown, ChevronUp } from "lucide-react";

export interface QaAnswers {
  workAuthorization: string;
  visaSponsorship: string;
  salaryMin: string;
  salaryMax: string;
  willingToRelocate: string;
  driversLicense: string;
  felonyConviction: string;
  linkedinUrl: string;
  portfolioUrl: string;
  referralSource: string;
  eeoRace: string;
  eeoGender: string;
  eeoVeteran: string;
  eeoDisability: string;
}

interface QaStepProps {
  onContinue: (answers: QaAnswers) => void;
  isSaving?: boolean;
  initialAnswers?: Partial<QaAnswers>;
}

export function QaStep({ onContinue, isSaving, initialAnswers }: QaStepProps) {
  const [answers, setAnswers] = useState<QaAnswers>({
    workAuthorization: initialAnswers?.workAuthorization ?? "",
    visaSponsorship: initialAnswers?.visaSponsorship ?? "",
    salaryMin: initialAnswers?.salaryMin ?? "",
    salaryMax: initialAnswers?.salaryMax ?? "",
    willingToRelocate: initialAnswers?.willingToRelocate ?? "",
    driversLicense: initialAnswers?.driversLicense ?? "",
    felonyConviction: initialAnswers?.felonyConviction ?? "",
    linkedinUrl: initialAnswers?.linkedinUrl ?? "",
    portfolioUrl: initialAnswers?.portfolioUrl ?? "",
    referralSource: initialAnswers?.referralSource ?? "Online job board",
    eeoRace: initialAnswers?.eeoRace ?? "decline",
    eeoGender: initialAnswers?.eeoGender ?? "decline",
    eeoVeteran: initialAnswers?.eeoVeteran ?? "decline",
    eeoDisability: initialAnswers?.eeoDisability ?? "decline",
  });
  const [showEeo, setShowEeo] = useState(false);

  const update = (key: keyof QaAnswers, value: string) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  const canContinue =
    answers.workAuthorization !== "" && answers.visaSponsorship !== "" && !isSaving;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="font-display text-xl font-semibold">
          Answer these once, use them everywhere
        </h2>
        <p className="text-sm text-[var(--wk-text-secondary)]">
          Most job applications ask the same questions. Answer them here and VALET will fill them in
          automatically.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-5">
          {/* Required questions */}
          <div className="space-y-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
              Required
            </h3>

            <div>
              <label className="text-sm font-medium">
                Are you authorized to work in this country?
                <span className="text-[var(--wk-status-error)] ml-0.5">*</span>
              </label>
              <Select
                value={answers.workAuthorization}
                onValueChange={(v) => update("workAuthorization", v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">
                Will you now or in the future require visa sponsorship?
                <span className="text-[var(--wk-status-error)] ml-0.5">*</span>
              </label>
              <Select
                value={answers.visaSponsorship}
                onValueChange={(v) => update("visaSponsorship", v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Optional questions */}
          <div className="space-y-4 pt-2 border-t border-[var(--wk-border-subtle)]">
            <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
              Optional
            </h3>

            <div>
              <label className="text-sm font-medium">Desired salary range</label>
              <p className="text-xs text-[var(--wk-text-tertiary)] mb-1">
                If left blank, VALET will answer "Open to discussion"
              </p>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Min ($)"
                  value={answers.salaryMin}
                  onChange={(e) => update("salaryMin", e.target.value)}
                />
                <Input
                  type="number"
                  placeholder="Max ($)"
                  value={answers.salaryMax}
                  onChange={(e) => update("salaryMax", e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Are you willing to relocate?</label>
              <Select
                value={answers.willingToRelocate}
                onValueChange={(v) => update("willingToRelocate", v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="depends">Depends on location</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Do you have a valid driver's license?</label>
              <Select
                value={answers.driversLicense}
                onValueChange={(v) => update("driversLicense", v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">LinkedIn profile URL</label>
              <Input
                type="url"
                placeholder="https://linkedin.com/in/yourprofile"
                value={answers.linkedinUrl}
                onChange={(e) => update("linkedinUrl", e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Portfolio / personal website URL</label>
              <Input
                type="url"
                placeholder="https://yoursite.com"
                value={answers.portfolioUrl}
                onChange={(e) => update("portfolioUrl", e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">How did you hear about this position?</label>
              <Input
                type="text"
                placeholder="Online job board"
                value={answers.referralSource}
                onChange={(e) => update("referralSource", e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          {/* EEO section */}
          <div className="pt-2 border-t border-[var(--wk-border-subtle)]">
            <button
              type="button"
              className="flex items-center gap-2 text-xs text-[var(--wk-text-tertiary)] hover:text-[var(--wk-text-secondary)]"
              onClick={() => setShowEeo(!showEeo)}
            >
              {showEeo ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              Optional -- Equal Employment Opportunity
            </button>

            {showEeo && (
              <div className="space-y-3 mt-3">
                <p className="text-xs text-[var(--wk-text-tertiary)]">
                  These questions are voluntary. VALET defaults to "Decline to self-identify" for
                  all EEO questions. Change only if you want a specific answer.
                </p>

                {(
                  [
                    ["eeoRace", "Race / Ethnicity"],
                    ["eeoGender", "Gender"],
                    ["eeoVeteran", "Veteran Status"],
                    ["eeoDisability", "Disability Status"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className="text-xs font-medium">{label}</label>
                    <Select value={answers[key]} onValueChange={(v) => update(key, v)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="decline">Decline to self-identify</SelectItem>
                        <SelectItem value="configure">
                          I want to provide a specific answer
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
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
        onClick={() => onContinue(answers)}
      >
        {isSaving ? "Saving..." : "Continue"}
      </Button>
    </div>
  );
}
