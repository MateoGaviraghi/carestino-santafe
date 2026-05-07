/**
 * Read queries for the sales sheets.
 *
 * Aggregations are computed SQL-side (per 09-RULES.md). For per-method totals
 * we sum sale_payments.amount over a join — `SUM(sales.total_amount)` would
 * multiply by the number of payments per sale, but `SUM(sale_payments.amount)`
 * for the same window equals the sales total under the sum invariant (G-006).
 *
 * Filters semantics (see lib/filters.ts): ANY-of match on the children. A
 * filtered sale = any of its payments matches the criterion (EXISTS subquery).
 * Once a sale is in the filtered set, the totals card sum ALL of its payments.
 */
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  lt,
  type SQL,
  sql,
} from 'drizzle-orm';
import { getDb } from '@/db';
import {
  cardBrands,
  salePayments,
  sales,
  type PaymentMethod,
} from '@/db/schema';
import type { SalesFilters } from '@/lib/filters';

export type DailyTotals = {
  salesCount: number;
  salesTotal: string;
  perMethod: {
    efectivo: string;
    transferencia: string;
    debito: string;
    credito1: string;
    credito3: string;
    credito6: string;
  };
};

export type DailySalePayment = {
  id: string;
  method: PaymentMethod;
  amount: string;
  cardBrandId: number | null;
  cardBrandName: string | null;
  installments: number | null;
};

export type DailySale = {
  id: string;
  totalAmount: string;
  observations: string | null;
  saleDate: Date;
  createdBy: string;
  payments: DailySalePayment[];
};

const ZERO = '0.00';

/**
 * Build the WHERE conditions for a daily-window sales query, optionally
 * narrowed by user-supplied filters. Filters on the child table use EXISTS
 * subqueries so the sale is included when ANY of its payments matches.
 */
function buildSalesWhere(start: Date, end: Date, filters?: SalesFilters): SQL {
  const db = getDb();
  const conditions: SQL[] = [
    gte(sales.saleDate, start),
    lt(sales.saleDate, end),
  ];

  if (filters?.search) {
    const condition = ilike(sales.observations, `%${filters.search}%`);
    if (condition) conditions.push(condition);
  }

  if (filters?.methods?.length) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(salePayments)
          .where(
            and(
              eq(salePayments.saleId, sales.id),
              inArray(salePayments.method, filters.methods),
            ),
          ),
      ),
    );
  }

  if (filters?.cardBrandIds?.length) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(salePayments)
          .where(
            and(
              eq(salePayments.saleId, sales.id),
              inArray(salePayments.cardBrandId, filters.cardBrandIds),
            ),
          ),
      ),
    );
  }

  if (filters?.installments?.length) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(salePayments)
          .where(
            and(
              eq(salePayments.saleId, sales.id),
              inArray(salePayments.installments, filters.installments),
            ),
          ),
      ),
    );
  }

  // and(...) returns SQL | undefined; with at least 2 conditions (start/end)
  // it never returns undefined, but we narrow anyway.
  const where = and(...conditions);
  if (!where) throw new Error('buildSalesWhere produced empty WHERE');
  return where;
}

/**
 * Per-method totals + sales count for the half-open [start, end) window,
 * narrowed by optional filters.
 */
export async function getDailySalesTotals(
  start: Date,
  end: Date,
  filters?: SalesFilters,
): Promise<DailyTotals> {
  const db = getDb();
  const where = buildSalesWhere(start, end, filters);

  const rows = await db
    .select({
      salesCount: sql<number>`COUNT(DISTINCT ${sales.id})::int`,
      salesTotal: sql<string>`COALESCE(SUM(${salePayments.amount}), 0)::text`,
      cash: sql<string>`COALESCE(SUM(CASE WHEN ${salePayments.method} = 'efectivo' THEN ${salePayments.amount} ELSE 0 END), 0)::text`,
      transfer: sql<string>`COALESCE(SUM(CASE WHEN ${salePayments.method} = 'transferencia' THEN ${salePayments.amount} ELSE 0 END), 0)::text`,
      debit: sql<string>`COALESCE(SUM(CASE WHEN ${salePayments.method} = 'debito' THEN ${salePayments.amount} ELSE 0 END), 0)::text`,
      credit1: sql<string>`COALESCE(SUM(CASE WHEN ${salePayments.method} = 'credito' AND ${salePayments.installments} = 1 THEN ${salePayments.amount} ELSE 0 END), 0)::text`,
      credit3: sql<string>`COALESCE(SUM(CASE WHEN ${salePayments.method} = 'credito' AND ${salePayments.installments} = 3 THEN ${salePayments.amount} ELSE 0 END), 0)::text`,
      credit6: sql<string>`COALESCE(SUM(CASE WHEN ${salePayments.method} = 'credito' AND ${salePayments.installments} = 6 THEN ${salePayments.amount} ELSE 0 END), 0)::text`,
    })
    .from(sales)
    .leftJoin(salePayments, eq(salePayments.saleId, sales.id))
    .where(where);

  const head = rows[0];
  if (!head) {
    return {
      salesCount: 0,
      salesTotal: ZERO,
      perMethod: {
        efectivo: ZERO,
        transferencia: ZERO,
        debito: ZERO,
        credito1: ZERO,
        credito3: ZERO,
        credito6: ZERO,
      },
    };
  }

  return {
    salesCount: Number(head.salesCount),
    salesTotal: head.salesTotal,
    perMethod: {
      efectivo: head.cash,
      transferencia: head.transfer,
      debito: head.debit,
      credito1: head.credit1,
      credito3: head.credit3,
      credito6: head.credit6,
    },
  };
}

