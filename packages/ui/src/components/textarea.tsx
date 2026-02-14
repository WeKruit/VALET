import * as React from "react";
import { cn } from "../lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full",
        "bg-[var(--wk-surface-sunken)] text-[var(--wk-text-primary)]",
        "rounded-[var(--wk-radius-md)]",
        "border border-[var(--wk-border-default)]",
        "px-3 py-2 text-sm",
        "ring-offset-background",
        "placeholder:text-[var(--wk-text-tertiary)]",
        "hover:border-[var(--wk-border-strong)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wk-accent-amber)] focus-visible:border-[var(--wk-accent-amber)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--wk-surface-page)]",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--wk-border-default)]",
        "transition-colors duration-[var(--wk-duration-fast)] ease-[var(--wk-ease-default)]",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
