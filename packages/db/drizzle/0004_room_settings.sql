CREATE TABLE "room_secrets" (
	"house_id" text NOT NULL,
	"room" text NOT NULL,
	"name" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_secrets_house_id_room_name_pk" PRIMARY KEY("house_id","room","name")
);
--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "branch" text;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "build_path" text DEFAULT '.' NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "port" integer;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "room_secrets" ADD CONSTRAINT "room_secrets_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE cascade ON UPDATE no action;