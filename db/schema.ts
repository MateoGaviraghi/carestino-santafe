/**
 * Drizzle schema for Carestino Santa Fe Brain.
 *
 * Source of truth for shape, constraints, and the sum-invariant trigger
 * lives in carestino-santafe-brain/04-DATA-MODEL.md.
 *
 * The DEFERRABLE trigger that enforces SUM(sale_payments.amount) ===
 * sales.total_amount is appended to the generated migration SQL by hand
 * (drizzle-kit cannot model triggers). See drizzle/0000_init.sql.
 */
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { desc, sql } from 'drizzle-orm';

// -----------------------------------------------------------------------------
// Domain enums (mirrored as TS literal unions; Postgres uses text + CHECK).
// See 10-MEMORY.md / D-008 for why we don't use Postgres ENUM types.
// -----------------------------------------------------------------------------

export const ROLES = ['super_admin', 'cajero'] as const;
export type Role = (typeof ROLES)[number];

export const PAYMENT_METHODS = ['efectivo', 'transferencia', 'debito', 'credito'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ALLOWED_INSTALLMENTS = [1, 3, 6] as const;
export type Installments = (typeof ALLOWED_INSTALLMENTS)[number];

// -----------------------------------------------------------------------------
// users — mirror of Clerk users (synced via /api/webhooks/clerk in Day 3).
// -----------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email'),
    displayName: text('display_name'),
    role: text('role').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('users_role_check', sql`${t.role} IN ('super_admin', 'cajero')`),
  ],
);

// -----------------------------------------------------------------------------
// card_brands — config table (super_admin can add). Soft-delete via is_active.
// -----------------------------------------------------------------------------

export const cardBrands = pgTable('card_brands', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// -----------------------------------------------------------------------------
// sales — header row. One sale, one or more payments (1..N).
// Money: numeric(12,2). On the wire as string. In code as Decimal (decimal.js).
// -----------------------------------------------------------------------------

export const sales = pgTable(
  'sales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
    observations: text('observations'),
    saleDate: timestamp('sale_date', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('sales_total_amount_positive', sql`${t.totalAmount} > 0`),
    index('sales_sale_date_idx').on(desc(t.saleDate)),
    index('sales_created_by_sale_date_idx').on(t.createdBy, desc(t.saleDate)),
  ],
);

// -----------------------------------------------------------------------------
// sale_payments — one row per payment method used in a sale.
//
// CHECK matrix (also enforced in zod + Server Action):
//   method ∈ {debito, credito}  ⇒  card_brand_id NOT NULL
//   method ∈ {efectivo, transferencia} ⇒ card_brand_id IS NULL
//   method = credito ⇒ installments ∈ {1, 3, 6}
//   method ≠ credito ⇒ installments IS NULL
//
// Sum invariant (SUM(amount) === sales.total_amount) is enforced by a
// DEFERRABLE constraint trigger appended to the generated migration.
// -----------------------------------------------------------------------------

export const salePayments = pgTable(
  'sale_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    method: text('method').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    cardBrandId: integer('card_brand_id').references(() => cardBrands.id),
    installments: smallint('installments'),
  },
  (t) => [
    check(
      'sale_payments_method_check',
      sql`${t.method} IN ('efectivo', 'transferencia', 'debito', 'credito')`,
    ),
    check('sale_payments_amount_positive', sql`${t.amount} > 0`),
    check(
      'sale_payments_card_brand_coherence',
      sql`(${t.method} IN ('debito','credito') AND ${t.cardBrandId} IS NOT NULL)
          OR (${t.method} IN ('efectivo','transferencia') AND ${t.cardBrandId} IS NULL)`,
    ),
    check(
      'sale_payments_installments_coherence',
      sql`(${t.method} = 'credito' AND ${t.installments} IN (1,3,6))
          OR (${t.method} <> 'credito' AND ${t.installments} IS NULL)`,
    ),
    index('sale_payments_sale_id_idx').on(t.saleId),
    index('sale_payments_method_sale_id_idx').on(t.method, t.saleId),
  ],
);

// -----------------------------------------------------------------------------
// Inferred types for use in queries and validators.
// -----------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type CardBrand = typeof cardBrands.$inferSelect;
export type NewCardBrand = typeof cardBrands.$inferInsert;
export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;
export type SalePayment = typeof salePayments.$inferSelect;
export type NewSalePayment = typeof salePayments.$inferInsert;
