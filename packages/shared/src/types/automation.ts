/**
 * Automation TypeScript interfaces for WeKruit Valet.
 *
 * These define the contracts for browser automation, form analysis,
 * platform adapters, and supporting types. Implementations are deferred
 * to later sprints; mock adapters live in apps/worker/src/adapters/.
 */

// ---------------------------------------------------------------------------
// Enums & Literal Types
// ---------------------------------------------------------------------------

export type Platform = "linkedin" | "greenhouse" | "lever" | "workday" | "unknown";

export type CaptchaType =
  | "recaptcha_v2"
  | "recaptcha_v3"
  | "hcaptcha"
  | "cloudflare_turnstile"
  | "text_captcha"
  | "image_captcha"
  | "unknown";

export type FieldSource = "resume" | "qa_bank" | "llm_generated" | "user_input";

export type FieldType =
  | "text"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "file"
  | "date"
  | "number"
  | "phone"
  | "email"
  | "url";

// ---------------------------------------------------------------------------
// Result & Confidence Types
// ---------------------------------------------------------------------------

export interface OperationResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  durationMs: number;
}

export interface ConfidenceScore {
  value: number; // 0.0 – 1.0
  source: FieldSource;
  reasoning?: string;
}

export interface StepVerification {
  step: string;
  passed: boolean;
  expected: string;
  actual: string;
  screenshotUrl?: string;
}

export interface FormVerification {
  allFieldsFilled: boolean;
  mismatches: Array<{
    fieldName: string;
    expected: string;
    actual: string;
  }>;
  missingFields: string[];
}

// ---------------------------------------------------------------------------
// Stagehand-Compatible Types
// ---------------------------------------------------------------------------

export interface ObserveResult {
  selector: string;
  description: string;
  method: string;
  arguments: string[];
}

export interface ActResult {
  success: boolean;
  message: string;
  action: string;
}

export interface ExtractResult<T = Record<string, unknown>> {
  data: T;
  metadata: {
    tokensUsed: number;
    cached: boolean;
    durationMs: number;
  };
}

// ---------------------------------------------------------------------------
// Browser Profile & Session Types
// ---------------------------------------------------------------------------

export interface ProfileOptions {
  name?: string;
  groupId?: string;
  proxyConfig?: ProxyConfig;
  fingerprint?: Record<string, unknown>;
}

export interface ProfileInfo {
  profileId: string;
  name: string;
  status: ProfileStatus;
  groupId?: string;
  createdAt: string;
  lastUsedAt?: string;
}

export type ProfileStatus = "idle" | "running" | "error" | "locked";

export interface BrowserSession {
  profileId: string;
  cdpUrl: string;
  port: number;
  pid: number;
  startedAt: string;
}

// ---------------------------------------------------------------------------
// Proxy Types
// ---------------------------------------------------------------------------

export interface ProxyConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  protocol: "http" | "https" | "socks5";
  country?: string;
  sessionId?: string;
}

export interface ProxyOptions {
  country?: string;
  sticky?: boolean;
  sessionDurationMinutes?: number;
}

// ---------------------------------------------------------------------------
// Form Analysis Types
// ---------------------------------------------------------------------------

export interface FormField {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  selector: string;
  options?: string[]; // for select/radio/checkbox
  placeholder?: string;
  maxLength?: number;
  pattern?: string;
  groupName?: string; // for multi-page forms
  pageIndex?: number;
}

export interface FormAnalysis {
  url: string;
  platform: Platform;
  totalPages: number;
  fields: FormField[];
  submitSelector: string;
  hasFileUpload: boolean;
  hasCaptcha: boolean;
  analysisConfidence: number;
}

export interface FieldMapping {
  field: FormField;
  value: string;
  confidence: ConfidenceScore;
  source: FieldSource;
  requiresReview: boolean;
}

export interface UserData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location?: string;
  resumeUrl?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  yearsOfExperience?: number;
  education?: string;
  skills?: string[];
  qaAnswers?: Record<string, string>;
}

export interface AnswerContext {
  jobTitle: string;
  company: string;
  jobDescription?: string;
  userData: UserData;
  previousAnswers?: Record<string, string>;
}

export interface GeneratedAnswer {
  answer: string;
  confidence: number;
  reasoning: string;
  source: FieldSource;
  alternativeAnswers?: string[];
}

// ---------------------------------------------------------------------------
// CAPTCHA Types
// ---------------------------------------------------------------------------

