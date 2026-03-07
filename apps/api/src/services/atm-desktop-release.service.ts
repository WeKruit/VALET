import type { FastifyBaseLogger } from "fastify";

export interface AtmDesktopRelease {
  id: string;
  version: string;
  channel: "stable" | "beta";
  releaseUrl: string;
  publishedAt: string;
  assets: Record<string, string>;
}

export interface AtmDesktopRollout {
  channel: "stable" | "beta";
  baselineReleaseId: string | null;
  candidateReleaseId: string | null;
  rolloutPercent: number;
  minimumSupportedVersion: string | null;
  status: "idle" | "active" | "paused";
  updatedAt: string;
  baselineVersion: string | null;
  candidateVersion: string | null;
}

interface AtmDesktopReleaseResponse {
  releases: AtmDesktopRelease[];
  rollouts: AtmDesktopRollout[];
}

function getAtmBaseUrl(): string | null {
  const value = process.env.ATM_PUBLIC_URL ?? process.env.ATM_API_URL ?? null;
  return value ? value.replace(/\/+$/, "") : null;
}

export class AtmDesktopReleaseService {
  private readonly logger: FastifyBaseLogger;
  private readonly baseUrl: string | null;

  constructor({ logger }: { logger: FastifyBaseLogger }) {
    this.logger = logger;
    this.baseUrl = getAtmBaseUrl();
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl);
  }

  getBaseUrl(): string | null {
    return this.baseUrl;
  }

  async getReleaseState(channel?: "stable" | "beta"): Promise<AtmDesktopReleaseResponse | null> {
    if (!this.baseUrl) return null;
    const url = new URL("/desktop/releases", this.baseUrl);
    if (channel) {
      url.searchParams.set("channel", channel);
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        this.logger.warn(
          { status: response.status, url: url.toString() },
          "ATM desktop releases request failed",
        );
        return null;
      }
      return (await response.json()) as AtmDesktopReleaseResponse;
    } catch (error) {
      this.logger.warn({ err: error, url: url.toString() }, "ATM desktop releases request failed");
      return null;
    }
  }

  async getLatestRelease(channel: "stable" | "beta" = "stable"): Promise<AtmDesktopRelease | null> {
    if (!this.baseUrl) return null;
    const url = new URL("/desktop/releases/latest", this.baseUrl);
    url.searchParams.set("channel", channel);

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.status === 404) return null;
      if (!response.ok) {
        this.logger.warn(
          { status: response.status, url: url.toString() },
          "ATM latest desktop release request failed",
        );
        return null;
      }
      return (await response.json()) as AtmDesktopRelease;
    } catch (error) {
      this.logger.warn(
        { err: error, url: url.toString() },
        "ATM latest desktop release request failed",
      );
      return null;
    }
  }
}
