/**
 * Sandbox TypeScript interfaces for WeKruit Valet multi-tier browser automation.
 *
 * These define the contracts for sandbox provisioning, engine orchestration,
 * session management, human intervention, and the self-learning manual system.
 *
 * Depends on: automation.ts (FormField, FormAnalysis, etc.)
 * Consumed by: apps/worker, apps/api, apps/web
 */

import type {
  Platform,
  ProxyConfig,
  ProxyOptions,
  BrowserSession,
  FormField,
  FormAnalysis,
  FieldMapping,
  UserData,
  PlatformDetection,
  GeneratedAnswer,
  AnswerContext,
} from "./automation.js";

import type { SubscriptionTier } from "../schemas/user.schema.js";

// ---------------------------------------------------------------------------
// Enums & Literal Types
// ---------------------------------------------------------------------------

/** Browser automation engine identifier */
export type EngineType = "stagehand" | "magnitude" | "none";

/** Stagehand operating mode */
export type StagehandMode = "dom" | "cua" | "hybrid";

/** Sandbox tier determining infrastructure and capabilities */
export type SandboxTier = 1 | 2 | 3 | 4;

/** Sandbox provider identifier */
export type SandboxProviderType =
  | "adspower-ec2"
  | "browserbase"
  | "local-desktop"
  | "fly-machine"
  | "api-direct";

/**
 * Classification of an automation failure.
 * Used by the engine orchestrator to decide whether to retry,
 * switch engines, or escalate to human.
 */
export type FailureSignalType =
  | "selector_not_found"
  | "selector_ambiguous"
  | "action_no_effect"
  | "shadow_dom_blocked"
  | "iframe_unreachable"
  | "canvas_element"
  | "dynamic_rendering"
  | "cdp_disconnect"
  | "timeout"
  | "anti_bot_detected"
  | "captcha_detected"
  | "rate_limited"
  | "budget_exceeded"
  | "unknown";

/** Human intervention reason codes */
export type InterventionReason =
  | "captcha"
  | "login_required"
  | "ambiguous_field"
  | "review_before_submit"
  | "engine_exhausted"
  | "security_challenge"
  | "custom";

/**
 * Application state machine states.
 * Matches the taskStatus Zod enum in task.schema.ts but adds
 * internal workflow sub-states visible only to the worker.
 */
export type ApplicationPhase =
  | "provisioning"
  | "navigating"
  | "analyzing"
  | "filling"
  | "uploading"
  | "reviewing"
  | "submitting"
  | "verifying"
  | "waiting_human"
  | "completed"
  | "failed";

/**
 * Profile status for browser profile lifecycle.
 * Distinct from the ProfileStatus in automation.ts which uses different values.
 */
export type SandboxProfileStatus = "available" | "in_use" | "error" | "retired";

// ---------------------------------------------------------------------------
// Page State & Engine Result Types
// ---------------------------------------------------------------------------

/**
 * Snapshot of the current page state.
 * JSON-serializable so it can cross Hatchet task boundaries.
 */
export interface PageState {
  url: string;
  title: string;
  scrollX: number;
  scrollY: number;
  screenshotBase64?: string;
  capturedAt: string;
}

/** Result of an engine action (click, fill, type, etc.) */
export interface EngineActionResult {
  success: boolean;
  message: string;
  durationMs: number;
  tokensUsed?: number;
}

/** Result of a structured data extraction */
export interface EngineExtractResult<T = Record<string, unknown>> {
  data: T;
  durationMs: number;
  tokensUsed?: number;
}

/** Observed interactive element on the page */
export interface ObservedElement {
  selector: string;
  description: string;
  method: string;
  arguments: unknown[];
}

// ---------------------------------------------------------------------------
// IBrowserEngine
// ---------------------------------------------------------------------------

/**
 * IBrowserEngine - unified interface for browser automation engines.
 *
 * Implementations:
 *   - StagehandEngine (apps/worker/src/engines/stagehand-engine.ts)
 *   - MagnitudeEngine (apps/worker/src/engines/magnitude-engine.ts)
 *   - MockEngine      (apps/worker/src/engines/mock-engine.ts)
 *
 * NOT serializable. Lives in worker process memory only.
 */
export interface IBrowserEngine {
  readonly engineType: EngineType;