export interface CaptchaDetection {
  detected: boolean;
  type?: CaptchaType;
  selector?: string;
  iframeUrl?: string;
  screenshotUrl?: string;
}

// ---------------------------------------------------------------------------
// Platform Adapter Types
// ---------------------------------------------------------------------------

export interface PlatformDetection {
  platform: Platform;
  confidence: number;
  version?: string;
  isEasyApply?: boolean; // LinkedIn-specific
}

export interface FormFlow {
  platform: Platform;
  url: string;
  totalPages: number;
  pages: FormFlowPage[];
  metadata: Record<string, unknown>;
}

export interface FormFlowPage {
  pageIndex: number;
  fields: FormField[];
  nextSelector?: string;
  submitSelector?: string;
  isLastPage: boolean;
}

export interface FillResult {
  success: boolean;
  filledFields: FieldMapping[];
  skippedFields: FormField[];
  errors: Array<{ field: string; error: string }>;
  screenshotUrl?: string;
}

export interface SubmitResult {
  success: boolean;
  confirmationId?: string;
  confirmationMessage?: string;
  screenshotUrl?: string;
  redirectUrl?: string;
}

export interface VerificationResult {
  submitted: boolean;
  confirmationFound: boolean;
  confirmationId?: string;
  errorMessages: string[];
  screenshotUrl?: string;
}

// ---------------------------------------------------------------------------
// Core Automation Interfaces
// ---------------------------------------------------------------------------

/** AdsPower browser profile management */
export interface IAdsPowerClient {
  createProfile(options: ProfileOptions): Promise<ProfileInfo>;
  startBrowser(profileId: string): Promise<BrowserSession>;
  stopBrowser(profileId: string): Promise<void>;
  listActive(): Promise<ProfileInfo[]>;
  getProfileStatus(profileId: string): Promise<ProfileStatus>;
}

/** Low-level browser interaction (Stagehand-compatible) */
export interface IBrowserAgent {
  navigate(url: string): Promise<void>;
  fillField(selector: string, value: string): Promise<void>;
  clickElement(selector: string): Promise<void>;
  uploadFile(selector: string, filePath: string): Promise<void>;
  extractData(schema: Record<string, unknown>): Promise<Record<string, unknown>>;
  takeScreenshot(): Promise<Buffer>;
  getCurrentUrl(): Promise<string>;
  observe(instruction: string): Promise<ObserveResult[]>;
  act(instruction: string): Promise<ActResult>;
  extract<T = Record<string, unknown>>(instruction: string, schema: Record<string, unknown>): Promise<ExtractResult<T>>;
  waitForSelector(selector: string, timeoutMs?: number): Promise<void>;
}

/** LLM-powered form analysis */
export interface IFormAnalyzer {
  analyzeForm(html: string): Promise<FormAnalysis>;
  mapFields(analysis: FormAnalysis, userData: UserData): Promise<FieldMapping[]>;
  generateAnswer(question: string, context: AnswerContext): Promise<GeneratedAnswer>;
  scoreConfidence(field: FieldMapping): Promise<number>;
}

/** CAPTCHA detection (DOM + visual) */
export interface ICaptchaDetector {
  detect(page: unknown): Promise<CaptchaDetection>;
  classify(detection: CaptchaDetection): Promise<CaptchaType>;
}

/** Residential proxy management */
export interface IProxyManager {
  getProxy(options?: ProxyOptions): Promise<ProxyConfig>;
  rotateIP(profileId: string): Promise<ProxyConfig>;
  healthCheck(proxy: ProxyConfig): Promise<boolean>;
  bindToProfile(profileId: string, proxy: ProxyConfig): Promise<void>;
}

/** Platform-specific form filling adapter */
export interface IPlatformAdapter {
  platform: Platform;
  detectPlatform(url: string): Promise<PlatformDetection>;
  getFormFlow(url: string): Promise<FormFlow>;
  fillForm(flow: FormFlow, data: UserData): Promise<FillResult>;
  submitApplication(flow: FormFlow): Promise<SubmitResult>;
  verifySubmission(flow: FormFlow): Promise<VerificationResult>;
}

/** Top-level orchestrator deciding Stagehand vs Magnitude vs human */
export interface IAgentOrchestrator {
  executeStep(
    step: string,
    context: Record<string, unknown>,
  ): Promise<OperationResult>;
  switchAgent(reason: string): Promise<void>;
  requestHumanTakeover(reason: string, screenshotUrl?: string): Promise<void>;
  getCurrentAgent(): "stagehand" | "magnitude" | "human";
}
