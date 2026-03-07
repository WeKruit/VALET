import type { FastifyBaseLogger } from "fastify";

export interface AnthropicProxyConfig {
  provider: "anthropic";
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  allowedModels: string[];
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5_000;

let cachedConfig: AnthropicProxyConfig | null = null;
let cacheExpiresAt = 0;
let inflightFetch: Promise<AnthropicProxyConfig> | null = null;

function getAtmBaseUrl(): string {
  const baseUrl = (process.env.ATM_BASE_URL || "").replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("ATM_BASE_URL is not configured");
  }
  return baseUrl;
}

function getAtmToken(): string {
  const token = process.env.VALET_ATM_TOKEN ?? process.env.ATM_SERVICE_TOKEN;
  if (!token) {
    throw new Error("VALET_ATM_TOKEN or ATM_SERVICE_TOKEN is not configured");
  }
  return token;
}

async function fetchFromAtm(logger: FastifyBaseLogger): Promise<AnthropicProxyConfig> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${getAtmBaseUrl()}/internal/llm-runtime-profiles/desktop-default`,
      {
        headers: {
          Authorization: `Bearer ${getAtmToken()}`,
        },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`ATM runtime config request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as Partial<AnthropicProxyConfig>;
    if (
      data.provider !== "anthropic" ||
      typeof data.baseUrl !== "string" ||
      typeof data.apiKey !== "string" ||
      typeof data.defaultModel !== "string" ||
      !Array.isArray(data.allowedModels)
    ) {
      throw new Error("ATM runtime config response is invalid");
    }

    return {
      provider: "anthropic",
      baseUrl: data.baseUrl,
      apiKey: data.apiKey,
      defaultModel: data.defaultModel,
      allowedModels: data.allowedModels.filter(
        (model): model is string => typeof model === "string" && model.trim().length > 0,
      ),
    };
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "Failed to refresh Anthropic proxy config from ATM",
    );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getAnthropicProxyConfig(
  logger: FastifyBaseLogger,
): Promise<AnthropicProxyConfig> {
  const now = Date.now();
  if (cachedConfig && now < cacheExpiresAt) {
    return cachedConfig;
  }

  if (!inflightFetch) {
    inflightFetch = fetchFromAtm(logger)
      .then((config) => {
        cachedConfig = config;
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
        return config;
      })
      .finally(() => {
        inflightFetch = null;
      });
  }

  return inflightFetch;
}

export async function getAnthropicProxyReadiness(
  logger: FastifyBaseLogger,
): Promise<{ llmRuntimeReady: boolean; message: string | null }> {
  try {
    await getAnthropicProxyConfig(logger);
    return { llmRuntimeReady: true, message: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Managed inference is unavailable";
    return { llmRuntimeReady: false, message };
  }
}

export function resetAnthropicProxyConfigCache(): void {
  cachedConfig = null;
  cacheExpiresAt = 0;
  inflightFetch = null;
}
