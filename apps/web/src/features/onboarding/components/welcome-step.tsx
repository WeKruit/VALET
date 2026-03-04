import { Card, CardContent } from "@valet/ui/components/card";
import { Button } from "@valet/ui/components/button";
import { Zap, HandHelping, MousePointerClick } from "lucide-react";

interface WelcomeStepProps {
  onContinue: () => void;
}

const AUTONOMY_CARDS = [
  {
    level: "Full Auto",
    tagline: "VALET handles everything",
    description:
      "VALET can log in, apply, handle verification codes, and submit applications without interrupting you. You review results after the fact.",
    icon: Zap,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    level: "Assisted",
    tagline: "VALET does most of the work",
    description:
      "VALET can log in and fill applications, but will pause and ask you when it hits a verification code or 2FA prompt.",
    icon: HandHelping,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    level: "Copilot",
    tagline: "You drive, VALET assists",
    description:
      "VALET fills in application fields using your profile, but you'll need to log in to each platform yourself and approve each submission.",
    icon: MousePointerClick,
    color: "text-gray-600",
    bg: "bg-gray-50",
  },
] as const;

export function WelcomeStep({ onContinue }: WelcomeStepProps) {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h2 className="font-display text-2xl font-semibold">VALET applies to jobs for you</h2>
        <p className="text-sm text-[var(--wk-text-secondary)] max-w-md mx-auto">
          The more information you provide during setup, the more VALET can do without interrupting
          you. You can always change this later.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {AUTONOMY_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.level}>
              <CardContent className="p-5 space-y-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-[var(--wk-radius-lg)] ${card.bg}`}
                >
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <div>
                  <h3 className="font-display text-sm font-semibold">{card.level}</h3>
                  <p className="text-xs text-[var(--wk-text-secondary)] mt-0.5">{card.tagline}</p>
                </div>
                <p className="text-xs text-[var(--wk-text-tertiary)] leading-relaxed">
                  {card.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-center">
        <Button variant="cta" size="lg" onClick={onContinue}>
          Let's Get Set Up
        </Button>
      </div>
    </div>
  );
}
