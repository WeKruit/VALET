import { Card, CardContent } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import {
  Check,
  AlertTriangle,
  User,
  Briefcase,
  GraduationCap,
  Wrench,
  ArrowRight,
} from "lucide-react";
import type { ParsedResumeData } from "../hooks/use-resume-parse";

interface JobPreviewStepProps {
  parsedData: ParsedResumeData;
  onContinueToFullSetup: () => void;
  onFinishQuickStart: () => void;
  isSubmitting?: boolean;
}

interface ProfileField {
  label: string;
  value: string | null | undefined;
  icon: React.ComponentType<{ className?: string }>;
  filled: boolean;
}

export function JobPreviewStep({
  parsedData,
  onContinueToFullSetup,
  onFinishQuickStart,
  isSubmitting,
}: JobPreviewStepProps) {
  const fields: ProfileField[] = [
    {
      label: "Full Name",
      value: parsedData.fullName,
      icon: User,
      filled: !!parsedData.fullName,
    },
    {
      label: "Email",
      value: parsedData.email,
      icon: User,
      filled: !!parsedData.email,
    },
    {
      label: "Phone",
      value: parsedData.phone,
      icon: User,
      filled: !!parsedData.phone,
    },
    {
      label: "Location",
      value: parsedData.location,
      icon: User,
      filled: !!parsedData.location,
    },
    {
      label: "Work Experience",
      value:
        (parsedData.workHistory ?? []).length > 0
          ? `${parsedData.workHistory!.length} position${parsedData.workHistory!.length > 1 ? "s" : ""}`
          : null,
      icon: Briefcase,
      filled: (parsedData.workHistory ?? []).length > 0,
    },
    {
      label: "Education",
      value:
        (parsedData.education ?? []).length > 0
          ? `${parsedData.education![0]!.degree} - ${parsedData.education![0]!.school}`
          : null,
      icon: GraduationCap,
      filled: (parsedData.education ?? []).length > 0,
    },
    {
      label: "Skills",
      value: (parsedData.skills ?? []).length > 0 ? `${parsedData.skills!.length} skills` : null,
      icon: Wrench,
      filled: (parsedData.skills ?? []).length > 0,
    },
  ];

  const filledCount = fields.filter((f) => f.filled).length;
  const totalFields = fields.length;

  // What's missing for real submissions
  const missingForSubmission: string[] = [];
  if (!parsedData.email) missingForSubmission.push("Email address");
  if (!parsedData.phone) missingForSubmission.push("Phone number");
  missingForSubmission.push("Platform login credentials (LinkedIn, Workday, etc.)");
  missingForSubmission.push("Email access for verification codes");
  missingForSubmission.push("Job search preferences");

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="font-display text-xl font-semibold">Here's what VALET knows about you</h2>
        <p className="text-sm text-[var(--wk-text-secondary)]">
          VALET extracted {filledCount} of {totalFields} profile fields from your resume. This is
          what it would use to fill job applications.
        </p>
      </div>

      {/* Profile preview card */}
      <Card>
        <CardContent className="p-6 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)] mb-3">
            Application Preview
          </p>
          {fields.map((field) => {
            return (
              <div key={field.label} className="flex items-center gap-3 py-2">
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    field.filled
                      ? "bg-emerald-50 text-[var(--wk-status-success)]"
                      : "bg-amber-50 text-amber-500"
                  }`}
                >
                  {field.filled ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{field.label}</p>
                  <p
                    className={`text-xs truncate ${
                      field.filled ? "text-[var(--wk-text-secondary)]" : "text-amber-600"
                    }`}
                  >
                    {field.filled ? field.value : "Not found in resume"}
                  </p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Missing for real submissions */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="p-5 space-y-3">
          <p className="text-sm font-medium">To submit real applications, you'll also need:</p>
          <ul className="space-y-1.5">
            {missingForSubmission.map((item) => (
              <li
                key={item}
                className="text-sm text-[var(--wk-text-secondary)] flex items-start gap-2"
              >
                <span className="text-amber-500 mt-0.5 shrink-0">&bull;</span>
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-[var(--wk-text-tertiary)]">
        This was a preview only — no applications were submitted.
      </p>

      <Button
        variant="cta"
        size="lg"
        className="w-full"
        disabled={isSubmitting}
        onClick={onFinishQuickStart}
      >
        {isSubmitting ? "Finishing..." : "Start Using VALET"}
      </Button>

      <p className="text-center text-xs text-[var(--wk-text-tertiary)]">or</p>

      <Button
        variant="ghost"
        size="lg"
        className="w-full"
        disabled={isSubmitting}
        onClick={onContinueToFullSetup}
      >
        Continue to Full Setup
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );
}
