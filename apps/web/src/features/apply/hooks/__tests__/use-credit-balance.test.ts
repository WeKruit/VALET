import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock api client ──

let mockQueryReturn: {
  data: { status: number; body: Record<string, unknown> } | undefined;
  isLoading: boolean;
};

vi.mock("@/lib/api-client", () => ({
  api: {
    credits: {
      getBalance: {
        useQuery: (_opts?: unknown) => mockQueryReturn,
      },
    },
  },
}));

// Import after mock is set up
import { useCreditBalance } from "../use-credit-balance";

// Minimal renderHook implementation using the hook directly
// (vitest + jsdom environment is set up in vitest.config.ts)
import { renderHook } from "@testing-library/react";

describe("useCreditBalance", () => {
  beforeEach(() => {
    mockQueryReturn = {
      data: undefined,
      isLoading: true,
    };
  });

  it("returns loading state with defaults", () => {
    const { result } = renderHook(() => useCreditBalance());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.balance).toBe(0);
    expect(result.current.trialExpiry).toBeNull();
    expect(result.current.enforcementEnabled).toBe(false);
  });

  it("returns balance data when enforcement is off (informational)", () => {
    mockQueryReturn = {
      data: {
        status: 200,
        body: {
          balance: 42,
          trialExpiry: "2026-04-01T00:00:00Z",
          enforcementEnabled: false,
        },
      },
      isLoading: false,
    };

    const { result } = renderHook(() => useCreditBalance());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.balance).toBe(42);
    expect(result.current.trialExpiry).toBe("2026-04-01T00:00:00Z");
    expect(result.current.enforcementEnabled).toBe(false);
  });

  it("returns enforcement on with sufficient balance", () => {
    mockQueryReturn = {
      data: {
        status: 200,
        body: {
          balance: 10,
          trialExpiry: null,
          enforcementEnabled: true,
        },
      },
      isLoading: false,
    };

    const { result } = renderHook(() => useCreditBalance());

    expect(result.current.enforcementEnabled).toBe(true);
    expect(result.current.balance).toBe(10);
  });

  it("returns enforcement on with insufficient balance (zero)", () => {
    mockQueryReturn = {
      data: {
        status: 200,
        body: {
          balance: 0,
          trialExpiry: null,
          enforcementEnabled: true,
        },
      },
      isLoading: false,
    };

    const { result } = renderHook(() => useCreditBalance());

    expect(result.current.enforcementEnabled).toBe(true);
    expect(result.current.balance).toBe(0);
  });

  it("returns defaults when API returns non-200", () => {
    mockQueryReturn = {
      data: {
        status: 401,
        body: {},
      },
      isLoading: false,
    };

    const { result } = renderHook(() => useCreditBalance());

    expect(result.current.balance).toBe(0);
    expect(result.current.enforcementEnabled).toBe(false);
  });
});
