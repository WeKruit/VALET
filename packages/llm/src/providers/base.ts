/**
 * Unified LLM provider interface and shared types.
 */

export type TaskType =
  | "form_analysis"
  | "answer_generation"
  | "screenshot_analysis"
  | "field_mapping"
  | "error_recovery"
  | "confirmation"
  | "navigation";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  taskType: TaskType;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json";
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: string;
  usage: TokenUsage;
  cached: boolean;
  durationMs: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface ModelConfig {
  provider: "anthropic" | "openai";
  model: string;
  costPerInputToken: number;
  costPerOutputToken: number;
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * Unified interface all LLM providers must implement.
 */
export interface ILLMProvider {
  readonly name: string;
  complete(
    model: string,
    messages: LLMMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: "text" | "json";
    },
  ): Promise<LLMResponse>;
}

/** Pricing per token (as of 2026-02) */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5-20250929": { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
  "gpt-4.1-mini": { input: 0.4 / 1_000_000, output: 1.6 / 1_000_000 },
  "gpt-4.1-nano": { input: 0.1 / 1_000_000, output: 0.4 / 1_000_000 },
};
