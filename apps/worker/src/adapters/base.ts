/**
 * Base re-exports and shared adapter utilities.
 */
export type {
  IPlatformAdapter,
  Platform,
  PlatformDetection,
  FormFlow,
  FormFlowPage,
  FillResult,
  SubmitResult,
  VerificationResult,
  UserData,
  FormField,
  FieldMapping,
  ConfidenceScore,
  FieldSource,
} from "@valet/shared/types";

/** Simulated async delay for mock adapters */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Random delay between min and max ms to simulate real latency */
export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return delay(ms);
}

/** Generate a fake UUID */
export function fakeId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
