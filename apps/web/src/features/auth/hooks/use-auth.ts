import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api, getAccessToken, clearAccessToken, API_BASE_URL } from "@/lib/api-client";

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  role?: "waitlist" | "beta" | "user" | "developer" | "admin" | "superadmin";
  subscriptionTier?: "free" | "starter" | "pro" | "enterprise";
  onboardingComplete?: boolean;
  copilotAppsCompleted?: number;
  autopilotUnlocked?: boolean;
  creditBalance?: number;
}

interface AuthStore {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

function clearLocalAuthState() {
  clearAccessToken();
  // Clear user-scoped onboarding keys (keyed by userId, so clean all matching)
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith("valet:onboarding:")) {
      localStorage.removeItem(key);
    }
  }
  localStorage.removeItem("wk-auth");
  window.location.href = "/login";
}

export const useAuth = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isLoading: false,
      setUser: (user) => set({ user }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () => {
        const accessToken = getAccessToken();
        set({ user: null });

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (accessToken) {
          headers["Authorization"] = `Bearer ${accessToken}`;
        }
        // Fire-and-forget: call logout API (cookie sent automatically)
        fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
          method: "POST",
          headers,
          body: JSON.stringify({}),
          credentials: "include",
        }).finally(() => {
          clearLocalAuthState();
        });
      },
    }),
    { name: "wk-auth" },
  ),
);

/**
 * Hook to fetch the current user from the API.
 * Uses the ts-rest auth.me contract endpoint.
 */
export function useCurrentUser() {
  return api.auth.me.useQuery({
    queryKey: ["auth", "me"],
    queryData: {},
    retry: false,
    staleTime: 30_000,
  });
}
