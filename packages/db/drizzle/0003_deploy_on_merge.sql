ALTER TABLE "deployments" ADD COLUMN "github_repo_id" bigint;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "pr_number" integer;