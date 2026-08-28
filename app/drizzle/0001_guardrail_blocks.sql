CREATE TABLE "app"."guardrail_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool" text NOT NULL,
	"blocked_input" text NOT NULL,
	"matched_phrase" text NOT NULL,
	"attempted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "guardrail_blocks_created_idx" ON "app"."guardrail_blocks" USING btree ("created_at");
