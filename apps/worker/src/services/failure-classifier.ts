/**
 * Failure classifier - pure function that classifies a raw error into
 * a structured FailureSignal for the engine orchestrator.
 */

import type {
  FailureSignal,
  FailureSignalType,
  EngineType,
} from "@valet/shared/types";

/**
 * Classify a raw error into a structured FailureSignal.
 * This is a pure function with no side effects.
 */
export function classifyFailure(
  error: Error,
  engine: EngineType,
  durationMs: number,
): FailureSignal {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  const classification = classifyError(message, name);

  return {
    type: classification.type,
    error,
    engine,
    durationMs,
    retriableWithSameEngine: classification.retriable,
    suggestsVisionEngine: classification.suggestsVision,
    timestamp: new Date().toISOString(),
  };
}

interface Classification {
  type: FailureSignalType;
  retriable: boolean;
  suggestsVision: boolean;
}

function classifyError(message: string, name: string): Classification {
  // CDP disconnection
  if (
    message.includes("cdp") ||
    message.includes("websocket") ||
    message.includes("connection closed") ||
    message.includes("target closed") ||
    message.includes("session closed")
  ) {
    return { type: "cdp_disconnect", retriable: false, suggestsVision: false };
  }

  // Timeout
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    name.includes("timeout")
  ) {
    return { type: "timeout", retriable: true, suggestsVision: false };
  }

  // Selector not found
  if (
    message.includes("selector not found") ||
    message.includes("no element found") ||
    message.includes("waiting for selector") ||
    message.includes("element not found") ||
    message.includes("cannot find")
  ) {
    return { type: "selector_not_found", retriable: true, suggestsVision: true };
  }

  // Selector ambiguous
  if (
    message.includes("multiple elements") ||
    message.includes("ambiguous") ||
    message.includes("strict mode violation")
  ) {
    return { type: "selector_ambiguous", retriable: false, suggestsVision: true };
  }

  // Shadow DOM
  if (
    message.includes("shadow") ||
    message.includes("shadow-root") ||
    message.includes("closed shadow")
  ) {
    return { type: "shadow_dom_blocked", retriable: false, suggestsVision: true };
  }

  // iframe issues
  if (
    message.includes("iframe") ||
    message.includes("cross-origin") ||
    message.includes("frame detached")
  ) {
    return { type: "iframe_unreachable", retriable: false, suggestsVision: true };
  }

  // Canvas elements
  if (message.includes("canvas")) {
    return { type: "canvas_element", retriable: false, suggestsVision: true };
  }

  // Dynamic rendering issues
  if (
    message.includes("detached") ||
    message.includes("stale element") ||
    message.includes("node is detached")
  ) {
    return { type: "dynamic_rendering", retriable: true, suggestsVision: false };
  }

  // Action had no effect
  if (
    message.includes("no effect") ||
    message.includes("action failed") ||
    message.includes("did not change")
  ) {
    return { type: "action_no_effect", retriable: true, suggestsVision: true };
  }

  // Anti-bot detection
  if (
    message.includes("bot") ||
    message.includes("automated") ||
    message.includes("blocked") ||
    message.includes("access denied") ||
    message.includes("forbidden")
  ) {
    return { type: "anti_bot_detected", retriable: false, suggestsVision: false };
  }

  // CAPTCHA
  if (
    message.includes("captcha") ||
    message.includes("recaptcha") ||
    message.includes("hcaptcha") ||
    message.includes("turnstile")
  ) {
    return { type: "captcha_detected", retriable: false, suggestsVision: false };
  }

  // Rate limiting
  if (
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("429")
  ) {
    return { type: "rate_limited", retriable: true, suggestsVision: false };
  }

  // Budget exceeded
  if (
    message.includes("budget") ||
    message.includes("quota") ||
    message.includes("limit exceeded")
  ) {
    return { type: "budget_exceeded", retriable: false, suggestsVision: false };
  }

  // Unknown / unclassified
  return { type: "unknown", retriable: true, suggestsVision: false };
}
