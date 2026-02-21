/**
 * MockEngine - a fake IBrowserEngine implementation for testing.
 * Returns synthetic data and does not connect to any real browser.
 */

import type {
  IBrowserEngine,
  EngineType,
  EngineActionResult,
  EngineExtractResult,
  ObservedElement,
  PageState,
} from "@valet/shared/types";

export class MockEngine implements IBrowserEngine {
  readonly engineType: EngineType = "stagehand";

  private connected = false;
  private currentUrl = "about:blank";
  private cdpUrl: string | null = null;

  async connect(cdpUrl: string): Promise<void> {
    this.cdpUrl = cdpUrl;
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.cdpUrl = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async navigate(url: string): Promise<void> {
    this.ensureConnected();
    this.currentUrl = url;
  }

  async getCurrentUrl(): Promise<string> {
    this.ensureConnected();
    return this.currentUrl;
  }

  async act(
    instruction: string,
    _variables?: Record<string, string>,
  ): Promise<EngineActionResult> {
    this.ensureConnected();
    return {
      success: true,
      message: `Mock action: ${instruction}`,
      durationMs: 100,
      tokensUsed: 0,
    };
  }

  async extract<T = Record<string, unknown>>(
    _instruction: string,
    _schema: Record<string, unknown>,
  ): Promise<EngineExtractResult<T>> {
    this.ensureConnected();
    return {
      data: {} as T,
      durationMs: 50,
      tokensUsed: 0,
    };
  }

  async observe(_instruction: string): Promise<ObservedElement[]> {
    this.ensureConnected();
    return [
      {
        selector: "button.submit",
        description: "Mock submit button",
        method: "click",
        arguments: [],
      },
    ];
  }

  async getPageState(): Promise<PageState> {
    this.ensureConnected();
    return {
      url: this.currentUrl,
      title: "Mock Page",
      scrollX: 0,
      scrollY: 0,
      capturedAt: new Date().toISOString(),
    };
  }

  async screenshot(): Promise<Buffer> {
    this.ensureConnected();
    // Return a minimal 1x1 white PNG
    return Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "base64",
    );
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error("MockEngine is not connected. Call connect() first.");
    }
  }
}
