/**
 * Read queries for withdrawals (V1).
 *
 * Same patterns as lib/queries/sales.ts but simpler: no multi-row children,
 * no sum invariant. Aggregations are SQL-side (per 09-RULES.md).
 */
import { and, asc, desc, eq, gte, inArray, lt, type SQL, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  withdrawalPersons,
  withdrawals,
  type WithdrawalPerson,
} from '@/db/schema';

export type WithdrawalPersonOption = Pick<WithdrawalPerson, 'id' | 'name'>;

export type WithdrawalFilters = {
  personIds?: number[];
};

export type DailyWithdrawalsTotals = {
  withdrawalsCount: number;
  withdrawalsTotal: string;
  perPerson: Array<{ id: number; name: string; total: string; count: number }>;
};

export type DailyWithdrawal = {
  id: string;
  amount: string;
  withdrawalDate: Date;
  personId: number;
  personName: string;
  createdBy: string;
};

const ZERO = '0.00';

export async function listActiveWithdrawalPersons(): Promise<WithdrawalPersonOption[]> {
  const db = getDb();
  return db
    .select({ id: withdrawalPersons.id, name: withdrawalPersons.name })
    .from(withdrawalPersons)
    .where(eq(withdrawalPersons.isActive, true))
    .orderBy(asc(withdrawalPersons.name));
}

export async function listAllWithdrawalPersons(): Promise<WithdrawalPerson[]> {
  const db = getDb();
  return db
    .select()
    .from(withdrawalPersons)
    .orderBy(asc(withdrawalPersons.isActive), asc(withdrawalPersons.name));
}

function buildWithdrawalsWhere(
  start: Date,
  end: Date,
  filters?: WithdrawalFilters,
): SQL {
  const conditions: SQL[] = [
    gte(withdrawals.withdrawalDate, start),
    lt(withdrawals.withdrawalDate, end),
  ];
  if (filters?.personIds?.length) {
    conditions.push(inArray(withdrawals.personId, filters.personIds));
  }
  const where = and(...conditions);
  if (!where) throw new Error('buildWithdrawalsWhere produced empty WHERE');
  return where;
}

/**
 * Per-person totals + count for the half-open [start, end) window.
 * Returns numeric totals as strings (G-005).
 */
export async function getDailyWithdrawalsTotals(
  start: Date,
  end: Date,
  filters?: WithdrawalFilters,
): Promise<DailyWithdrawalsTotals> {
  const db = getDb();
  const where = buildWithdrawalsWhere(start, end, filters);

  // One pass: total + count grouped by person, then totals derived in code.
  const rows = await db
    .select({
      personId: withdrawals.personId,
      personName: withdrawalPersons.name,
      total: sql<string>`COALESCE(SUM(${withdrawals.amount}), 0)::text`,
      count: sql<number>`COUNT(${withdrawals.id})::int`,
    })
    .from(withdrawals)
    .innerJoin(
      withdrawalPersons,
      eq(withdrawalPersons.id, withdrawals.personId),
    )
    .where(where)
    .groupBy(withdrawals.personId, withdrawalPersons.name)
    .orderBy(asc(withdrawalPersons.name));

  let totalCount = 0;
  let totalSum = 0; // safe: numeric(12,2) max value (1e10) sums fit in Number for display
  const perPerson = rows.map((r) => {
    totalCount += Number(r.count);
    totalSum += Number(r.total);
    return {
      id: r.personId,
      name: r.personName,
      total: r.total,
      count: Number(r.count),
    };
  });

  return {
    withdrawalsCount: totalCount,
    withdrawalsTotal: rows.length === 0 ? ZERO : totalSum.toFixed(2),
    perPerson,
  };
}

export async function listDailyWithdrawals(
  start: Date,
  end: Date,
  filters?: WithdrawalFilters,
): Promise<DailyWithdrawal[]> {
  const db = getDb();
  const where = buildWithdrawalsWhere(start, end, filters);
  const rows = await db
    .select({
      id: withdrawals.id,
      amount: withdrawals.amount,
      withdrawalDate: withdrawals.withdrawalDate,
      personId: withdrawals.personId,
      personName: withdrawalPersons.name,
      createdBy: withdrawals.createdBy,
    })
    .from(withdrawals)
    .innerJoin(
      withdrawalPersons,
      eq(withdrawalPersons.id, withdrawals.personId),
    )
    .where(where)
    .orderBy(desc(withdrawals.withdrawalDate));
  return rows;
}

// Monthly aggregates — one row per day of the month.
export type MonthlyWithdrawalRow = {
  day: string; // YYYY-MM-DD
  total: string;
  count: number;
};

export async function getMonthlyWithdrawals(
  start: Date,
  end: Date,
): Promise<MonthlyWithdrawalRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${withdrawals.withdrawalDate} AT TIME ZONE 'America/Argentina/Cordoba'), 'YYYY-MM-DD')`,
      total: sql<string>`COALESCE(SUM(${withdrawals.amount}), 0)::text`,
      count: sql<number>`COUNT(${withdrawals.id})::int`,
    })
    .from(withdrawals)
    .where(and(gte(withdrawals.withdrawalDate, start), lt(withdrawals.withdrawalDate, end)))
    .groupBy(sql`1`)
    .orderBy(sql`1 DESC`);
  return rows.map((r) => ({
    day: r.day,
    total: r.total,
    count: Number(r.count),
  }));
}

// Annual aggregates — one row per month of the year.
export type AnnualWithdrawalRow = {
  month: string; // YYYY-MM
  total: string;
  count: number;
};

export async function getAnnualWithdrawals(
  start: Date,
  end: Date,
): Promise<AnnualWithdrawalRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${withdrawals.withdrawalDate} AT TIME ZONE 'America/Argentina/Cordoba'), 'YYYY-MM')`,
      total: sql<string>`COALESCE(SUM(${withdrawals.amount}), 0)::text`,
      count: sql<number>`COUNT(${withdrawals.id})::int`,
    })
    .from(withdrawals)
    .where(and(gte(withdrawals.withdrawalDate, start), lt(withdrawals.withdrawalDate, end)))
    .groupBy(sql`1`)
    .orderBy(sql`1 DESC`);
  return rows.map((r) => ({
    month: r.month,
    total: r.total,
    count: Number(r.count),
  }));
}

export type WithdrawalForEdit = {
  id: string;
  amount: string;
  personId: number;
  withdrawalDate: Date;
};

export async function getWithdrawalForEdit(id: string): Promise<WithdrawalForEdit | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: withdrawals.id,
      amount: withdrawals.amount,
      personId: withdrawals.personId,
      withdrawalDate: withdrawals.withdrawalDate,
    })
    .from(withdrawals)
    .where(eq(withdrawals.id, id));
  return rows[0] ?? null;
}
