import { basicLogger, init, type LDClient, type LDContext } from "@launchdarkly/node-server-sdk";
import type { FastifyBaseLogger } from "fastify";

export type LaunchDarklyEnvironment = "test" | "staging" | "production";

function resolveEnvironment(): LaunchDarklyEnvironment {
  const raw = (process.env.VALET_ENVIRONMENT ?? process.env.NODE_ENV ?? "test").toLowerCase();
  if (raw === "staging") return "staging";
  if (raw === "production" || raw === "prod") return "production";
  return "test";
}

function resolveServerSdkKey(environment: LaunchDarklyEnvironment): string {
  if (environment === "production") {
    return process.env.LD_SERVER_SDK_KEY_PRODUCTION ?? "";
  }
  if (environment === "staging") {
    return process.env.LD_SERVER_SDK_KEY_STAGING ?? "";
  }
  return process.env.LD_SERVER_SDK_KEY_TEST ?? "";
}

export class LaunchDarklyService {
  private readonly logger: FastifyBaseLogger;
  private readonly environment: LaunchDarklyEnvironment;
  private readonly sdkKey: string;
  private readonly client: LDClient | null;
  private readonly initialization: Promise<void>;

  constructor({ logger }: { logger: FastifyBaseLogger }) {
    this.logger = logger;
    this.environment = resolveEnvironment();
    this.sdkKey = resolveServerSdkKey(this.environment);

    if (!this.sdkKey) {
      this.client = null;
      this.initialization = Promise.resolve();
      this.logger.warn(
        { environment: this.environment },
        "LaunchDarkly server SDK key missing; backend flag evaluation disabled",
      );
      return;
    }

    this.client = init(this.sdkKey, {
      application: {
        id: "valet-api",
        version: process.env.npm_package_version ?? "0.0.0",
      },
      logger: basicLogger({
        destination: (line) => this.logger.info({ scope: "launchdarkly" }, line),
        level: process.env.LD_LOG_LEVEL === "debug" ? "debug" : "warn",
      }),
    });

    this.initialization = this.client
      .waitForInitialization({ timeout: 5 })
      .then(() => {
        this.logger.info({ environment: this.environment }, "LaunchDarkly server SDK initialized");
      })
      .catch((error) => {
        this.logger.warn(
          { environment: this.environment, err: error },
          "LaunchDarkly initialization timed out; using fallbacks until the SDK is ready",
        );
      });
  }

  getEnvironment(): LaunchDarklyEnvironment {
    return this.environment;
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  buildUserContext(input: {
    key: string;
    email?: string | null;
    role?: string | null;
    isAdmin?: boolean;
    channel?: string;
    appVersion?: string;
    platform?: string;
    arch?: string;
  }): LDContext {
    return {
      kind: "user",
      key: input.key,
      email: input.email ?? undefined,
      role: input.role ?? undefined,
      isAdmin: input.isAdmin ?? false,
      environment: this.environment,
      channel: input.channel ?? undefined,
      appVersion: input.appVersion ?? undefined,
      platform: input.platform ?? undefined,
      arch: input.arch ?? undefined,
    };
  }

  buildServiceContext(input: { key: string; channel?: string }): LDContext {
    return {
      kind: "service",
      key: input.key,
      environment: this.environment,
      channel: input.channel ?? undefined,
    };
  }

  async boolVariation(flagKey: string, context: LDContext, fallback: boolean): Promise<boolean> {
    if (!this.client) return fallback;
    await this.initialization;
    try {
      return await this.client.variation(flagKey, context, fallback);
    } catch (error) {
      this.logger.warn({ err: error, flagKey }, "LaunchDarkly bool variation failed");
      return fallback;
    }
  }

  async jsonVariation<T>(flagKey: string, context: LDContext, fallback: T): Promise<T> {
    if (!this.client) return fallback;
    await this.initialization;
    try {
      return (await this.client.variation(flagKey, context, fallback)) as T;
    } catch (error) {
      this.logger.warn({ err: error, flagKey }, "LaunchDarkly json variation failed");
      return fallback;
    }
  }

  close(): void {
    this.client?.close();
  }
}
