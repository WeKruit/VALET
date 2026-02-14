import * as React from "react";
import { cn } from "../lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse",
        "rounded-[var(--wk-radius-md)]",
        "bg-[var(--wk-surface-sunken)]",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
