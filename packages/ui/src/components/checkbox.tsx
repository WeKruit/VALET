import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "../lib/utils";

const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0",
      "rounded-[var(--wk-radius-sm)]",
      "border border-[var(--wk-border-strong)]",
      "ring-offset-background",
      "transition-colors duration-[var(--wk-duration-fast)] ease-[var(--wk-ease-default)]",
      "hover:border-[var(--wk-text-primary)]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wk-border-strong)] focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:bg-[var(--wk-text-primary)] data-[state=checked]:text-[var(--wk-surface-page)] data-[state=checked]:border-[var(--wk-text-primary)]",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("flex items-center justify-center text-current")}
    >
      <Check className="h-3.5 w-3.5" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
