/**
 * Read queries for expenses (V1). One unified filterable list per 06-UI-UX.md
 * (no daily/monthly/annual sheets — Mariano filters by date range as needed).
 */
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lt,
  or,
  type SQL,
} from 'drizzle-orm';
import { fromZonedTime } from 'date-fns-tz';

import { getDb } from '@/db';
import {
  cardBrands,
  expenses,
  type Expense,
  type PaymentMethod,
} from '@/db/schema';
import { APP_TZ } from '@/lib/dates';
import type { ExpenseFilters } from '@/lib/expense-filters';

export type ExpenseRow = {
  id: string;
  provider: string;
  amount: string;
  method: PaymentMethod;
  cardBrandId: number | null;
  cardBrandName: string | null;
  installments: number | null;
  observations: string | null;
  expenseDate: Date;
  createdBy: string;
};

export type ExpensesListResult = {
  rows: ExpenseRow[];
  total: string; // sum of amounts in the filtered set
  count: number;
};

function buildWhere(filters: ExpenseFilters): SQL | undefined {
  const conditions: SQL[] = [];

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    const sc = or(
      ilike(expenses.provider, pattern),
      ilike(expenses.observations, pattern),
    );
    if (sc) conditions.push(sc);
  }

  if (filters.provider) {
    conditions.push(eq(expenses.provider, filters.provider));
  }

  if (filters.methods?.length) {
    conditions.push(inArray(expenses.method, filters.methods));
  }

  if (filters.cardBrandIds?.length) {
    conditions.push(inArray(expenses.cardBrandId, filters.cardBrandIds));
  }

  if (filters.installments?.length) {
    conditions.push(inArray(expenses.installments, filters.installments));
  }

  if (filters.from) {
    const start = fromZonedTime(`${filters.from}T00:00:00.000`, APP_TZ);
    conditions.push(gte(expenses.expenseDate, start));
  }

  if (filters.to) {
    // Half-open: include the entire `to` day.
    const [y, m, d] = filters.to.split('-').map(Number) as [number, number, number];
    const endStr = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(
      d + 1,
    ).padStart(2, '0')}T00:00:00.000`;
    // Cheap: pass through Date math via fromZonedTime — JS Date handles overflow.
    const tentative = new Date(Date.UTC(y, m - 1, d + 1));
    const next = `${tentative.getUTCFullYear()}-${String(tentative.getUTCMonth() + 1).padStart(
      2,
      '0',
    )}-${String(tentative.getUTCDate()).padStart(2, '0')}T00:00:00.000`;
    void endStr; // keep the explicit string for readability; actual range uses `next`
    const end = fromZonedTime(next, APP_TZ);
    conditions.push(lt(expenses.expenseDate, end));
  }

  return conditions.length === 0 ? undefined : and(...conditions);
}

export async function listExpenses(filters: ExpenseFilters): Promise<ExpensesListResult> {
  const db = getDb();
  const where = buildWhere(filters);

  const baseQuery = db
    .select({
      id: expenses.id,
      provider: expenses.provider,
      amount: expenses.amount,
      method: expenses.method,
      cardBrandId: expenses.cardBrandId,
      cardBrandName: cardBrands.name,
      installments: expenses.installments,
      observations: expenses.observations,
      expenseDate: expenses.expenseDate,
      createdBy: expenses.createdBy,
    })
    .from(expenses)
    .leftJoin(cardBrands, eq(cardBrands.id, expenses.cardBrandId));

  const rowsRaw = where
    ? await baseQuery.where(where).orderBy(desc(expenses.expenseDate))
    : await baseQuery.orderBy(desc(expenses.expenseDate));

  const rows: ExpenseRow[] = rowsRaw.map((r) => ({
    id: r.id,
    provider: r.provider,
    amount: r.amount,
    method: r.method as PaymentMethod,
    cardBrandId: r.cardBrandId,
    cardBrandName: r.cardBrandName,
    installments: r.installments,
    observations: r.observations,
    expenseDate: r.expenseDate,
    createdBy: r.createdBy,
  }));

  let totalSum = 0;
  for (const r of rows) totalSum += Number(r.amount);

  return {
    rows,
    total: totalSum.toFixed(2),
    count: rows.length,
  };
}

/** Distinct provider names for autocomplete. Capped at 200 so the response stays small. */
export async function listExpenseProviders(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ provider: expenses.provider })
    .from(expenses)
    .orderBy(asc(expenses.provider))
    .limit(200);
  return rows.map((r) => r.provider);
}

export type ExpenseForEdit = {
  id: string;
  provider: string;
  amount: string;
  method: PaymentMethod;
  cardBrandId: number | null;
  installments: number | null;
  observations: string | null;
  expenseDate: Date;
};

export async function getExpenseForEdit(id: string): Promise<ExpenseForEdit | null> {
  const db = getDb();
  const rows = await db.select().from(expenses).where(eq(expenses.id, id));
  const head = rows[0] as Expense | undefined;
  if (!head) return null;
  return {
    id: head.id,
    provider: head.provider,
    amount: head.amount,
    method: head.method as PaymentMethod,
    cardBrandId: head.cardBrandId,
    installments: head.installments,
    observations: head.observations,
    expenseDate: head.expenseDate,
  };
}