  connect(cdpUrl: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Navigation
  navigate(url: string): Promise<void>;
  getCurrentUrl(): Promise<string>;

  // Actions
  act(
    instruction: string,
    variables?: Record<string, string>,
  ): Promise<EngineActionResult>;

  extract<T = Record<string, unknown>>(
    instruction: string,
    schema: Record<string, unknown>,
  ): Promise<EngineExtractResult<T>>;

  observe(instruction: string): Promise<ObservedElement[]>;

  // State Capture
  getPageState(): Promise<PageState>;
  screenshot(): Promise<Buffer>;
}

// ---------------------------------------------------------------------------
// ISandboxController
// ---------------------------------------------------------------------------

/** Engine configuration thresholds for a specific engine type */
export interface EngineConfig {
  maxFailures: number;
  operationTimeoutMs: number;
  confidenceThreshold: number;
  retryCount: number;
}

/** Configuration for the sandbox controller. JSON-serializable. */
export interface SandboxControllerConfig {
  providerType: SandboxProviderType;
  engines: {
    stagehand: EngineConfig;
    magnitude: EngineConfig;
  };
  stagehandModel: string;
  magnitudeModel?: string;
  enableHumanIntervention: boolean;
}

/**
 * Handle to the currently active engine within the controller.
 * NOT serializable - contains live object references.
 */
export interface EngineHandle {
  type: EngineType;
  engine: IBrowserEngine | null;
  connectedAt: string;
  failureCount: number;
}

/** Record of an engine switch event. JSON-serializable. */
export interface EngineSwitchEvent {
  from: EngineType;
  to: EngineType;
  reason: string;
  pageState: PageState;
  durationMs: number;
  success: boolean;
  timestamp: string;
}

/**
 * ISandboxController - manages engine lifecycle, CDP mutex, engine switching.
 *
 * Invariant: at most one engine is connected to the CDP endpoint at any time.
 *
 * Implementation: apps/worker/src/services/sandbox-controller.ts
 * NOT serializable. Created once per workflow run and shared via closure.
 */
export interface ISandboxController {
  // Session Lifecycle
  startSession(): Promise<BrowserSession>;
  stopSession(): Promise<void>;

  // Engine Management
  connectEngine(engineType: EngineType): Promise<IBrowserEngine>;
  disconnectEngine(): Promise<void>;
  switchEngine(targetEngine: EngineType, reason: string): Promise<EngineHandle>;

  // State Accessors
  getCurrentEngine(): EngineType;
  getEngineHandle(): EngineHandle | null;
  getCdpUrl(): string | null;
  getSession(): BrowserSession | null;
  getSwitchHistory(): EngineSwitchEvent[];

  // Failure Tracking
  recordFailure(): number;
  shouldSwitch(): boolean;

  // VNC / Human Intervention
  getInterventionUrl(): string | null;

  // Teardown
  destroy(): Promise<void>;
}

// ---------------------------------------------------------------------------
// IEngineOrchestrator
// ---------------------------------------------------------------------------

/** A single level in the fallback cascade */
export interface FallbackLevel {
  engine: EngineType;
  mode?: StagehandMode;
  retryCount: number;
  timeoutPerAttemptMs: number;
  skipForPlatforms?: Platform[];
}

/** Complete fallback cascade configuration */
export interface FallbackCascadeConfig {
  totalTimeoutMs: number;
  levels: FallbackLevel[];
}

/** Decision output from the engine selector */
export interface EngineSelection {
  primary: EngineType;
  primaryMode?: StagehandMode;
  cascade: FallbackCascadeConfig;
}

/** Decision about whether to switch engines */
export interface SwitchDecision {
  shouldSwitch: boolean;
  reason: string;
  targetEngine: EngineType;
}

/**
 * IEngineOrchestrator - decides which engine to use and handles fallback.
 *
 * Implementation: apps/worker/src/services/engine-orchestrator.ts
 * NOT serializable. Wraps ISandboxController and adds decision logic.
 */
export interface IEngineOrchestrator {
  selectEngine(platform: Platform): EngineSelection;

  evaluateSwitch(
    error: Error | null,
    operationDurationMs: number,
    confidenceScore?: number,
  ): SwitchDecision;

  executeWithFallback<T>(
    operation: (engine: IBrowserEngine) => Promise<T>,
    context: { taskId: string; step: string },
  ): Promise<T>;

  requestHumanTakeover(
    reason: InterventionReason,
    screenshotUrl?: string,
  ): Promise<void>;

