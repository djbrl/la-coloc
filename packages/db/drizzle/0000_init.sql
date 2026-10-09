CREATE TABLE "deployments" (
	"id" text PRIMARY KEY NOT NULL,
	"house_id" text NOT NULL,
	"room" text NOT NULL,
	"kind" text NOT NULL,
	"repo" text NOT NULL,
	"ref" text NOT NULL,
	"status" text NOT NULL,
	"detail" text,
	"requested_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fridge_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"house_id" text NOT NULL,
	"room" text,
	"tone" text NOT NULL,
	"text" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "houses" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"tagline" text,
	"domain" text NOT NULL,
	"status" text DEFAULT 'making' NOT NULL,
	"agent_secret_hash" text,
	"chef_id" uuid,
	"monthly_cost_fcfa" integer,
	"rules" jsonb DEFAULT '{"strictReviews":true}'::jsonb NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"house_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'flatmate' NOT NULL,
	"tontine_position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_house_id_user_id_pk" PRIMARY KEY("house_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"house_id" text NOT NULL,
	"name" text NOT NULL,
	"occupant_id" uuid,
	"memory_mb" integer NOT NULL,
	"cpus" real NOT NULL,
	"status" text DEFAULT 'empty' NOT NULL,
	"url" text,
	"project" text,
	"project_description" text,
	"ad" text,
	"last_deploy_id" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_samples" (
	"house_id" text NOT NULL,
	"room" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"cpu_percent" real NOT NULL,
	"memory_bytes" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" bigint,
	"login" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"bio" text,
	"location" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id"),
	CONSTRAINT "users_login_unique" UNIQUE("login")
);
--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fridge_notes" ADD CONSTRAINT "fridge_notes_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "houses" ADD CONSTRAINT "houses_chef_id_users_id_fk" FOREIGN KEY ("chef_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_occupant_id_users_id_fk" FOREIGN KEY ("occupant_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_samples" ADD CONSTRAINT "usage_samples_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployments_house_created" ON "deployments" USING btree ("house_id","created_at");--> statement-breakpoint
CREATE INDEX "fridge_notes_house_at" ON "fridge_notes" USING btree ("house_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_house_name" ON "rooms" USING btree ("house_id","name");--> statement-breakpoint
CREATE INDEX "usage_samples_house_at" ON "usage_samples" USING btree ("house_id","at");