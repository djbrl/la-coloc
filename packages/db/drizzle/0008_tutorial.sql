ALTER TABLE "houses" ADD COLUMN "tutorial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tutorial_done_at" timestamp with time zone;