  getCurrentEngine(): EngineType;
}

// ---------------------------------------------------------------------------
// ISandboxProvider
// ---------------------------------------------------------------------------

/** Options for provisioning a browser sandbox */
export interface ProvisionOptions {
  userId: string;
  platform: Platform;
  proxy?: ProxyConfig;
  taskId: string;
  enableIntervention: boolean;
}

/** Result of provisioning a sandbox. JSON-serializable. */
export interface ProvisionResult {
  cdpUrl: string;
  session: BrowserSession;
  interventionUrl?: string;
  contextId?: string;
  tier: SandboxTier;
  providerType: SandboxProviderType;
}

/**
 * ISandboxProvider - abstract provider for browser instances.
 *
 * Implementations:
 *   - AdsPowerEC2Provider   (Tier 1)
 *   - BrowserbaseProvider   (Tier 2)
 *   - FlyMachineProvider    (Tier 3)
 *   - ApiDirectProvider     (Tier 4)
 */
export interface ISandboxProvider {
  readonly providerType: SandboxProviderType;
  readonly tier: SandboxTier;

  provision(options: ProvisionOptions): Promise<ProvisionResult>;
  release(result: ProvisionResult): Promise<void>;
  hasCapacity(): Promise<boolean>;
  healthCheck(): Promise<{ healthy: boolean; message?: string }>;
}

// ---------------------------------------------------------------------------
// ISessionManager
// ---------------------------------------------------------------------------

/** Serializable session state for persistence across ephemeral sandboxes */
export interface SessionSnapshot {
  userId: string;
  platform: Platform;
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }>;
  localStorage: Record<string, Record<string, string>>;
  sessionStorage?: Record<string, Record<string, string>>;
  browserbaseContextId?: string;
  adspowerProfileId?: string;
  capturedAt: string;
}

/**
 * ISessionManager - session creation, persistence, cleanup, state capture/restore.
 *
 * Implementations:
 *   - S3SessionManager         (Tier 3)
 *   - BrowserbaseSessionManager (Tier 2)
 *   - AdsPowerSessionManager   (Tier 1)
 */
export interface ISessionManager {
  capture(
    engine: IBrowserEngine,
    userId: string,
    platform: Platform,
  ): Promise<SessionSnapshot>;

  restore(
    engine: IBrowserEngine,
    userId: string,
    platform: Platform,
  ): Promise<boolean>;

