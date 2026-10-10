CREATE TABLE "bill_payments" (
	"house_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"month" text NOT NULL,
	"amount" integer NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_payments_house_id_user_id_month_pk" PRIMARY KEY("house_id","user_id","month")
);
--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_house_id_houses_id_fk" FOREIGN KEY ("house_id") REFERENCES "public"."houses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;