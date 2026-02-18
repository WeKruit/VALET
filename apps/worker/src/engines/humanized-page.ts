/**
 * HumanizedPage - wraps a Playwright Page with human-like behavior.
 *
 * All mouse movements follow Bezier curves with variable speed,
 * typing uses a Markov-chain delay model with occasional typos,
 * and scrolling uses momentum physics.
 *
 * This wrapper is used by AgentBrowser to make automated actions
 * indistinguishable from human input.
 */

import type { Page } from "playwright";

/** Configurable options for humanization behavior */
export interface HumanizedPageOptions {
  /** Base typing speed range in ms per keystroke. Default: [50, 200] */
  typingDelayRange?: [number, number];
  /** Probability of a typo per character. Default: 0.05 (5%) */
  typoRate?: number;
  /** Mouse movement duration range in ms. Default: [200, 600] */
  mouseMoveRange?: [number, number];
  /** Pause probability between words while typing. Default: 0.15 */
  wordPauseRate?: number;
}

export class HumanizedPage {
  private readonly page: Page;
  private readonly opts: Required<HumanizedPageOptions>;
  private mouseX = 0;
  private mouseY = 0;

  constructor(page: Page, options?: HumanizedPageOptions) {
    this.page = page;
    this.opts = {
      typingDelayRange: options?.typingDelayRange ?? [50, 200],
      typoRate: options?.typoRate ?? 0.05,
      mouseMoveRange: options?.mouseMoveRange ?? [200, 600],
      wordPauseRate: options?.wordPauseRate ?? 0.15,
    };
  }

  /**
   * Click an element with human-like mouse movement.
   *
   * 1. Get element bounding box
   * 2. Generate Bezier curve from current mouse pos to element center (with slight randomization)
   * 3. Move mouse along curve with variable speed
   * 4. Click with small random delay
   */
  async humanClick(selector: string): Promise<void> {
    const box = await this.getElementBox(selector);
    if (!box) {
      // Fallback to plain click if bounding box can't be determined
      await this.page.click(selector);
      return;
    }

    // Target point: center + slight random offset
    const targetX = box.x + box.width / 2 + randRange(-box.width * 0.15, box.width * 0.15);
    const targetY = box.y + box.height / 2 + randRange(-box.height * 0.15, box.height * 0.15);

    // Move mouse along a Bezier curve
    await this.bezierMoveTo(targetX, targetY);

    // Small random delay before clicking (human reaction time)
    await sleep(randRange(30, 120));

    await this.page.mouse.click(this.mouseX, this.mouseY);
  }

  /**
   * Type text with human-like keystroke timing.
   *
   * 1. Focus the element
   * 2. Type each character with Markov-chain delay model
   * 3. Random delays: 50-200ms between keys, occasional 300-500ms pause
   * 4. Occasional typo + backspace (configurable rate per character)
   */
  async humanType(selector: string, text: string): Promise<void> {
    await this.page.focus(selector);
    await sleep(randRange(50, 150));

    const [minDelay, maxDelay] = this.opts.typingDelayRange;

    for (let i = 0; i < text.length; i++) {
      const char = text[i]!;

      // Occasional typo: type wrong char, pause, backspace, then correct char
      if (Math.random() < this.opts.typoRate && char.match(/[a-zA-Z]/)) {
        const typoChar = getAdjacentKey(char);
        await this.page.keyboard.type(typoChar, { delay: 0 });
        await sleep(randRange(100, 300));
        await this.page.keyboard.press("Backspace");
        await sleep(randRange(50, 150));
      }

      await this.page.keyboard.type(char, { delay: 0 });

      // Variable delay between keystrokes
      let delay = randRange(minDelay, maxDelay);

      // Longer pause after spaces / punctuation (word boundary)
      if (char === " " && Math.random() < this.opts.wordPauseRate) {
        delay += randRange(200, 500);
      }

      await sleep(delay);
    }
  }