  clear(userId: string, platform?: Platform): Promise<void>;
  hasSnapshot(userId: string, platform: Platform): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// IProxyManager (extended with tier awareness)
// ---------------------------------------------------------------------------

/** Extended proxy options for multi-tier use */
export interface TierProxyOptions extends ProxyOptions {
  tier: SandboxTier;
  platform?: Platform;
  taskId?: string;
}

/** Proxy health status */
export interface ProxyHealthResult {
  healthy: boolean;
  latencyMs: number;
  exitIp?: string;
  country?: string;
}

/**
 * IProxyManager - proxy binding, rotation, and health checking.
 * Extends the existing interface from automation.ts with tier awareness.
 */
export interface ISandboxProxyManager {
  getProxy(options?: TierProxyOptions): Promise<ProxyConfig>;
  rotateIp(currentProxy: ProxyConfig): Promise<ProxyConfig>;
  healthCheck(proxy: ProxyConfig): Promise<ProxyHealthResult>;
  bindToProfile(profileId: string, proxy: ProxyConfig): Promise<void>;
  markBlocked(proxy: ProxyConfig, cooldownMinutes: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// IHumanInterventionHandler
// ---------------------------------------------------------------------------

/** Details of a detected intervention trigger */
export interface InterventionTrigger {
  reason: InterventionReason;
  description: string;
  screenshotUrl?: string;
  pageUrl: string;
  detectedAt: string;
}

/** An active intervention request waiting for human resolution. JSON-serializable. */
export interface InterventionRequest {
  requestId: string;
  taskId: string;
  userId: string;
  trigger: InterventionTrigger;
  interventionUrl: string;
  timeoutMs: number;
  expiresAt: string;
}

/** Result of a human intervention */
export interface InterventionResult {
  resolved: boolean;
  resolvedBy: "user" | "timeout" | "cancelled";
  durationMs: number;
  notes?: string;
}

/**
 * IHumanInterventionHandler - CAPTCHA detection, VNC/LiveView, wait for human.
 *
 * Implementations:
 *   - VncInterventionHandler        (Tiers 1, 3)
 *   - BrowserbaseLiveViewHandler    (Tier 2)
 *   - ExtensionInterventionHandler  (Free tier)
 */
export interface IHumanInterventionHandler {
  detect(engine: IBrowserEngine): Promise<InterventionTrigger | null>;

  requestAndWait(
    trigger: InterventionTrigger,
    interventionUrl: string,
    taskId: string,
    userId: string,
    timeoutMs?: number,
  ): Promise<InterventionResult>;

  resolve(requestId: string, notes?: string): Promise<void>;
  cancel(requestId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// IFormAnalyzer (sandbox-aware, extends automation.ts version)
// ---------------------------------------------------------------------------

/**
 * IFormAnalyzer - LLM-powered form analysis and field mapping.
 *
 * This interface is shared between:
 *   - Server-side: LLMFormAnalyzer (uses Stagehand extract or LLMRouter)
 *   - Extension:   DOMFormAnalyzer (DOM queries, heuristic-based)
 */
export interface ISandboxFormAnalyzer {
  detectPlatform(url: string, pageContent?: string): Promise<PlatformDetection>;
  analyzeForm(source?: string): Promise<FormAnalysis>;

  mapFields(
    analysis: FormAnalysis,
    userData: UserData,
    qaAnswers?: Record<string, string>,
  ): Promise<FieldMapping[]>;

  generateAnswer(
    question: string,
    context: AnswerContext,
  ): Promise<GeneratedAnswer>;

  scoreConfidence(mapping: FieldMapping): Promise<number>;
}

// ---------------------------------------------------------------------------
// IQABank
// ---------------------------------------------------------------------------

/** A single Q&A entry. JSON-serializable. */
export interface QAEntry {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  useCount: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * IQABank - Q&A storage and retrieval for screening questions.
 *
 * Implementations:
 *   - DatabaseQABank    (server: queries Supabase via Drizzle)
 *   - ExtensionQABank   (extension: chrome.storage.local)
 *   - InMemoryQABank    (testing)
 */
export interface IQABank {
  lookup(question: string): Promise<QAEntry | null>;
  getAll(userId: string): Promise<QAEntry[]>;
  upsert(
    userId: string,
    entry: Omit<QAEntry, "id" | "useCount" | "createdAt" | "updatedAt">,
  ): Promise<QAEntry>;
  delete(userId: string, entryId: string): Promise<void>;
  recordUsage(entryId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// IUsageMetering
// ---------------------------------------------------------------------------

/** Plan limits for a subscription tier */
export interface PlanLimits {
  maxApplicationsPerMonth: number;
  maxConcurrent: number;
  allowedTiers: SandboxTier[];
  maxResumes: number;
  maxQAEntries: number;
  autopilotEnabled: boolean;
  apiAccessEnabled: boolean;
}

/** Current usage snapshot for a user. JSON-serializable. */
export interface UsageSnapshot {
  userId: string;
  periodStart: string;
  periodEnd: string;
  applicationsUsed: number;
  applicationsRemaining: number;
  activeTasks: number;
  limits: PlanLimits;
}

/** Result of a rate-limit check */
export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
}

/**
 * IUsageMetering - rate limiting, feature gating, usage tracking.
 *
 * Implementation: apps/api/src/services/usage-metering.ts
 */
export interface IUsageMetering {
  getLimits(tier: SubscriptionTier): PlanLimits;
  checkRateLimit(userId: string): Promise<RateLimitResult>;
  recordApplicationStart(userId: string, taskId: string): Promise<void>;
  recordApplicationEnd(userId: string, taskId: string): Promise<void>;
  getUsage(userId: string): Promise<UsageSnapshot>;
  hasFeature(userId: string, feature: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// IApplicationTracker
// ---------------------------------------------------------------------------

/** A state transition in the application lifecycle. JSON-serializable. */
export interface StateTransition {
  taskId: string;
  from: ApplicationPhase;
  to: ApplicationPhase;
  trigger: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/** Progress update event sent to the frontend via WebSocket. JSON-serializable. */
export interface ProgressUpdate {
  taskId: string;
  userId: string;
  phase: ApplicationPhase;
  progressPct: number;
  stepDescription: string;
  currentStep: string;
  screenshotUrl?: string;
  timestamp: string;
}

/**
 * IApplicationTracker - tracks application status and emits progress events.
 *
 * Implementation: apps/worker/src/services/application-tracker.ts
 */
export interface IApplicationTracker {
  transition(
    taskId: string,
    userId: string,
    toPhase: ApplicationPhase,
    trigger: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;

  emitProgress(update: ProgressUpdate): Promise<void>;
  getCurrentPhase(taskId: string): Promise<ApplicationPhase | null>;
  getHistory(taskId: string): Promise<StateTransition[]>;
}

// ---------------------------------------------------------------------------
// Engine Switching Types
// ---------------------------------------------------------------------------

/** A structured failure signal from an engine operation */
export interface FailureSignal {
  type: FailureSignalType;
  error?: Error;
  engine: EngineType;
  durationMs: number;
  retriableWithSameEngine: boolean;
  suggestsVisionEngine: boolean;
  timestamp: string;
}

/** Classify a raw error into a structured FailureSignal. Pure function. */
export type FailureClassifier = (
  error: Error,
  engine: EngineType,
  durationMs: number,
) => FailureSignal;

/** Result of an operation executed through the fallback cascade */
export interface CascadeResult<T> {
  data: T;
  engine: EngineType;
  totalAttempts: number;
  levelIndex: number;
  totalDurationMs: number;
}

// ---------------------------------------------------------------------------
// Manus Research: Self-Learning Manual System
// ---------------------------------------------------------------------------

/** A single step in an action manual */
export interface ManualStep {
  /** Step index (0-based) */
  index: number;
  /** Natural language instruction for the step */
  instruction: string;
  /** CSS selector or XPath for the target element, if known */
  selector?: string;
  /** Expected URL pattern after this step */
  expectedUrlPattern?: string;
  /** Expected page state after this step */
  expectedState?: Partial<PageState>;
  /** Max time to wait for this step to complete (ms) */
  timeoutMs: number;
  /** Whether this step is optional (skip on failure) */
  optional: boolean;
}

/** A reusable action manual for a specific platform flow */
export interface ActionManual {
  id: string;
  /** Target platform */
  platform: Platform;
  /** URL pattern this manual applies to (regex) */
  urlPattern: string;
  /** Human-readable name */
  name: string;
  /** Ordered list of steps */
  steps: ManualStep[];
  /** How many times this manual has been successfully executed */
  successCount: number;
  /** How many times this manual has failed */
  failureCount: number;
  /** Health score 0.0-1.0 based on recent success rate */
  healthScore: number;
  /** When this manual was created */
  createdAt: string;
  /** When this manual was last used */
  lastUsedAt?: string;
  /** When this manual was last updated */
  updatedAt: string;
}

/**
 * IManualManager - finds, creates, and maintains action manuals
 * for the self-learning system.
 */
export interface IManualManager {
  /** Find a manual matching the given URL and platform */
  findManual(url: string, platform: Platform): Promise<ActionManual | null>;

  /** Create a new manual from an execution trace */
  createManualFromTrace(
    platform: Platform,
    urlPattern: string,
    name: string,
    steps: Omit<ManualStep, "index">[],
  ): Promise<ActionManual>;

  /** Update the health score of a manual based on execution outcome */
  updateHealthScore(
    manualId: string,
    success: boolean,
  ): Promise<ActionManual>;

  /** Get a manual by ID */
  getManual(manualId: string): Promise<ActionManual | null>;
}

/**
 * IAgentBrowser - unified class wrapping humanized + AI actions.
 * Provides both low-level humanized interactions and high-level
 * AI-driven actions through a single interface.
 *
 * NOT serializable. Lives in worker process memory only.
 */
export interface IAgentBrowser {
  /** Click an element with human-like mouse movement and timing */
  humanClick(selector: string): Promise<void>;

  /** Type text with human-like keystroke timing */
  humanType(selector: string, text: string): Promise<void>;

  /** Perform a Stagehand act() through the connected engine */
  stagehandAct(instruction: string): Promise<EngineActionResult>;

  /** Perform a Magnitude act() through the connected engine */
  magnitudeAct(instruction: string): Promise<EngineActionResult>;

  /** Observe interactive elements on the current page */
  observe(instruction: string): Promise<ObservedElement[]>;

  /** Get the raw Playwright Page object for advanced operations */
  rawPage(): unknown;

  /** Close the agent browser and release resources */
  close(): Promise<void>;
}

/**
 * IExecutionEngine - executes a task using an agent browser,
 * deciding between Reuse mode (follow an existing manual) and
 * Explore mode (AI-driven navigation with trace recording).
 */
export interface IExecutionEngine {
  /**
   * Execute a task using the provided agent browser.
   * If a matching manual exists and is healthy, uses Reuse mode.
   * Otherwise, uses Explore mode and records a trace for future manuals.
   */
  execute(
    task: { taskId: string; url: string; platform: Platform; userData: UserData },
    agentBrowser: IAgentBrowser,
  ): Promise<{ success: boolean; manual?: ActionManual; error?: string }>;
}
