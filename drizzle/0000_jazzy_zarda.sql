CREATE TABLE "card_brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_brands_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sale_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"method" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"card_brand_id" integer,
	"installments" smallint,
	CONSTRAINT "sale_payments_method_check" CHECK ("sale_payments"."method" IN ('efectivo', 'transferencia', 'debito', 'credito')),
	CONSTRAINT "sale_payments_amount_positive" CHECK ("sale_payments"."amount" > 0),
	CONSTRAINT "sale_payments_card_brand_coherence" CHECK (("sale_payments"."method" IN ('debito','credito') AND "sale_payments"."card_brand_id" IS NOT NULL)
          OR ("sale_payments"."method" IN ('efectivo','transferencia') AND "sale_payments"."card_brand_id" IS NULL)),
	CONSTRAINT "sale_payments_installments_coherence" CHECK (("sale_payments"."method" = 'credito' AND "sale_payments"."installments" IN (1,3,6))
          OR ("sale_payments"."method" <> 'credito' AND "sale_payments"."installments" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"observations" text,
	"sale_date" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_total_amount_positive" CHECK ("sales"."total_amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"display_name" text,
	"role" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('super_admin', 'cajero'))
);
--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_card_brand_id_card_brands_id_fk" FOREIGN KEY ("card_brand_id") REFERENCES "public"."card_brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sale_payments_sale_id_idx" ON "sale_payments" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_payments_method_sale_id_idx" ON "sale_payments" USING btree ("method","sale_id");--> statement-breakpoint
CREATE INDEX "sales_sale_date_idx" ON "sales" USING btree ("sale_date" desc);--> statement-breakpoint
CREATE INDEX "sales_created_by_sale_date_idx" ON "sales" USING btree ("created_by","sale_date" desc);--> statement-breakpoint
-- =============================================================================
-- Sum invariant trigger.
--
-- Third defense layer for the rule:
--   SUM(sale_payments.amount WHERE sale_id = X) = sales.total_amount WHERE id = X
--
-- Layer 1: zod schema (lib/validators/sale.ts), runs on the client and again
--          on the server before any DB call.
-- Layer 2: Server Action transaction (app/actions/sales.ts), explicit assert
--          before commit.
-- Layer 3: this trigger — last line of defense for any direct DB write that
--          bypasses the app entirely.
--
-- DEFERRABLE INITIALLY DEFERRED is required so the parent `sales` row and
-- the child `sale_payments` rows can be inserted in the same transaction
-- without tripping the check on the very first INSERT.
--
-- Custom SQLSTATE 'P5001' lets the Server Action map this exception to the
-- ActionError 'sum_mismatch' without string-matching the message.
-- See carestino-santafe-brain/04-DATA-MODEL.md and 09-RULES.md.
-- =============================================================================
CREATE OR REPLACE FUNCTION assert_sale_payments_sum() RETURNS trigger AS $$
DECLARE
  expected numeric(12,2);
  actual numeric(12,2);
  target_sale uuid;
BEGIN
  target_sale := COALESCE(NEW.sale_id, OLD.sale_id);
  SELECT total_amount INTO expected FROM sales WHERE id = target_sale;
  -- Sale was deleted (CASCADE deletes children after the parent); skip check.
  IF expected IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO actual
    FROM sale_payments WHERE sale_id = target_sale;
  IF expected <> actual THEN
    RAISE EXCEPTION 'sum_mismatch: payments=% expected=%', actual, expected
      USING ERRCODE = 'P5001';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER trg_assert_sale_payments_sum
AFTER INSERT OR UPDATE OR DELETE ON sale_payments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_sale_payments_sum();