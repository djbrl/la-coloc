CREATE TABLE "house_guests" (
	"house_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"asked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "house_guests_house_id_user_id_pk" PRIMARY KEY("house_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "house_guests" ADD CONSTRAINT "house_guests_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "house_guests" ADD CONSTRAINT "house_guests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "house_guests_user" ON "house_guests" USING btree ("user_id");