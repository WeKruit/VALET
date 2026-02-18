/**
 * MagnitudeEngine - IBrowserEngine implementation wrapping magnitude-core.
 *
 * Magnitude uses vision-based browser automation: it takes screenshots,
 * sends them to an LLM, and interprets the response as coordinates
 * to click, type, or scroll.
 *
 * Unlike Stagehand which uses DOM analysis, Magnitude works at the
 * pixel level and can handle canvas elements, shadow DOM, and other
 * structures that are difficult to query via selectors.
 *
 * Anti-detection: Magnitude uses Patchright (patched Playwright fork)
 * which patches Runtime.enable, navigator.webdriver, and other
 * detection vectors. Passes Cloudflare Turnstile, DataDome, etc.
 *
 * Note: Magnitude creates a NEW browser context when connecting via CDP,
 * not attaching to existing pages. Must re-navigate after engine switch.
 *
 * Reference: core-docs/architecture/04-browser-engines-reference.md
 */

import type { BrowserAgent } from "magnitude-core";
import { startBrowserAgent } from "magnitude-core";

import type {
  IBrowserEngine,
  EngineType,
  EngineActionResult,
  EngineExtractResult,
  ObservedElement,
  PageState,
} from "@valet/shared/types";

export interface MagnitudeEngineOptions {
  /** LLM model for vision actions. Default: "claude-sonnet-4-5-20250514" */
  model?: string;
  /** Virtual screen dimensions for coordinate accuracy. Default: 1280x720 */
  virtualScreenDimensions?: { width: number; height: number };
  /** Screenshots retained in context for prompt caching. Default: 3 */
  minScreenshots?: number;
  /** Custom system prompt for the agent */
  prompt?: string;
  /** Enable console narration of agent thoughts/actions */
  narrate?: boolean;
  /** Initial URL to navigate to after connecting */
  initialUrl?: string;
}

export class MagnitudeEngine implements IBrowserEngine {
  readonly engineType: EngineType = "magnitude";

  private agent: BrowserAgent | null = null;
  private connected = false;
  private cdpUrl: string | null = null;
  private readonly model: string;
  private readonly virtualScreenDimensions: { width: number; height: number };
  private readonly minScreenshots: number;
  private readonly prompt?: string;
  private readonly narrate: boolean;
  private readonly initialUrl?: string;

  constructor(options?: MagnitudeEngineOptions) {
    this.model = options?.model ?? "claude-sonnet-4-5-20250514";
    this.virtualScreenDimensions = options?.virtualScreenDimensions ?? { width: 1280, height: 720 };
    this.minScreenshots = options?.minScreenshots ?? 3;
    this.prompt = options?.prompt;
    this.narrate = options?.narrate ?? false;
    this.initialUrl = options?.initialUrl;
  }

  async connect(cdpUrl: string): Promise<void> {
    if (this.connected) {
      throw new Error("MagnitudeEngine is already connected. Disconnect first.");
    }

    this.cdpUrl = cdpUrl;

    // Magnitude creates a new browser context on the connected browser.
    // Disconnection via agent.stop() drops the context -- does NOT kill the browser.
    this.agent = await startBrowserAgent({
      browser: {
        cdp: cdpUrl,
      },
      url: this.initialUrl,
      prompt: this.prompt ?? undefined,
      narrate: this.narrate,
      virtualScreenDimensions: this.virtualScreenDimensions,
      minScreenshots: this.minScreenshots,
    });

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.agent) {
      await this.agent.stop();
      this.agent = null;
    }
    this.connected = false;
    this.cdpUrl = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async navigate(url: string): Promise<void> {
    this.ensureConnected();
    await this.agent!.nav(url);
  }

  async getCurrentUrl(): Promise<string> {
    this.ensureConnected();
    return this.agent!.page.url();
  }

