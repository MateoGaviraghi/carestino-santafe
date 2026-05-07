CREATE TABLE "withdrawal_persons" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "withdrawal_persons_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"person_id" integer NOT NULL,
	"withdrawal_date" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "withdrawals_amount_positive" CHECK ("withdrawals"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_person_id_withdrawal_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."withdrawal_persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "withdrawals_withdrawal_date_idx" ON "withdrawals" USING btree ("withdrawal_date" desc);--> statement-breakpoint
CREATE INDEX "withdrawals_person_id_withdrawal_date_idx" ON "withdrawals" USING btree ("person_id","withdrawal_date" desc);