/**
 * Sales for the half-open [start, end) window with their payments
 * (joined to card_brands for the brand name), narrowed by optional filters.
 * Two queries: heads + children. Group in app code so we don't have to
 * define Drizzle relations just for this read path.
 */
export async function listDailySales(
  start: Date,
  end: Date,
  filters?: SalesFilters,
): Promise<DailySale[]> {
  const db = getDb();

  const heads = await db
    .select({
      id: sales.id,
      totalAmount: sales.totalAmount,
      observations: sales.observations,
      saleDate: sales.saleDate,
      createdBy: sales.createdBy,
    })
    .from(sales)
    .where(buildSalesWhere(start, end, filters))
    .orderBy(desc(sales.saleDate));

  if (heads.length === 0) return [];

  const ids = heads.map((s) => s.id);
  const paymentRows = await db
    .select({
      id: salePayments.id,
      saleId: salePayments.saleId,
      method: salePayments.method,
      amount: salePayments.amount,
      cardBrandId: salePayments.cardBrandId,
      cardBrandName: cardBrands.name,
      installments: salePayments.installments,
    })
    .from(salePayments)
    .leftJoin(cardBrands, eq(cardBrands.id, salePayments.cardBrandId))
    .where(inArray(salePayments.saleId, ids))
    .orderBy(asc(salePayments.method));

  const grouped = new Map<string, DailySalePayment[]>();
  for (const p of paymentRows) {
    const list = grouped.get(p.saleId) ?? [];
    list.push({
      id: p.id,
      method: p.method as PaymentMethod,
      amount: p.amount,
      cardBrandId: p.cardBrandId,
      cardBrandName: p.cardBrandName,
      installments: p.installments,
    });
    grouped.set(p.saleId, list);
  }

  return heads.map((h) => ({
    id: h.id,
    totalAmount: h.totalAmount,
    observations: h.observations,
    saleDate: h.saleDate,
    createdBy: h.createdBy,
    payments: grouped.get(h.id) ?? [],
  }));
}

// -----------------------------------------------------------------------------
// V1: read a single sale + its payments, shaped for the edit form (D-017).
// Returns null when not found.
// -----------------------------------------------------------------------------

export type SaleForEdit = {
  id: string;
  saleDate: Date;
  totalAmount: string;
  observations: string | null;
  payments: Array<{
    method: PaymentMethod;
    amount: string;
    cardBrandId: number | null;
    installments: number | null;
  }>;
};

export async function getSaleForEdit(id: string): Promise<SaleForEdit | null> {
  const db = getDb();
  const heads = await db
    .select({
      id: sales.id,
      totalAmount: sales.totalAmount,
      observations: sales.observations,
      saleDate: sales.saleDate,
    })
    .from(sales)
    .where(eq(sales.id, id));
  const head = heads[0];
  if (!head) return null;

  const paymentRows = await db
    .select({
      method: salePayments.method,
      amount: salePayments.amount,
      cardBrandId: salePayments.cardBrandId,
      installments: salePayments.installments,
    })
    .from(salePayments)
    .where(eq(salePayments.saleId, id))
    .orderBy(asc(salePayments.method));

  return {
    id: head.id,
    saleDate: head.saleDate,
    totalAmount: head.totalAmount,
    observations: head.observations,
    payments: paymentRows.map((p) => ({
      method: p.method as PaymentMethod,
      amount: p.amount,
      cardBrandId: p.cardBrandId,
      installments: p.installments,
    })),
  };
}
