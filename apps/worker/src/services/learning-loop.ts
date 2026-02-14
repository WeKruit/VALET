import type { ActionTrace, ActionTraceStep } from "./manual-manager.js";

/** Step format ready for insertion into manual_steps table. */
export interface NormalizedStep {
  action: string;
  selector: string | null;
  fallbackSelector: string | null;
  value: string | null;
  description: string;
  elementType: string | null;
  waitAfterMs: number;
}

export class LearningLoop {
  /** Parse a Stagehand action trace into normalized manual steps. */
  parseStagehandTrace(trace: ActionTrace): NormalizedStep[] {
    return trace.steps.map((step) => ({
      action: step.action,
      selector: step.selector,
      fallbackSelector: step.fallbackSelector ?? null,
      value: step.value ?? null,
      description: step.description,
      elementType: step.elementType ?? null,
      waitAfterMs: step.waitAfterMs ?? 500,
    }));
  }

  /** Parse a Magnitude action trace into normalized manual steps. */
  parseMagnitudeTrace(trace: ActionTrace): NormalizedStep[] {
    // Magnitude traces have the same structure but may use different
    // action names. Normalize them to our canonical set.
    return trace.steps.map((step) => ({
      action: normalizeMagnitudeAction(step.action),
      selector: step.selector,
      fallbackSelector: step.fallbackSelector ?? null,
      value: step.value ?? null,
      description: step.description,
      elementType: step.elementType ?? null,
      waitAfterMs: step.waitAfterMs ?? 500,
    }));
  }

  /** Normalize and deduplicate a list of steps. */
  normalizeSteps(steps: NormalizedStep[]): NormalizedStep[] {
    if (steps.length === 0) return [];

    const result: NormalizedStep[] = [];

    for (let i = 0; i < steps.length; i++) {
      const current = steps[i]!;
      const prev = result[result.length - 1];

      // Skip duplicate consecutive clicks on the same element
      if (
        prev &&
        current.action === "click" &&
        prev.action === "click" &&
        current.selector === prev.selector &&
        current.selector !== null
      ) {
        continue;
      }

      // Merge adjacent type actions on the same field
      if (
        prev &&
        current.action === "type" &&
        prev.action === "type" &&
        current.selector === prev.selector &&
        current.selector !== null
      ) {
        prev.value = current.value; // Keep the latest value
        prev.description = current.description;
        continue;
      }

      // Validate selectors - skip steps with clearly invalid selectors
      if (current.selector && !isValidSelector(current.selector)) {
        current.selector = null;
      }
      if (current.fallbackSelector && !isValidSelector(current.fallbackSelector)) {
        current.fallbackSelector = null;
      }

      result.push({ ...current });
    }

    // Re-number step order (sequential from 1)
    // Note: step_order is set when inserting into DB, not stored on NormalizedStep
    return result;
  }

  /**
   * Generate a URL pattern regex from a concrete URL.
   * Examples:
   *   "https://boards.greenhouse.io/company/jobs/12345"
   *     -> "boards\\.greenhouse\\.io/[^/]+/jobs/\\d+"
   *   "https://linkedin.com/jobs/view/12345"
   *     -> "linkedin\\.com/jobs/view/\\d+"
   */
  generateUrlPattern(url: string): string {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/\./g, "\\.");

    let path = parsed.pathname;
    // Replace numeric-only path segments with \d+
    path = path.replace(/\/\d+/g, "/\\d+");
    // Replace UUID-like segments
    path = path.replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "/[0-9a-f-]{36}",
    );
    // Replace slug-like segments (company names, identifiers)
    path = path.replace(/\/[a-z0-9][-a-z0-9]*[a-z0-9](?=\/)/gi, "/[^/]+");

    return `${host}${path}`;
  }
}

/** Map Magnitude-specific action names to our canonical action set. */
function normalizeMagnitudeAction(action: string): string {
  const mapping: Record<string, string> = {
    fill: "type",
    input: "type",
    press: "click",
    tap: "click",
    choose: "select",
    pick: "select",
    drop: "upload",
    goto: "navigate",
    visit: "navigate",
  };
  return mapping[action.toLowerCase()] ?? action.toLowerCase();
}

/** Basic check that a selector string is syntactically plausible. */
function isValidSelector(selector: string): boolean {
  // Must not be empty or whitespace-only
  if (!selector.trim()) return false;
  // Must not be just a number
  if (/^\d+$/.test(selector)) return false;
  // Should contain at least one CSS-like or XPath-like character
  return /[.#\[\]>:a-zA-Z\/]/.test(selector);
}
