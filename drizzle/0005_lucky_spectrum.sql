CREATE TABLE "app_log" (
	"id" text PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"message" text NOT NULL,
	"source" text,
	"meta" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
