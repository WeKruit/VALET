/**
 * 3-tier LLM model router.
 *
 * Routes requests to the appropriate model based on task type:
 * - Primary (complex): Claude Sonnet 4.5 -> form_analysis, answer_generation, screenshot_analysis
 * - Secondary (routine): GPT-4.1 mini -> field_mapping, error_recovery
 * - Budget (trivial): GPT-4.1 nano -> confirmation, navigation
 *
 * Fallback chain: primary fails -> secondary -> budget -> error
 */
import type {
  ILLMProvider,
  LLMRequest,
  LLMResponse,
  ModelConfig,
  TaskType,
  TokenUsage,
} from "./providers/base.js";
import { MODEL_PRICING } from "./providers/base.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { OpenAIProvider } from "./providers/openai.js";

export interface LLMRouterConfig {
  anthropicApiKey: string;
  openaiApiKey: string;
  /** Override default routing table */
  routingOverrides?: Partial<Record<TaskType, ModelConfig>>;
  /** Called after every LLM request for observability */
  onUsage?: (taskType: TaskType, usage: TokenUsage, model: string) => void;
}

/** Default 3-tier routing table */
const DEFAULT_ROUTING: Record<TaskType, ModelConfig> = {
  // Primary tier: Claude Sonnet 4.5 for complex reasoning
  form_analysis: {
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250929",
    costPerInputToken: MODEL_PRICING["claude-sonnet-4-5-20250929"]!.input,
    costPerOutputToken: MODEL_PRICING["claude-sonnet-4-5-20250929"]!.output,
  },
  answer_generation: {
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250929",
    costPerInputToken: MODEL_PRICING["claude-sonnet-4-5-20250929"]!.input,
    costPerOutputToken: MODEL_PRICING["claude-sonnet-4-5-20250929"]!.output,
  },
  screenshot_analysis: {
    provider: "anthropic",
    model: "claude-sonnet-4-5-20250929",
    costPerInputToken: MODEL_PRICING["claude-sonnet-4-5-20250929"]!.input,
    costPerOutputToken: MODEL_PRICING["claude-sonnet-4-5-20250929"]!.output,
  },

  // Secondary tier: GPT-4.1 mini for routine tasks
  field_mapping: {
    provider: "openai",
    model: "gpt-4.1-mini",
    costPerInputToken: MODEL_PRICING["gpt-4.1-mini"]!.input,
    costPerOutputToken: MODEL_PRICING["gpt-4.1-mini"]!.output,
  },
  error_recovery: {
    provider: "openai",
    model: "gpt-4.1-mini",
    costPerInputToken: MODEL_PRICING["gpt-4.1-mini"]!.input,
    costPerOutputToken: MODEL_PRICING["gpt-4.1-mini"]!.output,
  },

  // Budget tier: GPT-4.1 nano for trivial tasks
  confirmation: {
    provider: "openai",
    model: "gpt-4.1-nano",
    costPerInputToken: MODEL_PRICING["gpt-4.1-nano"]!.input,
    costPerOutputToken: MODEL_PRICING["gpt-4.1-nano"]!.output,
  },
  navigation: {
    provider: "openai",
    model: "gpt-4.1-nano",
    costPerInputToken: MODEL_PRICING["gpt-4.1-nano"]!.input,
    costPerOutputToken: MODEL_PRICING["gpt-4.1-nano"]!.output,
  },
};

/** Fallback chain: primary -> secondary -> budget */
const FALLBACK_CHAIN: ModelConfig[] = [
  DEFAULT_ROUTING.form_analysis,
  DEFAULT_ROUTING.field_mapping,
  DEFAULT_ROUTING.confirmation,
];

export class LLMRouter {
  private providers: Map<string, ILLMProvider>;
  private routing: Record<TaskType, ModelConfig>;
  private onUsage?: LLMRouterConfig["onUsage"];

  constructor(config: LLMRouterConfig) {
    this.providers = new Map<string, ILLMProvider>([
      [
        "anthropic",
        new AnthropicProvider({ apiKey: config.anthropicApiKey }),
      ],
      [
        "openai",
        new OpenAIProvider({ apiKey: config.openaiApiKey }),
      ],
    ]);

    this.routing = { ...DEFAULT_ROUTING, ...config.routingOverrides };
    this.onUsage = config.onUsage;
  }

  /**
   * Route a request to the appropriate model based on task type.
   * Automatically falls back through the tier chain on 5xx errors.
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const primaryModel = this.routing[request.taskType];
    const fallbacks = this.getFallbackChain(primaryModel);

    let lastError: Error | undefined;

    for (const modelConfig of [primaryModel, ...fallbacks]) {
      const provider = this.providers.get(modelConfig.provider);
      if (!provider) {
        continue;
      }

      try {
        const response = await provider.complete(
          modelConfig.model,
          request.messages,
          {
            temperature: request.temperature,
            maxTokens: request.maxTokens,
            responseFormat: request.responseFormat,
          },
        );

        this.onUsage?.(request.taskType, response.usage, modelConfig.model);
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (!isRetryableError(error)) {
          throw lastError;
        }
        // Fall through to next model in chain
      }
    }

    throw lastError ?? new Error("All LLM providers failed");
  }

  /** Get the model config for a given task type (useful for budget estimation) */
  getModelForTask(taskType: TaskType): ModelConfig {
    return this.routing[taskType];
  }

  /** Get all registered providers */
  getProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  private getFallbackChain(primary: ModelConfig): ModelConfig[] {
    return FALLBACK_CHAIN.filter(
      (m) => m.model !== primary.model,
    );
  }
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Retry on 5xx, rate limits, timeouts
    return (
      message.includes("500") ||
      message.includes("502") ||
      message.includes("503") ||
      message.includes("529") ||
      message.includes("rate") ||
      message.includes("timeout") ||
      message.includes("overloaded")
    );
  }
  return false;
}