  /**
   * Smooth scroll with momentum (multiple small scroll events).
   */
  async humanScroll(deltaY: number): Promise<void> {
    const steps = Math.max(5, Math.abs(Math.round(deltaY / 40)));
    const direction = deltaY > 0 ? 1 : -1;
    let remaining = Math.abs(deltaY);

    for (let i = 0; i < steps && remaining > 0; i++) {
      // Ease-out: larger steps at start, smaller at end
      const progress = i / steps;
      const easeOut = 1 - progress * progress;
      const stepSize = Math.min(remaining, Math.max(10, Math.round(easeOut * (Math.abs(deltaY) / steps) * 1.5)));

      await this.page.mouse.wheel(0, direction * stepSize);
      remaining -= stepSize;

      // Variable delay between scroll events (simulates scroll momentum)
      await sleep(randRange(15, 45));
    }

    // Scroll any remaining amount
    if (remaining > 0) {
      await this.page.mouse.wheel(0, direction * remaining);
    }
  }

  /**
   * Wait a random duration between min and max milliseconds.
   */
  async randomDelay(minMs: number, maxMs: number): Promise<void> {
    await sleep(randRange(minMs, maxMs));
  }

  /**
   * Get the underlying Playwright Page.
   */
  getPage(): Page {
    return this.page;
  }

  // -----------------------------------------------------------------------
  // Internal: Bezier mouse movement
  // -----------------------------------------------------------------------

  private async bezierMoveTo(targetX: number, targetY: number): Promise<void> {
    const startX = this.mouseX;
    const startY = this.mouseY;

    // Control points for cubic Bezier curve - add some randomness
    const dx = targetX - startX;
    const dy = targetY - startY;
    const cp1x = startX + dx * 0.3 + randRange(-50, 50);
    const cp1y = startY + dy * 0.1 + randRange(-50, 50);
    const cp2x = startX + dx * 0.7 + randRange(-30, 30);
    const cp2y = startY + dy * 0.9 + randRange(-30, 30);

    // Number of movement steps (more for longer distances)
    const distance = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(10, Math.min(40, Math.round(distance / 15)));

    const [minDuration, maxDuration] = this.opts.mouseMoveRange;
    const totalDuration = randRange(minDuration, maxDuration);
    const stepDelay = totalDuration / steps;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      // Cubic Bezier interpolation
      const x = cubicBezier(t, startX, cp1x, cp2x, targetX);
      const y = cubicBezier(t, startY, cp1y, cp2y, targetY);

      await this.page.mouse.move(x, y);
      this.mouseX = x;
      this.mouseY = y;

      // Variable step delay (slightly faster in middle, slower at ends)
      const speedMultiplier = 0.7 + 0.6 * Math.sin(t * Math.PI);
      await sleep(stepDelay * speedMultiplier);
    }

    this.mouseX = targetX;
    this.mouseY = targetY;
  }

  private async getElementBox(
    selector: string,
  ): Promise<{ x: number; y: number; width: number; height: number } | null> {
    const el = await this.page.$(selector);
    if (!el) return null;

    const box = await el.boundingBox();
    return box;
  }
}

// ---------------------------------------------------------------------------
// Pure utility functions
// ---------------------------------------------------------------------------

/** Cubic Bezier interpolation for one axis */
function cubicBezier(
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number,
): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Random number in range [min, max) */
function randRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

/** Sleep for ms milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** QWERTY keyboard layout for typo generation */
const KEYBOARD_LAYOUT: Record<string, string> = {
  a: "sqwz",
  b: "vghn",
  c: "xdfv",
  d: "scfre",
  e: "wrsdf",
  f: "dcgvrt",
  g: "fvhbty",
  h: "gbnj yu",
  i: "ujkol",
  j: "hmnku",
  k: "jmli",
  l: "kop",
  m: "njk",
  n: "bhjm",
  o: "iklp",
  p: "ol",
  q: "wa",
  r: "edft",
  s: "awedxz",
  t: "rfgy",
  u: "yhjik",
  v: "cfgb",
  w: "qase",
  x: "zsdc",
  y: "tghu",
  z: "xas",
};

/** Get a random adjacent key for typo simulation */
function getAdjacentKey(char: string): string {
  const lower = char.toLowerCase();
  const adjacents = KEYBOARD_LAYOUT[lower];
  if (!adjacents || adjacents.length === 0) return char;
  const idx = Math.floor(Math.random() * adjacents.length);
  const result = adjacents[idx] ?? char;
  return char === char.toUpperCase() ? result.toUpperCase() : result;
}
