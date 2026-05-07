/**
 * Integration tests for the daily sales queries.
 *
 * Inserts a controlled fixture (one user, several sales spanning two days,
 * mixed payment methods) and asserts the aggregations match. Cleans up
 * after itself via a scoped __test_query_sales__ user id.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { sales, salePayments, users, cardBrands } from '@/db/schema';
import { dayRangeInAppTZ } from '@/lib/dates';
import { getDailySalesTotals, listDailySales } from './sales';

const TEST_USER_ID = '__test_query_sales__';
const TEST_DAY = '2026-04-01'; // arbitrary fixed date in the past
const TEST_DAY_OTHER = '2026-04-02';

const db = getDb();
let visaId: number;

async function cleanup() {
  await db.delete(sales).where(eq(sales.createdBy, TEST_USER_ID));
  await db.delete(users).where(eq(users.id, TEST_USER_ID));
}

async function insertSale(opts: {
  totalAmount: string;
  saleDate: Date;
  payments: Array<{
    method: 'efectivo' | 'transferencia' | 'debito' | 'credito';
    amount: string;
    cardBrandId?: number;
    installments?: 1 | 3 | 6;
  }>;
}) {
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(sales).values({
      id,
      totalAmount: opts.totalAmount,
      saleDate: opts.saleDate,
      createdBy: TEST_USER_ID,
    }),
    db.insert(salePayments).values(
      opts.payments.map((p) => ({
        saleId: id,
        method: p.method,
        amount: p.amount,
        cardBrandId: p.cardBrandId ?? null,
        installments: p.installments ?? null,
      })),
    ),
  ]);
  return id;
}

beforeAll(async () => {
  await cleanup();
  await db.insert(users).values({
    id: TEST_USER_ID,
    email: 'q@local',
    displayName: 'Query Sales Test',
    role: 'super_admin',
    isActive: true,
  });
  const visa = await db
    .select({ id: cardBrands.id })
    .from(cardBrands)
    .where(eq(cardBrands.name, 'Visa'));
  if (!visa[0]) throw new Error('Seed missing: Visa');
  visaId = visa[0].id;

  // Fixture for TEST_DAY (Cordoba 2026-04-01):
  //   - Sale 1: 1000 efectivo                            (10:00 local = 13:00Z)
  //   - Sale 2: 2000 transferencia                       (12:00 local = 15:00Z)
  //   - Sale 3: 1500 (500 efectivo + 1000 credito Visa 3) (14:00 local = 17:00Z)
  //   - Sale 4: 800 debito Visa                          (16:00 local = 19:00Z)
  // Fixture for TEST_DAY_OTHER:
  //   - Sale 5: 5000 credito Visa 6                       (10:00 local = 13:00Z)
  await insertSale({
    totalAmount: '1000.00',
    saleDate: new Date(`${TEST_DAY}T13:00:00Z`),
    payments: [{ method: 'efectivo', amount: '1000.00' }],
  });
  await insertSale({
    totalAmount: '2000.00',
    saleDate: new Date(`${TEST_DAY}T15:00:00Z`),
    payments: [{ method: 'transferencia', amount: '2000.00' }],
  });
  await insertSale({
    totalAmount: '1500.00',
    saleDate: new Date(`${TEST_DAY}T17:00:00Z`),
    payments: [
      { method: 'efectivo', amount: '500.00' },
      { method: 'credito', amount: '1000.00', cardBrandId: visaId, installments: 3 },
    ],
  });
  await insertSale({
    totalAmount: '800.00',
    saleDate: new Date(`${TEST_DAY}T19:00:00Z`),
    payments: [{ method: 'debito', amount: '800.00', cardBrandId: visaId }],
  });
  await insertSale({
    totalAmount: '5000.00',
    saleDate: new Date(`${TEST_DAY_OTHER}T13:00:00Z`),
    payments: [{ method: 'credito', amount: '5000.00', cardBrandId: visaId, installments: 6 }],
  });
});

afterAll(cleanup);

describe('getDailySalesTotals', () => {
  it('aggregates per-method totals correctly for a day with multiple sales', async () => {
    const { start, end } = dayRangeInAppTZ(TEST_DAY);
    const totals = await getDailySalesTotals(start, end);

    expect(totals.salesCount).toBe(4);
    expect(totals.salesTotal).toBe('5300.00'); // 1000 + 2000 + 1500 + 800
    expect(totals.perMethod.efectivo).toBe('1500.00'); // 1000 + 500
    expect(totals.perMethod.transferencia).toBe('2000.00');
    expect(totals.perMethod.debito).toBe('800.00');
    expect(totals.perMethod.credito1).toBe('0');
    expect(totals.perMethod.credito3).toBe('1000.00');
    expect(totals.perMethod.credito6).toBe('0');
  });

  it('does not count sales from the previous or next day', async () => {
    const { start, end } = dayRangeInAppTZ(TEST_DAY_OTHER);
    const totals = await getDailySalesTotals(start, end);

    expect(totals.salesCount).toBe(1);
    expect(totals.salesTotal).toBe('5000.00');
    expect(totals.perMethod.credito6).toBe('5000.00');
    // Prior day's totals should not leak.
    expect(totals.perMethod.efectivo).toBe('0');
    expect(totals.perMethod.transferencia).toBe('0');
    expect(totals.perMethod.debito).toBe('0');
  });

  it('returns zeros for a day with no sales', async () => {
    const { start, end } = dayRangeInAppTZ('2025-01-01');
    const totals = await getDailySalesTotals(start, end);

    expect(totals.salesCount).toBe(0);
    expect(totals.salesTotal).toBe('0');
    expect(totals.perMethod.efectivo).toBe('0');
  });
});

describe('getDailySalesTotals — with filters', () => {
  it('filter by method=efectivo only includes sales that have a cash payment, but counts ALL payments of those sales', async () => {
    const { start, end } = dayRangeInAppTZ(TEST_DAY);
    // Sales with at least one cash payment: Sale 1 (1000 cash), Sale 3 (500 cash + 1000 credito).
    const totals = await getDailySalesTotals(start, end, { methods: ['efectivo'] });
    expect(totals.salesCount).toBe(2);
    expect(totals.salesTotal).toBe('2500.00'); // 1000 + 500 + 1000
    expect(totals.perMethod.efectivo).toBe('1500.00'); // both cash payments
    expect(totals.perMethod.credito3).toBe('1000.00'); // child of Sale 3
    expect(totals.perMethod.transferencia).toBe('0');
    expect(totals.perMethod.debito).toBe('0');
  });

  it('filter by method=credito + installments=3 narrows to one sale', async () => {
    const { start, end } = dayRangeInAppTZ(TEST_DAY);
    const totals = await getDailySalesTotals(start, end, {
      methods: ['credito'],
      installments: [3],
    });
    expect(totals.salesCount).toBe(1);
    expect(totals.salesTotal).toBe('1500.00');
    expect(totals.perMethod.credito3).toBe('1000.00');
    expect(totals.perMethod.efectivo).toBe('500.00');
  });

  it('filter by cardBrandId=Visa narrows to debit + credit sales', async () => {
    const { start, end } = dayRangeInAppTZ(TEST_DAY);
    const totals = await getDailySalesTotals(start, end, {
      cardBrandIds: [visaId],
    });
    // Sales with a Visa payment: Sale 3 (1500), Sale 4 (800).
    expect(totals.salesCount).toBe(2);
    expect(totals.salesTotal).toBe('2300.00');
    expect(totals.perMethod.debito).toBe('800.00');
    expect(totals.perMethod.credito3).toBe('1000.00');
    expect(totals.perMethod.efectivo).toBe('500.00');
  });

  it('filter by search matches observations (ILIKE)', async () => {
    // None of the seeded sales have observations — should match zero.
    const { start, end } = dayRangeInAppTZ(TEST_DAY);
    const totals = await getDailySalesTotals(start, end, { search: 'navidad' });
    expect(totals.salesCount).toBe(0);
    expect(totals.salesTotal).toBe('0');
  });
});

describe('listDailySales — with filters', () => {
  it('filter by method=transferencia returns only the matching sale', async () => {
    const { start, end } = dayRangeInAppTZ(TEST_DAY);
    const list = await listDailySales(start, end, { methods: ['transferencia'] });
    expect(list).toHaveLength(1);
    expect(list[0]!.totalAmount).toBe('2000.00');
  });

  it('filter by method=efectivo returns both sales with a cash payment', async () => {
    const { start, end } = dayRangeInAppTZ(TEST_DAY);
    const list = await listDailySales(start, end, { methods: ['efectivo'] });
    expect(list).toHaveLength(2);
  });
});

describe('listDailySales', () => {
  it('returns sales ordered most-recent-first with payments grouped', async () => {
    const { start, end } = dayRangeInAppTZ(TEST_DAY);
    const list = await listDailySales(start, end);

    expect(list).toHaveLength(4);
    // Ordered DESC by sale_date — sale at 19:00 first.
    expect(list[0]!.totalAmount).toBe('800.00');
    expect(list[3]!.totalAmount).toBe('1000.00');

    // The mixed sale (1500) should have 2 payments.
    const mixed = list.find((s) => s.totalAmount === '1500.00');
    expect(mixed?.payments).toHaveLength(2);

    // Card brand name should be joined for credit/debit payments.
    const credito = mixed?.payments.find((p) => p.method === 'credito');
    expect(credito?.cardBrandName).toBe('Visa');
    expect(credito?.installments).toBe(3);

    // Cash payment has no brand.
    const cash = mixed?.payments.find((p) => p.method === 'efectivo');
    expect(cash?.cardBrandName).toBeNull();
    expect(cash?.installments).toBeNull();
  });

  it('returns empty array for a day with no sales', async () => {
    const { start, end } = dayRangeInAppTZ('2025-01-01');
    const list = await listDailySales(start, end);
    expect(list).toEqual([]);
  });
});
