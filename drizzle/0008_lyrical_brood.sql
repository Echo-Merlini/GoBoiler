CREATE TABLE "agent_execution_log" (
	"id" text PRIMARY KEY NOT NULL,
	"skill_id" text,
	"session_id" text,
	"user_id" text,
	"action_type" text NOT NULL,
	"input_hash" text,
	"output_hash" text,
	"manifest_hash" text,
	"source_context" text,
	"caller_depth" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "key_type" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "agent_skill_id" text;--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "input_sources" text;--> statement-breakpoint
ALTER TABLE "skill" ADD COLUMN "trust_scope" text;--> statement-breakpoint
ALTER TABLE "agent_execution_log" ADD CONSTRAINT "agent_execution_log_skill_id_skill_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skill"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_execution_log" ADD CONSTRAINT "agent_execution_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ael_skill_id_idx" ON "agent_execution_log" USING btree ("skill_id");--> statement-breakpoint
CREATE INDEX "ael_session_id_idx" ON "agent_execution_log" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ael_created_at_idx" ON "agent_execution_log" USING btree ("created_at");