import { Zap, Scale, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type QualityPreset = "speed" | "balanced" | "quality";

interface QualitySelectorProps {
  value: QualityPreset;
  onChange: (value: QualityPreset) => void;
  compact?: boolean;
}

const PRESETS: Array<{
  id: QualityPreset;
  name: string;
  description: string;
  icon: typeof Zap;
  accentClass: string;
  iconColor: string;
}> = [
  {
    id: "speed",
    name: "Speed",
    description: "Fastest. Uses lighter models for quick applications.",
    icon: Zap,
    accentClass: "border-amber-400 bg-amber-50",
    iconColor: "text-amber-500",
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "Best mix of speed and accuracy for most jobs.",
    icon: Scale,
    accentClass: "border-blue-400 bg-blue-50",
    iconColor: "text-blue-500",
  },
  {
    id: "quality",
    name: "Quality",
    description: "Most thorough. Uses top models for complex applications.",
    icon: Sparkles,
    accentClass: "border-purple-400 bg-purple-50",
    iconColor: "text-purple-500",
  },
];

export function QualitySelector({ value, onChange, compact }: QualitySelectorProps) {
  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-3")}>
      {PRESETS.map((preset) => {
        const isSelected = value === preset.id;
        const Icon = preset.icon;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(preset.id)}
            className={cn(
              "relative flex flex-col items-start gap-1 rounded-[var(--wk-radius-lg)] border-2 text-left transition-all duration-150 cursor-pointer",
              compact ? "p-2" : "p-3",
              isSelected
                ? preset.accentClass
                : "border-[var(--wk-border-default)] bg-[var(--wk-surface-default)] hover:bg-[var(--wk-surface-raised)] hover:border-[var(--wk-border-hover)]",
            )}
          >
            <div className="flex items-center gap-2">
              <Icon
                className={cn(
                  "h-4 w-4",
                  isSelected ? preset.iconColor : "text-[var(--wk-text-tertiary)]",
                )}
              />
              <span
                className={cn(
                  "text-sm font-medium",
                  isSelected ? "text-[var(--wk-text-primary)]" : "text-[var(--wk-text-secondary)]",
                )}
              >
                {preset.name}
              </span>
            </div>
            {!compact && (
              <p className="text-xs text-[var(--wk-text-tertiary)] leading-relaxed">
                {preset.description}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
