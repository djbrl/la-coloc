CREATE TABLE "github_installations" (
	"id" bigint PRIMARY KEY NOT NULL,
	"account" text NOT NULL,
	"installer_github_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
