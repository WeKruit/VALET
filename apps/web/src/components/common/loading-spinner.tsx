import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  className?: string;
  size?: "sm" | "default" | "lg";
}

export function LoadingSpinner({
  className,
  size = "default",
}: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "animate-spin rounded-full border-2 border-[var(--wk-border-default)] border-t-[var(--wk-text-primary)]",
        size === "sm" && "h-4 w-4",
        size === "default" && "h-6 w-6",
        size === "lg" && "h-10 w-10",
        className
      )}
    >
      <span className="sr-only">Loading</span>
    </div>
  );
}
