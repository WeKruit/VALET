import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@valet/ui/components/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, setAccessToken } from "@/lib/api-client";
import { useAuth } from "../hooks/use-auth";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const REDIRECT_URI = `${window.location.origin}/login`;

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setUser } = useAuth();

  const googleAuth = api.auth.google.useMutation({
    onSuccess: (data) => {
      if (data.status === 200 || data.status === 201) {
        setAccessToken(data.body.accessToken);
        localStorage.setItem("wk-refresh-token", data.body.refreshToken);
        setUser({
          id: data.body.user.id,
          email: data.body.user.email,
          name: data.body.user.name,
          avatarUrl: data.body.user.avatarUrl ?? undefined,
          onboardingComplete: false,
          copilotAppsCompleted: 0,
          autopilotUnlocked: false,
        });
        navigate("/onboarding");
      }
    },
    onError: () => {
      toast.error("Sign-in failed. Please try again.");
    },
  });

  useEffect(() => {
    const code = searchParams.get("code");
    if (code) {
      googleAuth.mutate({
        body: { code, redirectUri: REDIRECT_URI },
      });
    }
  }, [searchParams]);

  const [isRedirecting, setIsRedirecting] = useState(false);

  function handleGoogleLogin() {
    if (!GOOGLE_CLIENT_ID) {
      toast.error("Google OAuth is not configured. Set VITE_GOOGLE_CLIENT_ID.");
      return;
    }
    setIsRedirecting(true);
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  const isLoading = googleAuth.isPending || isRedirecting;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--wk-surface-page)]">
      <div className="mx-auto w-full max-w-sm space-y-8 px-4">
        {/* Logo */}
        <div className="flex flex-col items-center space-y-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[var(--wk-radius-2xl)] bg-[var(--wk-text-primary)]">
            <span className="text-2xl font-bold text-[var(--wk-surface-page)]">
              V
            </span>
          </div>
          <div className="text-center">
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              WeKruit Valet
            </h1>
            <p className="mt-2 text-sm text-[var(--wk-text-secondary)]">
              Verified Automation. Limitless Execution. Trust.
            </p>
          </div>
        </div>

        {/* Login card */}
        <div className="rounded-[var(--wk-radius-2xl)] border border-[var(--wk-border-subtle)] bg-[var(--wk-surface-white)] p-6 shadow-[var(--wk-shadow-md)]">
          <div className="space-y-4">
            <div className="text-center">
              <h2 className="text-lg font-semibold">Welcome back</h2>
              <p className="mt-1 text-sm text-[var(--wk-text-secondary)]">
                Sign in to manage your applications
              </p>
            </div>

            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={handleGoogleLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              )}
              {isLoading ? "Signing in..." : "Sign in with Google"}
            </Button>
          </div>

          <p className="mt-4 text-center text-xs text-[var(--wk-text-tertiary)]">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>

        {/* Trust signals */}
        <div className="flex justify-center gap-4 text-xs text-[var(--wk-text-tertiary)]">
          <span>AES-256 encrypted</span>
          <span>SOC 2 compliant</span>
          <span>GDPR ready</span>
        </div>
      </div>
    </div>
  );
}
