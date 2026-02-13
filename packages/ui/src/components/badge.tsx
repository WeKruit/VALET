import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const badgeVariants = cva(
  [
    "inline-flex items-center",
    "rounded-[var(--wk-radius-full)]",
    "px-2.5 py-0.5",
    "text-xs font-medium",
    "transition-colors duration-[var(--wk-duration-fast)] ease-[var(--wk-ease-default)]",
  ],
  {
    variants: {
      variant: {
        default: "bg-[var(--wk-surface-raised)] text-[var(--wk-text-primary)] border border-[var(--wk-border-subtle)]",
        secondary: "bg-[var(--wk-surface-sunken)] text-[var(--wk-text-secondary)]",
        success: "bg-[color-mix(in_srgb,var(--wk-status-success)_12%,transparent)] text-[var(--wk-status-success)] border border-[color-mix(in_srgb,var(--wk-status-success)_20%,transparent)]",
        warning: "bg-[color-mix(in_srgb,var(--wk-status-warning)_12%,transparent)] text-[var(--wk-status-warning)] border border-[color-mix(in_srgb,var(--wk-status-warning)_20%,transparent)]",
        error: "bg-[color-mix(in_srgb,var(--wk-status-error)_12%,transparent)] text-[var(--wk-status-error)] border border-[color-mix(in_srgb,var(--wk-status-error)_20%,transparent)]",
        info: "bg-[color-mix(in_srgb,var(--wk-status-info)_12%,transparent)] text-[var(--wk-status-info)] border border-[color-mix(in_srgb,var(--wk-status-info)_20%,transparent)]",
        copilot: "bg-[color-mix(in_srgb,var(--wk-copilot)_12%,transparent)] text-[var(--wk-copilot)] border border-[color-mix(in_srgb,var(--wk-copilot)_20%,transparent)]",
        autopilot: "bg-[color-mix(in_srgb,var(--wk-autopilot)_12%,transparent)] text-[var(--wk-autopilot)] border border-[color-mix(in_srgb,var(--wk-autopilot)_20%,transparent)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
