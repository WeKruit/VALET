/**
 * OpenAI SDK adapter.
 */
import OpenAI from "openai";
import type { ILLMProvider, LLMMessage, LLMResponse, ProviderConfig } from "./base.js";
import { MODEL_PRICING } from "./base.js";

export class OpenAIProvider implements ILLMProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(config: ProviderConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeout ?? 60_000,
      maxRetries: config.maxRetries ?? 2,
    });
  }

  async complete(
    model: string,
    messages: LLMMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: "text" | "json";
    },
  ): Promise<LLMResponse> {
    const start = Date.now();

    const response = await this.client.chat.completions.create({
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 4096,
      ...(options?.responseFormat === "json" && {
        response_format: { type: "json_object" },
      }),
    });

    const choice = response.choices[0];
    const content = choice?.message?.content ?? "";
    const pricing = MODEL_PRICING[model] ?? { input: 0, output: 0 };
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;

    return {
      content,
      model,
      provider: this.name,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        costUsd:
          inputTokens * pricing.input + outputTokens * pricing.output,
      },
      cached: false,
      durationMs: Date.now() - start,
    };
  }
}
