CREATE TABLE "arena_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"place" smallint NOT NULL,
	"key" text NOT NULL,
	"title_en" text NOT NULL,
	"title_fr" text NOT NULL,
	"city" text NOT NULL,
	"week" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arena_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"city" text NOT NULL,
	"week_start" date NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"slug" text NOT NULL,
	"kind" text NOT NULL,
	"repo" text NOT NULL,
	"path" text NOT NULL,
	"prize_fcfa" integer NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arena_entries" (
	"challenge_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arena_entries_challenge_id_user_id_pk" PRIMARY KEY("challenge_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "arena_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"url" text NOT NULL,
	"repo" text NOT NULL,
	"number" integer NOT NULL,
	"title" text,
	"state" text DEFAULT 'open' NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"label" text,
	"scored_at" timestamp with time zone,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "worn_award_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "badge" jsonb;--> statement-breakpoint
ALTER TABLE "arena_awards" ADD CONSTRAINT "arena_awards_challenge_id_arena_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."arena_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_awards" ADD CONSTRAINT "arena_awards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_entries" ADD CONSTRAINT "arena_entries_challenge_id_arena_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."arena_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_entries" ADD CONSTRAINT "arena_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_submissions" ADD CONSTRAINT "arena_submissions_challenge_id_arena_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."arena_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_submissions" ADD CONSTRAINT "arena_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "arena_awards_once" ON "arena_awards" USING btree ("challenge_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "arena_awards_place" ON "arena_awards" USING btree ("challenge_id","place");--> statement-breakpoint
CREATE INDEX "arena_awards_user" ON "arena_awards" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "arena_submissions_once" ON "arena_submissions" USING btree ("challenge_id","repo","number");--> statement-breakpoint
CREATE INDEX "arena_submissions_challenge_user" ON "arena_submissions" USING btree ("challenge_id","user_id");--> statement-breakpoint
CREATE INDEX "arena_submissions_pr" ON "arena_submissions" USING btree ("repo","number");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_worn_award_id_arena_awards_id_fk" FOREIGN KEY ("worn_award_id") REFERENCES "public"."arena_awards"("id") ON DELETE set null ON UPDATE no action;