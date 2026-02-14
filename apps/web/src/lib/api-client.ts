/* global window */
import { initTsrReactQuery } from "@ts-rest/react-query/v5";
import { apiContract } from "@valet/contracts";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const TOKEN_KEY = "wk-access-token";

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// ─── Token Refresh ───

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      credentials: "include",
    });

    if (!res.ok) return false;

    const data = await res.json();
    setAccessToken(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deduplicated refresh: if multiple 401s fire at once,
 * only one refresh request is sent.
 */
function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = tryRefreshToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// ─── API Client ───

export const api = initTsrReactQuery(apiContract, {
  baseUrl: API_BASE_URL,
  baseHeaders: {},
  api: async (args) => {
    const token = getAccessToken();
    if (token) {
      args.headers = {
        ...args.headers,
        Authorization: `Bearer ${token}`,
      };
    }

    let body = args.body;
    let headers = args.headers as Record<string, string>;

    // Convert typed body to FormData for multipart requests
    if (
      args.contentType === "multipart/form-data" &&
      body &&
      typeof body === "object" &&
      !(body instanceof FormData)
    ) {
      const formData = new FormData();
      for (const [key, value] of Object.entries(body as unknown as Record<string, unknown>)) {
        if (value !== undefined && value !== null) {
          formData.append(key, value as Blob | string);
        }
      }
      body = formData;
      // Remove Content-Type so browser sets it with boundary
      const { "content-type": _, "Content-Type": __, ...rest } = headers;
      headers = rest;
    }

    const result = await fetch(args.path, {
      method: args.method,
      headers,
      body,
      credentials: "include",
    });

    // Auto-refresh on 401 (skip for auth endpoints to avoid loops)
    if (result.status === 401 && !args.path.includes("/auth/")) {
      const refreshed = await refreshOnce();
      if (refreshed) {
        // Retry the original request with the new token
        const newToken = getAccessToken();
        const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
        const retry = await fetch(args.path, {
          method: args.method,
          headers: retryHeaders,
          body,
          credentials: "include",
        });
        return {
          status: retry.status,
          body: retry.status === 204 ? undefined : await retry.json(),
          headers: retry.headers,
        };
      }

      // Refresh failed — clear auth state and redirect to login
      clearAccessToken();
      localStorage.removeItem("wk-auth");
      window.location.href = "/login";
    }

    return {
      status: result.status,
      body: result.status === 204 ? undefined : await result.json(),
      headers: result.headers,
    };
  },
});
