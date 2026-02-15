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
  idempotency_key?: string;
  target_worker_id?: string | null;
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

export interface GHCallbackPayload {
  job_id: string;
  valet_task_id: string;
  status: "completed" | "failed" | "cancelled";
  result?: GHJobResult;
  error?: GHJobError;
  timestamps: GHJobTimestamps;
}
