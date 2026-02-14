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

const registerSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const registerMutation = api.auth.register.useMutation({
    onSuccess: (data) => {
      if (data.status === 201) {
        setSubmitted(true);
      }
    },
    onError: () => {
      toast.error("Registration failed. Please try again.");
    },
  });

  function onSubmit(data: RegisterForm) {
    registerMutation.mutate({
      body: { email: data.email, password: data.password, name: data.name },
    });
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
                We sent a verification link to your email address. Please click the link to activate your account.
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
              Create account
            </h1>
            <p className="mt-2 text-sm text-[var(--wk-text-secondary)]">
              Get started with WeKruit Valet
            </p>
          </div>
        </div>

        {/* Register card */}
        <div className="rounded-[var(--wk-radius-2xl)] border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-white)] p-6 shadow-[var(--wk-shadow-md)]">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Full name
              </label>
              <Input
                id="name"
                type="text"
                placeholder="Jane Smith"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-red-500">{errors.name.message}</p>
              )}
            </div>

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

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
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
                Confirm password
              </label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repeat your password"
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && (
                <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>
              )}
            </div>

            {registerMutation.isError && (
              <p className="text-xs text-red-500">
                {(registerMutation.error as { body?: { message?: string } })?.body?.message ??
                  "Registration failed. Please try again."}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : null}
              {registerMutation.isPending ? "Creating account..." : "Create account"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-[var(--wk-text-secondary)]">
            Already have an account?{" "}
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
