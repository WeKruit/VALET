export interface GHLocation {
  city: string;
  state: string;
  country: string;
  zip?: string;
}

export interface GHEducation {
  institution: string;
  degree: string;
  field: string;
  graduation_year: number;
}

export interface GHWorkHistory {
  company: string;
  title: string;
  start_date: string;
  end_date?: string;
  description?: string;
}

export interface GHProfile {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  linkedin_url?: string;
  portfolio_url?: string;
  location?: GHLocation;
  work_authorization?: string;
  salary_expectation?: string;
  years_of_experience?: number;
  education?: GHEducation[];
  work_history?: GHWorkHistory[];
  skills?: string[];
}

export interface GHResume {
  storage_path: string;
}

export type GHWorkerAffinity = "strict" | "preferred" | "any";

export interface GHSubmitApplicationParams {
  valet_task_id: string;
  valet_user_id: string;
  target_url: string;
  platform: string;
  resume: GHResume;
  profile: GHProfile;
  qa_answers?: Record<string, string>;
  callback_url?: string;
  quality?: "fast" | "balanced" | "thorough";
  priority?: number;
  timeout_seconds?: number;
  max_retries?: number;
  idempotency_key?: string;
  target_worker_id?: string | null;
  worker_affinity?: GHWorkerAffinity;
}

export interface GHSubmitApplicationResponse {
  job_id: string;
  valet_task_id: string;
  status: string;
  created_at: string;
  duplicate?: boolean;
  target_worker_id?: string | null;
}

export interface GHJobTimestamps {
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface GHJobResult {
  confirmation_id?: string;
  screenshot_url?: string;
  fields_filled?: Record<string, string>;
}

export interface GHJobError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface GHJobStatus {
  job_id: string;
  valet_task_id: string;
  status: string;
  status_message?: string;
  progress?: number;
  result?: GHJobResult;
  error?: GHJobError;
  timestamps: GHJobTimestamps;
  target_worker_id?: string | null;
}

export interface GHSubmitGenericTaskParams {
  valet_task_id: string;
  valet_user_id: string;
  job_type: string;
  target_url: string;
  task_description: string;
  input_data?: Record<string, unknown>;
  callback_url?: string;
  priority?: number;
  timeout_seconds?: number;
  max_retries?: number;
  idempotency_key?: string;
  target_worker_id?: string | null;
  worker_affinity?: GHWorkerAffinity;
}

export interface GHSubmitGenericTaskResponse {
  job_id: string;
  valet_task_id: string;
  status: string;
  created_at: string;
  target_worker_id?: string | null;
}

export interface GHDeployWebhookPayload {
  event: "ghosthands.deploy_ready";
  image: string;
  image_tag: string;
  image_latest: string;
  commit_sha: string;
  commit_message: string;
  branch: string;
  environment: "staging" | "production";
  repository: string;
  run_id: string;
  run_url: string;
  timestamp: string;
}

export interface GHCallbackCost {
  total_cost_usd: number;
  action_count: number;
  total_tokens: number;
}

export interface GHCallbackCostBreakdown {
  total_cost_usd: number;
  action_count: number;
  total_tokens: number;
  cookbook_steps: number;
  magnitude_steps: number;
  cookbook_cost_usd: number;
  magnitude_cost_usd: number;
  image_cost_usd: number;
  reasoning_cost_usd: number;
}

/**
 * Actual payload sent by GhostHands callbackNotifier.
 * Differs from original spec — uses flat fields instead of nested objects.
 */
export interface GHCallbackPayload {
  job_id: string;
  valet_task_id: string | null;
  status: "running" | "completed" | "failed" | "cancelled" | "needs_human" | "resumed";
  worker_id?: string;
  completed_at?: string;
  progress?: number;
  // Success fields (flat, not nested)
  result_data?: Record<string, unknown>;
  result_summary?: string;
  screenshot_url?: string;
  // Error fields (flat, not nested)
  error_code?: string;
  error_message?: string;
  // Cost tracking
  cost?: GHCallbackCost;
  cost_breakdown?: GHCallbackCostBreakdown;
  // HITL interaction data (when status is "needs_human")
  interaction?: GHInteractionData;
  // Legacy format support (if GH is updated to match original spec)
  result?: GHJobResult;
  error?: GHJobError;
  timestamps?: GHJobTimestamps;
}

export type GHInteractionType =
  | "captcha"
  | "2fa"
  | "login"
  | "bot_check"
  | "rate_limited"
  | "verification";

export interface GHInteractionData {
  type: GHInteractionType;
  screenshot_url?: string;
  page_url?: string;
  paused_at?: string;
  timeout_seconds?: number;
  message?: string;
  description?: string;
  metadata?: {
    blocker_confidence?: number;
    captcha_type?: string;
    detection_method?: string;
  };
}

export interface GHResumeJobParams {
  resolved_by?: string;
  notes?: string;
  resolution_type?: string;
  resolution_data?: Record<string, unknown>;
}

export interface GHResumeJobResponse {
  job_id: string;
  status: string;
  message?: string;
}

export interface GHBrowserSession {
  id: string;
  user_id: string;
  domain: string;
  created_at: string;
  last_used_at: string;
  expires_at?: string;
}

export interface GHSessionListResponse {
  sessions: GHBrowserSession[];
  total: number;
}

export interface GHClearSessionResponse {
  deleted: boolean;
  session_id: string;
}

export interface GHClearAllSessionsResponse {
  deleted_count: number;
  user_id: string;
}

// ─── Monitoring Endpoints ───

export interface GHHealthCheck {
  name: string;
  status: string;
  message?: string;
  latencyMs?: number;
}

export interface GHDetailedHealth {
  status: string;
  version?: string;
  uptime?: number;
  checks?: GHHealthCheck[];
}

export interface GHMetrics {
  jobs: {
    created: number;
    completed: number;
    failed: number;
  };
  llm: {
    calls: number;
  };
  worker: {
    activeJobs: number;
    maxConcurrent: number;
    totalProcessed: number;
    queueDepth: number;
  };
  api: {
    totalRequests: number;
    totalErrors: number;
  };
  uptime: number;
}

// ─── Worker Status Endpoints (port 3101) ───

export interface GHWorkerStatus {
  worker_id: string;
  active_jobs: number;
  is_draining: boolean;
  uptime_ms: number;
}

export interface GHWorkerHealth {
  status: "idle" | "busy" | "draining";
  deploy_safe: boolean;
}

// ─── Worker Fleet Monitoring (port 3100) ───

export interface GHWorkerRegistryEntry {
  worker_id: string;
  status: "active" | "draining" | "offline";
  target_worker_id: string | null;
  ec2_instance_id: string | null;
  ec2_ip: string | null;
  current_job_id: string | null;
  registered_at: string;
  last_heartbeat: string;
  jobs_completed: number;
  jobs_failed: number;
  uptime_seconds?: number;
}

export interface GHWorkerFleetResponse {
  workers: GHWorkerRegistryEntry[];
}

// ─── Worker Deregistration ───

export interface GHDeregisterWorkerParams {
  target_worker_id: string;
  reason: string;
  cancel_active_jobs?: boolean;
  drain_timeout_seconds?: number;
}

export interface GHDeregisterWorkerResponse {
  deregistered: string[];
  cancelled_jobs: string[];
  reason: string;
}
