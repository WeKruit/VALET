import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type * as ReactRouterDom from "react-router-dom";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "./login-page";

// Mock react-router-dom navigation
const mockNavigate = vi.fn();
const defaultSearchParams = new URLSearchParams();
let currentSearchParams = defaultSearchParams;

vi.mock("react-router-dom", async () => {
  const actual =
    await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [currentSearchParams, vi.fn()],
  };
});

// Mock the api client
const mockGoogleMutate = vi.fn();
const mockLoginMutate = vi.fn();
vi.mock("@/lib/api-client", () => ({
  api: {
    auth: {
      google: {
        useMutation: (_opts?: any) => ({
          mutate: mockGoogleMutate,
          isPending: false,
        }),
      },
      login: {
        useMutation: (_opts?: any) => ({
          mutate: mockLoginMutate,
          isPending: false,
          isError: false,
          error: null,
        }),
      },
    },
  },
  setAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
  API_BASE_URL: "http://localhost:8000",
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock auth store
vi.mock("../hooks/use-auth", () => ({
  useAuth: () => ({
    setUser: vi.fn(),
  }),
}));

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSearchParams = defaultSearchParams;
  });

  it("renders the app name and tagline", () => {
    renderLoginPage();
    expect(screen.getByText("WeKruit Valet")).toBeInTheDocument();
    expect(
      screen.getByText("Verified Automation. Limitless Execution. Trust.")
    ).toBeInTheDocument();
  });

  it("renders the Google sign-in button", () => {
    renderLoginPage();
    expect(
      screen.getByRole("button", { name: /sign in with google/i })
    ).toBeInTheDocument();
  });

  it("renders trust signals", () => {
    renderLoginPage();
    expect(screen.getByText("AES-256 encrypted")).toBeInTheDocument();
    expect(screen.getByText("SOC 2 compliant")).toBeInTheDocument();
    expect(screen.getByText("GDPR ready")).toBeInTheDocument();
  });

  it("renders the welcome heading", () => {
    renderLoginPage();
    expect(screen.getByText("Welcome back")).toBeInTheDocument();
    expect(
      screen.getByText("Sign in to manage your applications")
    ).toBeInTheDocument();
  });

  it("renders the ToS notice", () => {
    renderLoginPage();
    expect(
      screen.getByText(/by signing in, you agree to our/i)
    ).toBeInTheDocument();
  });

  it("shows error toast when Google client ID is not set", async () => {
    // GOOGLE_CLIENT_ID is evaluated at module load time from import.meta.env.
    // When VITE_GOOGLE_CLIENT_ID is set (e.g. from root .env), the toast is never called.
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (clientId) {
      // Skip: env var is set, so the guard path won't execute
      return;
    }

    const { toast } = await import("sonner");
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(
      screen.getByRole("button", { name: /sign in with google/i })
    );

    expect(toast.error).toHaveBeenCalledWith(
      "Google OAuth is not configured. Set VITE_GOOGLE_CLIENT_ID."
    );
  });

  it("calls google auth mutation when code is in URL params", () => {
    currentSearchParams = new URLSearchParams("?code=test-auth-code");

    renderLoginPage();

    expect(mockGoogleMutate).toHaveBeenCalledWith({
      body: {
        code: "test-auth-code",
        redirectUri: expect.stringContaining("/login"),
      },
    });
  });

  it("does not call google auth when no code in URL", () => {
    currentSearchParams = new URLSearchParams();

    renderLoginPage();

    expect(mockGoogleMutate).not.toHaveBeenCalled();
  });

  it("renders the V logo", () => {
    renderLoginPage();
    expect(screen.getByText("V")).toBeInTheDocument();
  });
});
