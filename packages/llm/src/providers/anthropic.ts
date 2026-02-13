/**
 * Anthropic Claude SDK adapter.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ILLMProvider, LLMMessage, LLMResponse, ProviderConfig } from "./base.js";
import { MODEL_PRICING } from "./base.js";

export class AnthropicProvider implements ILLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(config: ProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
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

    // Extract system message if present
    const systemMessage = messages.find((m) => m.role === "system");
    const chatMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    // When JSON output is requested, prepend an instruction to the system
    // prompt so Claude returns raw JSON without markdown fences.
    let system = systemMessage?.content;
    if (options?.responseFormat === "json") {
      const jsonInstruction =
        "IMPORTANT: Respond with a single valid JSON object. Do NOT wrap it in markdown code fences or add any other text.";
      system = system ? `${system}\n\n${jsonInstruction}` : jsonInstruction;
    }

    const response = await this.client.messages.create({
      model,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0.3,
      system,
      messages: chatMessages,
    });

    const pricing = MODEL_PRICING[model] ?? { input: 0, output: 0 };
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    let content =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    // Strip markdown code fences that Claude may add despite instructions
    if (options?.responseFormat === "json") {
      content = content.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
    }

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
