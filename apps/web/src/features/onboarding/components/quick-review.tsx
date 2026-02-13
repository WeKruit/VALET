import { Card, CardContent } from "@valet/ui/components/card";
import { Input } from "@valet/ui/components/input";
import { Button } from "@valet/ui/components/button";

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
  onConfirm: () => void;
}

export function QuickReview({ profile, onConfirm }: QuickReviewProps) {
  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="font-display text-xl font-semibold">
          Does this look right?
        </h2>
        <p className="text-sm text-[var(--wk-text-secondary)]">
          We'll use this to fill your applications.
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
                <Input value={profile.phone} readOnly className="mt-1 bg-[var(--wk-surface-sunken)]" />
              </div>
              <div>
                <label className="text-sm font-medium">Location</label>
                <Input value={profile.location} readOnly className="mt-1 bg-[var(--wk-surface-sunken)]" />
              </div>
            </div>
          </div>

          {/* Experience (collapsed) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--wk-text-secondary)]">
                Your Experience
              </h3>
              {/* TODO: Wire up edit functionality for experience details */}
            </div>
            <div className="space-y-1">
              {profile.experience.map((exp, i) => (
                <p key={i} className="text-sm">
                  {exp}
                </p>
              ))}
            </div>
            <p className="text-sm">{profile.education}</p>
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
        onClick={onConfirm}
      >
        Looks Good -- Let's Go
      </Button>
    </div>
  );
}
