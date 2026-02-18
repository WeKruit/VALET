/**
 * Engine factory - creates IBrowserEngine instances by type.
 */

import type { IBrowserEngine, EngineType } from "@valet/shared/types";
import { StagehandEngine } from "./stagehand-engine.js";
import type { StagehandEngineOptions } from "./stagehand-engine.js";
import { MagnitudeEngine } from "./magnitude-engine.js";
import type { MagnitudeEngineOptions } from "./magnitude-engine.js";
import { MockEngine as _MockEngine } from "./mock-engine.js";

export { StagehandEngine, type StagehandEngineOptions } from "./stagehand-engine.js";
export { MagnitudeEngine, type MagnitudeEngineOptions } from "./magnitude-engine.js";
export { HumanizedPage, type HumanizedPageOptions } from "./humanized-page.js";
export { AgentBrowser, type AgentBrowserOptions, type ActionTrace, type ActionStep } from "./agent-browser.js";
export { MockEngine as _MockEngine } from "./mock-engine.js";

export interface CreateEngineOptions {
  stagehand?: StagehandEngineOptions;
  magnitude?: MagnitudeEngineOptions;
}

/**
 * Create an engine instance by type.
 */
export function createEngine(
  type: EngineType,
  options?: CreateEngineOptions,
): IBrowserEngine {
  switch (type) {
    case "stagehand":
      return new StagehandEngine(options?.stagehand);
    case "magnitude":
      return new MagnitudeEngine(options?.magnitude);
    case "none":
      throw new Error("Cannot create an engine of type 'none'");
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown engine type: ${String(_exhaustive)}`);
    }
  }
}