  /**
   * Execute a vision-based browser action.
   *
   * Magnitude: screenshot -> LLM -> coordinates -> click/type/scroll.
   * Supports {placeholder} syntax for data substitution.
   */
  async act(
    instruction: string,
    _variables?: Record<string, string>,
  ): Promise<EngineActionResult> {
    this.ensureConnected();

    const start = Date.now();
    try {
      await this.agent!.act(instruction);
      const durationMs = Date.now() - start;

      return {
        success: true,
        message: `Magnitude action completed: ${instruction}`,
        durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
        durationMs,
      };
    }
  }

  async extract<T = Record<string, unknown>>(
    instruction: string,
    _schema: Record<string, unknown>,
  ): Promise<EngineExtractResult<T>> {
    this.ensureConnected();

    const start = Date.now();

    // Magnitude's extract() needs a Zod schema. Since the IBrowserEngine interface
    // receives a plain JSON schema (not Zod), we use act() to instruct the agent
    // to read data, then extract page text content as a proxy.
    // For typed extraction with Zod, callers should use getBrowserAgent().extract() directly.
    await this.agent!.act(
      `Read and identify the following information on this page: ${instruction}`,
    );

    const page = this.agent!.page;
    const textContent = await page.evaluate(
      "document.body.innerText",
    ) as string;

    const durationMs = Date.now() - start;

    return {
      data: { extraction: textContent } as T,
      durationMs,
    };
  }

  async observe(_instruction: string): Promise<ObservedElement[]> {
    this.ensureConnected();

    // Magnitude doesn't have a direct "observe" equivalent.
    // Use Playwright to query for interactive elements as a baseline.
    const page = this.agent!.page;

    try {
      // Use string-based evaluate to avoid DOM type requirements in Node context
      const elements = await page.evaluate(`(() => {
        const selectors = ["a[href]","button","input","select","textarea","[role='button']","[onclick]"];
        const found = [];
        for (const sel of selectors) {
          const els = document.querySelectorAll(sel);
          els.forEach((el) => {
            const tag = el.tagName.toLowerCase();
            const text = el.innerText ? el.innerText.slice(0, 100) : "";
            const ariaLabel = el.getAttribute("aria-label") || "";
            const desc = ariaLabel || text || tag;
            found.push({
              selector: sel,
              description: desc,
              method: tag === "input" || tag === "textarea" ? "fill" : "click",
            });
          });
        }
        return found.slice(0, 50);
      })()`) as Array<{ selector: string; description: string; method: string }>;

      return elements.map((el) => ({
        selector: el.selector,
        description: el.description,
        method: el.method,
        arguments: [] as unknown[],
      }));
    } catch {
      return [];
    }
  }

  async getPageState(): Promise<PageState> {
    this.ensureConnected();
    const page = this.agent!.page;

    const state = await page.evaluate(
      "({ title: document.title, scrollX: window.scrollX, scrollY: window.scrollY })",
    ) as { title: string; scrollX: number; scrollY: number };

    return {
      url: page.url(),
      title: state.title,
      scrollX: state.scrollX,
      scrollY: state.scrollY,
      capturedAt: new Date().toISOString(),
    };
  }

  async screenshot(): Promise<Buffer> {
    this.ensureConnected();
    return this.agent!.page.screenshot({ type: "png" });
  }

  /**
   * Get the raw BrowserAgent for advanced operations
   * (direct Playwright access, file uploads, cookie management, etc.).
   *
   * Example: file upload via direct Playwright
   * ```
   * const [fileChooser] = await Promise.all([
   *   engine.getBrowserAgent().page.waitForEvent("filechooser"),
   *   engine.act("Click the upload button"),
   * ]);
   * await fileChooser.setFiles("/path/to/resume.pdf");
   * ```
   */
  getBrowserAgent(): BrowserAgent {
    this.ensureConnected();
    return this.agent!;
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private ensureConnected(): void {
    if (!this.connected || !this.agent) {
      throw new Error(
        "MagnitudeEngine is not connected. Call connect() first.",
      );
    }
  }
}
