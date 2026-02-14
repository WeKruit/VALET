import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "../lib/utils";

const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center",
      "rounded-[var(--wk-radius-full)]",
      "border-2 border-transparent",
      "ring-offset-background",
      "transition-colors duration-[var(--wk-duration-fast)] ease-[var(--wk-ease-default)]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wk-border-strong)] focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:bg-[var(--wk-text-primary)]",
      "data-[state=unchecked]:bg-[var(--wk-surface-sunken)]",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5",
        "rounded-[var(--wk-radius-full)]",
        "bg-[var(--wk-surface-white)]",
        "shadow-[var(--wk-shadow-sm)]",
        "ring-0",
        "transition-transform duration-[var(--wk-duration-fast)] ease-[var(--wk-ease-default)]",
        "data-[state=checked]:translate-x-5",
        "data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
