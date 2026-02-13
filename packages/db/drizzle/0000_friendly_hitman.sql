CREATE TYPE "public"."application_mode" AS ENUM('copilot', 'autopilot');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('linkedin', 'greenhouse', 'lever', 'workday', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('created', 'queued', 'in_progress', 'waiting_human', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."resume_status" AS ENUM('uploading', 'parsing', 'parsed', 'parse_failed');--> statement-breakpoint
CREATE TYPE "public"."answer_source" AS ENUM('user_input', 'resume_inferred', 'application_learned');--> statement-breakpoint
CREATE TYPE "public"."qa_usage_mode" AS ENUM('always_use', 'ask_each_time', 'decline_to_answer');--> statement-breakpoint
CREATE TYPE "public"."consent_type" AS ENUM('tos_acceptance', 'privacy_policy', 'copilot_disclaimer', 'autopilot_consent');--> statement-breakpoint
CREATE TYPE "public"."profile_status" AS ENUM('available', 'in_use', 'error', 'retired');--> statement-breakpoint
CREATE TYPE "public"."proxy_status" AS ENUM('active', 'blocked', 'expired');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"avatar_url" text,
	"google_id" varchar(255) NOT NULL,
	"phone" varchar(50),
	"location" varchar(255),
	"linkedin_url" varchar(500),
	"github_url" varchar(500),
	"portfolio_url" varchar(500),
	"work_history" jsonb DEFAULT '[]'::jsonb,
	"education" jsonb DEFAULT '[]'::jsonb,
	"skills" jsonb DEFAULT '[]'::jsonb,
	"certifications" jsonb DEFAULT '[]'::jsonb,
	"languages" jsonb DEFAULT '[]'::jsonb,
	"preferences" jsonb DEFAULT '{}'::jsonb,
	"subscription_tier" varchar(50) DEFAULT 'free' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"accepted_disclaimer_version" varchar(20),
	"accepted_disclaimer_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deletion_scheduled_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_url" text NOT NULL,
	"platform" "platform" DEFAULT 'unknown' NOT NULL,
	"status" "task_status" DEFAULT 'created' NOT NULL,
	"mode" "application_mode" DEFAULT 'copilot' NOT NULL,
	"resume_id" uuid,
	"job_title" varchar(500),
	"company_name" varchar(255),
	"job_location" varchar(255),
	"progress" integer DEFAULT 0 NOT NULL,
	"current_step" varchar(100),
	"confidence_score" real,
	"match_score" real,
	"fields_filled" integer DEFAULT 0 NOT NULL,
	"duration_seconds" integer,
	"error_code" varchar(100),
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"workflow_run_id" varchar(255),
	"browser_profile_id" uuid,
	"screenshots" jsonb DEFAULT '{}'::jsonb,
	"llm_usage" jsonb DEFAULT '{}'::jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"from_status" varchar(50),
	"to_status" varchar(50),
	"event_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"filename" varchar(255) NOT NULL,
	"file_key" varchar(500) NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"status" "resume_status" DEFAULT 'uploading' NOT NULL,
	"parsed_data" jsonb,
	"parsing_confidence" real,
	"raw_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"parsed_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "qa_bank" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" varchar(50) NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"usage_mode" "qa_usage_mode" DEFAULT 'always_use' NOT NULL,
	"source" "answer_source" DEFAULT 'user_input' NOT NULL,
	"times_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "consent_type" NOT NULL,
	"version" varchar(20) NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"user_agent" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "browser_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" varchar(50) NOT NULL,
	"adspower_profile_id" varchar(100) NOT NULL,
	"proxy_binding_id" uuid,
	"fingerprint_config" jsonb NOT NULL,
	"status" "profile_status" DEFAULT 'available' NOT NULL,
	"session_healthy" boolean DEFAULT false NOT NULL,
	"total_tasks_completed" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "browser_profiles_adspower_profile_id_unique" UNIQUE("adspower_profile_id")
);
--> statement-breakpoint
CREATE TABLE "proxy_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(50) DEFAULT 'iproyal' NOT NULL,
	"proxy_type" varchar(20) DEFAULT 'socks5' NOT NULL,
	"hostname" varchar(255) NOT NULL,
	"port" integer NOT NULL,
	"username" varchar(255),
	"encrypted_password" varchar(500),
	"country" varchar(10) DEFAULT 'US' NOT NULL,
	"ip_address" varchar(45),
	"session_id" varchar(255),
	"status" "proxy_status" DEFAULT 'active' NOT NULL,
	"blocked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"field_name" varchar(255) NOT NULL,
	"field_type" varchar(50) NOT NULL,
	"value" text,
	"source" varchar(50) NOT NULL,
	"confidence" real NOT NULL,
	"qa_bank_entry_id" uuid,
	"user_overridden" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"filled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_trail" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"action" varchar(255) NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"field_name" varchar(255) NOT NULL,
	"field_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_bank" ADD CONSTRAINT "qa_bank_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "browser_profiles" ADD CONSTRAINT "browser_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_results" ADD CONSTRAINT "application_results_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_fields" ADD CONSTRAINT "application_fields_application_id_tasks_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tasks_user_status" ON "tasks" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_tasks_user_created" ON "tasks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_tasks_status" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_task_events_task_id" ON "task_events" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_resumes_user_id" ON "resumes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_resumes_user_default" ON "resumes" USING btree ("user_id","is_default");--> statement-breakpoint
CREATE INDEX "idx_qa_bank_user_id" ON "qa_bank" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_qa_bank_user_category" ON "qa_bank" USING btree ("user_id","category");--> statement-breakpoint
CREATE INDEX "idx_consent_user_type" ON "consent_records" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "idx_browser_profiles_user_platform" ON "browser_profiles" USING btree ("user_id","platform");--> statement-breakpoint
CREATE INDEX "idx_browser_profiles_status" ON "browser_profiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_proxy_bindings_status_country" ON "proxy_bindings" USING btree ("status","country");--> statement-breakpoint
CREATE INDEX "idx_application_results_task_id" ON "application_results" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_audit_trail_user_id" ON "audit_trail" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_trail_action" ON "audit_trail" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_application_fields_application_id" ON "application_fields" USING btree ("application_id");