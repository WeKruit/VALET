/**
 * StagehandEngine - IBrowserEngine implementation wrapping Stagehand v3.
 *
 * Supports three modes:
 *   - "dom" (default): Standard Stagehand act/extract/observe via DOM analysis
 *   - "cua": Computer Use Agent mode (screenshot-based actions)
 *   - "hybrid": Combined DOM + vision mode
 *
 * The engine connects to an existing browser via CDP URL rather than
 * launching its own browser instance.
 *
 * Reference: core-docs/architecture/04-browser-engines-reference.md
 */

import { Stagehand } from "@browserbasehq/stagehand";
import type {
  ActResult as StagehandActResult,
  Action,
  V3Options,
} from "@browserbasehq/stagehand";
import type { Page as StagehandPage } from "@browserbasehq/stagehand";

import type {
  IBrowserEngine,
  EngineType,
  EngineActionResult,
  EngineExtractResult,
  ObservedElement,
  PageState,
  StagehandMode,
} from "@valet/shared/types";

export interface StagehandEngineOptions {
  /** Operating mode: "dom" (default), "cua", or "hybrid" */
  mode?: StagehandMode;
  /** LLM model for primitives. Default: "claude-sonnet-4-5-20250514" */
  model?: string;
  /** Logging verbosity: 0 (silent), 1 (normal), 2 (debug). Default: 0 */
  verbose?: 0 | 1 | 2;
  /** Directory for persistent action caching across runs */
  cacheDir?: string;
  /** Ms to wait for DOM stability after navigation. Default: 30000 */
  domSettleTimeoutMs?: number;
  /** Automatic error recovery. Default: true */
  selfHeal?: boolean;
  /** Custom system prompt for LLM interactions */
  systemPrompt?: string;
  /** CDP connection timeout in ms. Default: 30000 */
  connectTimeoutMs?: number;
}

export class StagehandEngine implements IBrowserEngine {
  readonly engineType: EngineType = "stagehand";

  private stagehand: Stagehand | null = null;
  private connected = false;
  private cdpUrl: string | null = null;
  private readonly mode: StagehandMode;
  private readonly model: string;
  private readonly verbose: 0 | 1 | 2;
  private readonly cacheDir?: string;
  private readonly domSettleTimeoutMs: number;
  private readonly selfHeal: boolean;
  private readonly systemPrompt?: string;
  private readonly connectTimeoutMs: number;

  constructor(options?: StagehandEngineOptions) {
    this.mode = options?.mode ?? "dom";
    this.model = options?.model ?? "claude-sonnet-4-5-20250514";
    this.verbose = options?.verbose ?? 0;
    this.cacheDir = options?.cacheDir;
    this.domSettleTimeoutMs = options?.domSettleTimeoutMs ?? 30_000;
    this.selfHeal = options?.selfHeal ?? true;
    this.systemPrompt = options?.systemPrompt;
    this.connectTimeoutMs = options?.connectTimeoutMs ?? 30_000;
  }

  async connect(cdpUrl: string): Promise<void> {
    if (this.connected) {
      throw new Error("StagehandEngine is already connected. Disconnect first.");
    }

    this.cdpUrl = cdpUrl;

    const opts: V3Options = {
      env: "LOCAL",
      model: this.model,
      verbose: this.verbose,
      selfHeal: this.selfHeal,
      domSettleTimeout: this.domSettleTimeoutMs,
      localBrowserLaunchOptions: {
        cdpUrl,
        connectTimeoutMs: this.connectTimeoutMs,
      },
      disablePino: true,
      disableAPI: true,
    };

    if (this.cacheDir) {
      opts.cacheDir = this.cacheDir;
    }
    if (this.systemPrompt) {
      opts.systemPrompt = this.systemPrompt;
    }

    this.stagehand = new Stagehand(opts);
    await this.stagehand.init();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.stagehand) {
      // close() drops the CDP WebSocket only -- does NOT kill the browser process
      await this.stagehand.close({ force: false });
      this.stagehand = null;
    }
    this.connected = false;
    this.cdpUrl = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async navigate(url: string): Promise<void> {
    const page = this.getActivePage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
  }

