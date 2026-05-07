CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" text NOT NULL,
	"card_brand_id" integer,
	"installments" smallint,
	"observations" text,
	"expense_date" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_positive" CHECK ("expenses"."amount" > 0),
	CONSTRAINT "expenses_method_check" CHECK ("expenses"."method" IN ('efectivo', 'transferencia', 'debito', 'credito')),
	CONSTRAINT "expenses_card_brand_coherence" CHECK (("expenses"."method" IN ('debito','credito') AND "expenses"."card_brand_id" IS NOT NULL)
          OR ("expenses"."method" IN ('efectivo','transferencia') AND "expenses"."card_brand_id" IS NULL)),
	CONSTRAINT "expenses_installments_coherence" CHECK (("expenses"."method" = 'credito' AND "expenses"."installments" IN (1,3,6))
          OR ("expenses"."method" <> 'credito' AND "expenses"."installments" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_card_brand_id_card_brands_id_fk" FOREIGN KEY ("card_brand_id") REFERENCES "public"."card_brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_expense_date_idx" ON "expenses" USING btree ("expense_date" desc);--> statement-breakpoint
CREATE INDEX "expenses_provider_idx" ON "expenses" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "expenses_method_expense_date_idx" ON "expenses" USING btree ("method","expense_date" desc);