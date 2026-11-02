CREATE TABLE "lease_ends" (
	"house_id" text NOT NULL,
	"room" text NOT NULL,
	"user_id" uuid NOT NULL,
	"month" text NOT NULL,
	"memory_mb" integer NOT NULL,
	"ended_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lease_ends_house_id_room_month_pk" PRIMARY KEY("house_id","room","month")
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "leaving_month" text;--> statement-breakpoint
ALTER TABLE "lease_ends" ADD CONSTRAINT "lease_ends_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_ends" ADD CONSTRAINT "lease_ends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;