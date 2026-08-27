CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TABLE "app"."case_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" text NOT NULL,
	"signal_type" text,
	"action_type" text NOT NULL,
	"hold_duration_hours" integer,
	"drafted_request" text,
	"predicted_recovery_usd" double precision,
	"status" text DEFAULT 'approved' NOT NULL,
	"approved_by" text,
	"reviewed_by_role" text,
	"audit_trail" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_email" text NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'default' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."disposition_recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"recommended_disposition" text,
	"recommended_hold_hours" integer,
	"predicted_recovery_usd" double precision,
	"predicted_cost_usd" double precision,
	"action_ranking" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence_score" double precision,
	"scored_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_email" text NOT NULL,
	"value" text NOT NULL,
	"rationale" text,
	"trace_id" text,
	"mlflow_assessment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"position" integer NOT NULL,
	"trace_id" text,
	"thinking" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"canceled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."open_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"n_signals" integer,
	"signal_list" text,
	"risk_level" text,
	"improper_payment_exposure_usd" double precision
);
--> statement-breakpoint
CREATE TABLE "app"."payment_position" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"program" text,
	"state" text,
	"payment_amount_usd" double precision,
	"queue_date" text,
	"n_signals" integer,
	"signals" text,
	"risk_level" text,
	"improper_payment_exposure_usd" double precision,
	"projected_recovery_if_investigated_usd" double precision
);
--> statement-breakpoint
ALTER TABLE "app"."feedback" ADD CONSTRAINT "feedback_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "app"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "app"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_actions_payment_idx" ON "app"."case_actions" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "case_actions_created_idx" ON "app"."case_actions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "conversations_user_idx" ON "app"."conversations" USING btree ("user_email","updated_at");--> statement-breakpoint
CREATE INDEX "conversations_kind_idx" ON "app"."conversations" USING btree ("user_email","kind");--> statement-breakpoint
CREATE INDEX "disposition_payment_idx" ON "app"."disposition_recommendations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "feedback_message_idx" ON "app"."feedback" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_convo_pos_uq" ON "app"."messages" USING btree ("conversation_id","position");--> statement-breakpoint
CREATE INDEX "queue_payment_idx" ON "app"."open_queue" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "position_payment_idx" ON "app"."payment_position" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "position_risk_idx" ON "app"."payment_position" USING btree ("risk_level");