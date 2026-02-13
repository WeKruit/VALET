import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2",
    "font-body font-medium whitespace-nowrap",
    "border-none cursor-pointer no-underline",
    "transition-all duration-[var(--wk-duration-base)] ease-[var(--wk-ease-default)]",
    "disabled:pointer-events-none disabled:opacity-50",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-[var(--wk-text-primary)] text-[var(--wk-surface-page)]",
          "rounded-[var(--wk-radius-lg)]",
          "hover:opacity-[0.88] hover:shadow-[var(--wk-shadow-md)]",
        ],
        secondary: [
          "bg-[var(--wk-surface-white)] text-[var(--wk-text-primary)]",
          "rounded-[var(--wk-radius-lg)]",
          "border border-[var(--wk-border-default)]",
          "hover:bg-[var(--wk-surface-raised)] hover:border-[var(--wk-border-strong)]",
        ],
        ghost: [
          "bg-transparent text-[var(--wk-text-primary)]",
          "rounded-[var(--wk-radius-lg)]",
          "hover:bg-[var(--wk-surface-sunken)]",
        ],
        cta: [
          "bg-[var(--wk-text-primary)] text-[var(--wk-surface-page)]",
          "rounded-[var(--wk-radius-lg)]",
          "font-semibold",
          "hover:opacity-[0.88] hover:shadow-[var(--wk-shadow-lg)]",
        ],
        destructive: [
          "bg-[var(--wk-status-error)] text-[var(--wk-text-inverse)]",
          "rounded-[var(--wk-radius-lg)]",
          "hover:opacity-90",
        ],
        link: [
          "text-[var(--wk-text-primary)] underline-offset-4",
          "hover:underline",
        ],
      },
      size: {
        sm: "px-3.5 py-1.5 text-xs rounded-[var(--wk-radius-md)]",
        default: "px-6 py-2.5 text-sm",
        lg: "px-8 py-3.5 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
