import * as React from "react";
import { cn } from "../lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full",
        "bg-[var(--wk-surface-white)] text-[var(--wk-text-primary)]",
        "rounded-[var(--wk-radius-md)]",
        "border border-[var(--wk-border-default)]",
        "px-3 py-2 text-sm",
        "ring-offset-background",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "placeholder:text-[var(--wk-text-tertiary)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wk-border-strong)] focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "transition-colors duration-[var(--wk-duration-fast)] ease-[var(--wk-ease-default)]",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
