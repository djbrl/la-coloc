CREATE TABLE "mutes" (
	"user_id" uuid NOT NULL,
	"muted_id" uuid,
	"channel" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_muted_id_users_id_fk" FOREIGN KEY ("muted_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mutes_person" ON "mutes" USING btree ("user_id","muted_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mutes_channel" ON "mutes" USING btree ("user_id","channel");