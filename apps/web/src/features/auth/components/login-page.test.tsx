import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import { LoginPage } from "./login-page";

// Mock react-router-dom navigation
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom"
  );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]),
  };
});

// Mock the api client
const mockGoogleMutate = vi.fn();
vi.mock("@/lib/api-client", () => ({
  api: {
    auth: {
      google: {
        useMutation: (opts?: any) => ({
          mutate: mockGoogleMutate,
          isPending: false,
        }),
      },
    },
  },
  setAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
  API_BASE_URL: "http://localhost:8000",
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

  it("navigates to onboarding when Google client ID is not set", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(
      screen.getByRole("button", { name: /sign in with google/i })
    );

    // Without GOOGLE_CLIENT_ID, should fallback to direct navigation
    expect(mockNavigate).toHaveBeenCalledWith("/onboarding");
  });

  it("calls google auth mutation when code is in URL params", async () => {
    const searchParams = new URLSearchParams("?code=test-auth-code");
    vi.mocked(useSearchParams).mockReturnValue([searchParams, vi.fn()]);

    renderLoginPage();

    expect(mockGoogleMutate).toHaveBeenCalledWith({
      body: {
        code: "test-auth-code",
        redirectUri: expect.stringContaining("/login"),
      },
    });
  });

  it("does not call google auth when no code in URL", () => {
    vi.mocked(useSearchParams).mockReturnValue([
      new URLSearchParams(),
      vi.fn(),
    ]);

    renderLoginPage();

    expect(mockGoogleMutate).not.toHaveBeenCalled();
  });

  it("renders the V logo", () => {
    renderLoginPage();
    expect(screen.getByText("V")).toBeInTheDocument();
  });
});
