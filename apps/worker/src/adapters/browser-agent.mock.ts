/**
 * Mock browser agent.
 *
 * Simulates Stagehand-compatible browser interactions with
 * realistic delays and fake data.
 */
import type {
  IBrowserAgent,
  ObserveResult,
  ActResult,
  ExtractResult,
} from "@valet/shared/types";
import { randomDelay } from "./base.js";

export class BrowserAgentMock implements IBrowserAgent {
  private currentUrl = "about:blank";

  async navigate(url: string): Promise<void> {
    await randomDelay(800, 2000);
    this.currentUrl = url;
  }

  async fillField(_selector: string, _value: string): Promise<void> {
    await randomDelay(50, 200);
  }

  async clickElement(_selector: string): Promise<void> {
    await randomDelay(50, 150);
  }

  async uploadFile(_selector: string, _filePath: string): Promise<void> {
    await randomDelay(500, 1500);
  }

  async extractData(
    _schema: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    await randomDelay(200, 600);
    return {
      title: "Senior Software Engineer",
      company: "Acme Corp",
      location: "San Francisco, CA",
      salary: "$150,000 - $200,000",
    };
  }

  async takeScreenshot(): Promise<Buffer> {
    await randomDelay(100, 300);
    // Return a minimal 1x1 PNG
    return Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
  }

  async getCurrentUrl(): Promise<string> {
    await randomDelay(10, 50);
    return this.currentUrl;
  }

  async observe(instruction: string): Promise<ObserveResult[]> {
    await randomDelay(300, 800);
    return [
      {
        selector: "button.submit-btn",
        description: `Found element matching: ${instruction}`,
        method: "click",
        arguments: [],
      },
    ];
  }

  async act(instruction: string): Promise<ActResult> {
    await randomDelay(200, 600);
    return {
      success: true,
      message: `Executed: ${instruction}`,
      action: instruction,
    };
  }

  async extract<T = Record<string, unknown>>(
    instruction: string,
    _schema: Record<string, unknown>,
  ): Promise<ExtractResult<T>> {
    await randomDelay(400, 1000);
    return {
      data: {
        instruction,
        value: "mock-extracted-data",
      } as T,
      metadata: {
        tokensUsed: 150,
        cached: false,
        durationMs: 450,
      },
    };
  }

  async waitForSelector(_selector: string, _timeoutMs?: number): Promise<void> {
    await randomDelay(100, 500);
  }
}
