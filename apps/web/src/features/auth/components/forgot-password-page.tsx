import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@valet/ui/components/button";
import { Input } from "@valet/ui/components/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const forgotMutation = api.auth.forgotPassword.useMutation({
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: () => {
      toast.error("Something went wrong. Please try again.");
    },
  });

  function onSubmit(data: ForgotPasswordForm) {
    forgotMutation.mutate({ body: { email: data.email } });
  }

  if (submitted) {
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
              <h2 className="text-lg font-semibold">Check your email</h2>
              <p className="text-sm text-[var(--wk-text-secondary)]">
                If an account exists with that email, we sent a password reset link. Please check your inbox.
              </p>
              <Link
                to="/login"
                className="mt-4 inline-block text-sm font-medium text-[var(--wk-text-primary)] underline underline-offset-2 hover:text-[var(--wk-text-secondary)] transition-colors"
              >
                Back to login
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
              Forgot password
            </h1>
            <p className="mt-2 text-sm text-[var(--wk-text-secondary)]">
              Enter your email and we'll send you a reset link
            </p>
          </div>
        </div>

        {/* Forgot password card */}
        <div className="rounded-[var(--wk-radius-2xl)] border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-white)] p-6 shadow-[var(--wk-shadow-md)]">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={forgotMutation.isPending}
            >
              {forgotMutation.isPending ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : null}
              {forgotMutation.isPending ? "Sending..." : "Send reset link"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-[var(--wk-text-secondary)]">
            Remember your password?{" "}
            <Link
              to="/login"
              className="font-medium text-[var(--wk-text-primary)] underline underline-offset-2 hover:text-[var(--wk-text-secondary)] transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