  async getCurrentUrl(): Promise<string> {
    const page = this.getActivePage();
    return page.url();
  }

  /**
   * Execute an atomic browser action.
   *
   * Supports %variable% substitution: values injected into the DOM action
   * but never included in the LLM prompt. Use for passwords, tokens, PII.
   */
  async act(
    instruction: string,
    variables?: Record<string, string>,
  ): Promise<EngineActionResult> {
    this.ensureConnected();
    const sh = this.stagehand!;

    const start = Date.now();
    let result: StagehandActResult;

    if (variables && Object.keys(variables).length > 0) {
      result = await sh.act(instruction, { variables });
    } else {
      result = await sh.act(instruction);
    }

    const durationMs = Date.now() - start;

    return {
      success: result.success,
      message: result.message,
      durationMs,
    };
  }

  /**
   * Execute a pre-observed Action deterministically (no LLM call).
   * Used with the observe-then-act pattern for caching-friendly batch operations.
   */
  async actDeterministic(action: Action): Promise<EngineActionResult> {
    this.ensureConnected();
    const sh = this.stagehand!;

    const start = Date.now();
    const result = await sh.act(action);
    const durationMs = Date.now() - start;

    return {
      success: result.success,
      message: result.message,
      durationMs,
    };
  }

  async extract<T = Record<string, unknown>>(
    instruction: string,
    _schema: Record<string, unknown>,
  ): Promise<EngineExtractResult<T>> {
    this.ensureConnected();
    const sh = this.stagehand!;

    const start = Date.now();

    // Stagehand v3 extract with just an instruction returns { extraction: string }
    // For typed extraction with a Zod schema, callers should use extractWithSchema()
    const result = await sh.extract(instruction);
    const durationMs = Date.now() - start;

    return {
      data: result as T,
      durationMs,
    };
  }

  /**
   * Discover actionable elements on the page without executing them.
   * Returns Action[] objects that can be passed to actDeterministic().
   *
   * Supports iframe and shadow DOM traversal automatically.
   */
  async observe(instruction: string): Promise<ObservedElement[]> {
    this.ensureConnected();
    const sh = this.stagehand!;

    let actions: Action[];
    if (instruction) {
      actions = await sh.observe(instruction);
    } else {
      actions = await sh.observe();
    }

    return actions.map((action) => ({
      selector: action.selector,
      description: action.description,
      method: action.method ?? "click",
      arguments: action.arguments ?? [],
    }));
  }

  /**
   * Get the raw observed Action objects from Stagehand.
   * These can be passed to actDeterministic() for zero-LLM execution.
   */
  async observeRaw(instruction: string): Promise<Action[]> {
    this.ensureConnected();
    return instruction
      ? this.stagehand!.observe(instruction)
      : this.stagehand!.observe();
  }

  async getPageState(): Promise<PageState> {
    const page = this.getActivePage();
    const [title, scrollPos] = await Promise.all([
      page.title(),
      page.mainFrame().evaluate<{ scrollX: number; scrollY: number }>(
        "({ scrollX: globalThis.scrollX, scrollY: globalThis.scrollY })",
      ),
    ]);

    return {
      url: page.url(),
      title,
      scrollX: scrollPos.scrollX,
      scrollY: scrollPos.scrollY,
      capturedAt: new Date().toISOString(),
    };
  }

  async screenshot(): Promise<Buffer> {
    const page = this.getActivePage();
    return page.screenshot({ type: "png" });
  }

  /**
   * Get the raw Stagehand instance for advanced operations
   * (agent mode, custom tools, streaming, etc.).
   */
  getStagehand(): Stagehand {
    this.ensureConnected();
    return this.stagehand!;
  }

  /**
   * Get the active Stagehand Page for direct CDP operations.
   */
  getPage(): StagehandPage {
    return this.getActivePage();
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private getActivePage(): StagehandPage {
    this.ensureConnected();
    const page = this.stagehand!.context.activePage();
    if (!page) {
      throw new Error("No active page found in Stagehand context.");
    }
    return page;
  }

  private ensureConnected(): void {
    if (!this.connected || !this.stagehand) {
      throw new Error(
        "StagehandEngine is not connected. Call connect() first.",
      );
    }
  }
}
