import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api, clearAccessToken } from "@/lib/api-client";

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  onboardingComplete: boolean;
  copilotAppsCompleted: number;
  autopilotUnlocked: boolean;
}

interface AuthStore {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuth = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isLoading: false,
      setUser: (user) => set({ user }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () => {
        set({ user: null });
        clearAccessToken();
        localStorage.removeItem("wk-refresh-token");
        window.location.href = "/login";
      },
    }),
    { name: "wk-auth" }
  )
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
    staleTime: 1000 * 60 * 5,
  });
}
