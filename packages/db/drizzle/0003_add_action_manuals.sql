-- Add action_manuals and manual_steps tables for self-learning workflow system
CREATE TABLE "action_manuals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url_pattern" text NOT NULL,
	"platform" "platform" NOT NULL,
	"name" varchar(255) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"health_score" real DEFAULT 1.0 NOT NULL,
	"total_runs" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "manual_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manual_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"action" varchar(50) NOT NULL,
	"selector" text,
	"fallback_selector" text,
	"value" text,
	"description" text NOT NULL,
	"element_type" varchar(50),
	"wait_after_ms" integer DEFAULT 500,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "manual_steps" ADD CONSTRAINT "manual_steps_manual_id_action_manuals_id_fk" FOREIGN KEY ("manual_id") REFERENCES "public"."action_manuals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_manuals_platform" ON "action_manuals" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "idx_manuals_health" ON "action_manuals" USING btree ("health_score");--> statement-breakpoint
CREATE INDEX "idx_steps_manual" ON "manual_steps" USING btree ("manual_id");
