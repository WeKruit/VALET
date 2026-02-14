import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@valet/ui/components/button";
import { Input } from "@valet/ui/components/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";

const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const resetMutation = api.auth.resetPassword.useMutation({
    onSuccess: () => {
      setSuccess(true);
    },
    onError: () => {
      toast.error("Failed to reset password. The link may have expired.");
    },
  });

  function onSubmit(data: ResetPasswordForm) {
    if (!token) return;
    resetMutation.mutate({ body: { token, password: data.password } });
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--wk-surface-page)]">
        <div className="mx-auto w-full max-w-sm space-y-8 px-4">
          <div className="rounded-[var(--wk-radius-2xl)] border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-white)] p-6 shadow-[var(--wk-shadow-md)]">
            <div className="space-y-4 text-center">
              <h2 className="text-lg font-semibold">Invalid link</h2>
              <p className="text-sm text-[var(--wk-text-secondary)]">
                This password reset link is invalid or has expired.
              </p>
              <Link
                to="/forgot-password"
                className="mt-4 inline-block text-sm font-medium text-[var(--wk-text-primary)] underline underline-offset-2 hover:text-[var(--wk-text-secondary)] transition-colors"
              >
                Request a new reset link
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--wk-surface-page)]">
        <div className="mx-auto w-full max-w-sm space-y-8 px-4">
          <div className="flex flex-col items-center space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-[var(--wk-radius-2xl)] bg-[var(--wk-text-primary)]">
              <span className="text-2xl font-bold text-[var(--wk-surface-page)]">V</span>
            </div>
          </div>
          <div className="rounded-[var(--wk-radius-2xl)] border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-white)] p-6 shadow-[var(--wk-shadow-md)]">
            <div className="space-y-4 text-center">
              <h2 className="text-lg font-semibold">Password reset</h2>
              <p className="text-sm text-[var(--wk-text-secondary)]">
                Your password has been reset successfully.
              </p>
              <Link
                to="/login"
                className="mt-4 inline-block text-sm font-medium text-[var(--wk-text-primary)] underline underline-offset-2 hover:text-[var(--wk-text-secondary)] transition-colors"
              >
                Sign in with your new password
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--wk-surface-page)]">
      <div className="mx-auto w-full max-w-sm space-y-8 px-4">
        {/* Logo */}
        <div className="flex flex-col items-center space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[var(--wk-radius-2xl)] bg-[var(--wk-text-primary)]">
            <span className="text-2xl font-bold text-[var(--wk-surface-page)]">V</span>
          </div>
          <div className="text-center">
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Reset password
            </h1>
            <p className="mt-2 text-sm text-[var(--wk-text-secondary)]">
              Enter your new password
            </p>
          </div>
        </div>

        {/* Reset password card */}
        <div className="rounded-[var(--wk-radius-2xl)] border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-white)] p-6 shadow-[var(--wk-shadow-md)]">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                New password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="Min. 8 characters"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-red-500">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirm new password
              </label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repeat your new password"
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && (
                <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>
              )}
            </div>

            {resetMutation.isError && (
              <p className="text-xs text-red-500">
                {(resetMutation.error as { body?: { message?: string } })?.body?.message ??
                  "Reset failed. The link may have expired."}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : null}
              {resetMutation.isPending ? "Resetting..." : "Reset password"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
