/**
 * Integration tests for expense Server Actions.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, like } from 'drizzle-orm';

import { getDb } from '@/db';
import { expenses, users } from '@/db/schema';
import {
  ForbiddenError,
  UnauthorizedError,
  type SessionUser,
} from '@/lib/auth';
import { todayInAppTZ } from '@/lib/dates';

const TEST_USER_ID = '__test_expense_user__';
const TEST_PROVIDER_PREFIX = 'Test-Expense-';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, requireRole: vi.fn() };
});

const { requireRole } = await import('@/lib/auth');
const { createExpense, updateExpense, deleteExpense } = await import('./expenses');

const db = getDb();

async function cleanup() {
  await db.delete(expenses).where(like(expenses.provider, `${TEST_PROVIDER_PREFIX}%`));
  await db.delete(users).where(eq(users.id, TEST_USER_ID));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(users).values({
    id: TEST_USER_ID,
    email: 'e@local',
    displayName: 'Expense Test',
    role: 'super_admin',
    isActive: true,
  });
});

beforeEach(() => {
  vi.mocked(requireRole).mockReset();
  vi.mocked(requireRole).mockResolvedValue({
    userId: TEST_USER_ID,
    role: 'super_admin',
  } satisfies SessionUser);
});

afterAll(cleanup);

async function seed(): Promise<string> {
  const r = await createExpense({
    provider: `${TEST_PROVIDER_PREFIX}A`,
    amount: '1000.00',
    method: 'efectivo',
  });
  if (!r.ok) throw new Error(`seed failed: ${r.error}`);
  return r.data.expenseId;
}

describe('createExpense — super_admin only', () => {
  it('returns forbidden for cajero', async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new ForbiddenError());
    const r = await createExpense({
      provider: `${TEST_PROVIDER_PREFIX}X`,
      amount: '100.00',
      method: 'efectivo',
    });
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('returns unauthorized without session', async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new UnauthorizedError());
    const r = await createExpense({
      provider: `${TEST_PROVIDER_PREFIX}X`,
      amount: '100.00',
      method: 'efectivo',
    });
    expect(r).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('returns validation_error for empty provider', async () => {
    const r = await createExpense({ provider: '', amount: '100.00', method: 'efectivo' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('validation_error');
  });

  it('inserts a cash expense', async () => {
    const r = await createExpense({
      provider: `${TEST_PROVIDER_PREFIX}Cash`,
      amount: '500.00',
      method: 'efectivo',
    });
    expect(r.ok).toBe(true);
  });

  it('accepts a backdated expenseDate inside the 60-day window', async () => {
    const tenDaysAgo = (() => {
      const today = todayInAppTZ();
      const [y, m, d] = today.split('-').map(Number) as [number, number, number];
      const anchor = new Date(Date.UTC(y, m - 1, d, 12));
      anchor.setUTCDate(anchor.getUTCDate() - 10);
      return anchor.toISOString().slice(0, 10);
    })();
    const r = await createExpense({
      provider: `${TEST_PROVIDER_PREFIX}Backdated`,
      amount: '300.00',
      method: 'efectivo',
      expenseDate: tenDaysAgo,
    });
    expect(r.ok).toBe(true);
  });

  it('rejects a backdated expenseDate outside the 60-day window (validation_error)', async () => {
    const r = await createExpense({
      provider: `${TEST_PROVIDER_PREFIX}OutOfRange`,
      amount: '300.00',
      method: 'efectivo',
      expenseDate: '2020-01-01',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('validation_error');
  });
});

describe('updateExpense', () => {
  it('returns forbidden for cajero', async () => {
    const seedId = await seed();
    vi.mocked(requireRole).mockRejectedValueOnce(new ForbiddenError());
    const r = await updateExpense(seedId, {
      provider: `${TEST_PROVIDER_PREFIX}A`,
      amount: '1500.00',
      method: 'efectivo',
    });
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('updates an existing expense', async () => {
    const seedId = await seed();
    const r = await updateExpense(seedId, {
      provider: `${TEST_PROVIDER_PREFIX}Updated`,
      amount: '2000.00',
      method: 'transferencia',
    });
    expect(r.ok).toBe(true);
    const row = await db.select().from(expenses).where(eq(expenses.id, seedId));
    expect(row[0]!.amount).toBe('2000.00');
    expect(row[0]!.method).toBe('transferencia');
  });

  it('returns not_found for unknown id', async () => {
    const r = await updateExpense('00000000-0000-0000-0000-000000000000', {
      provider: `${TEST_PROVIDER_PREFIX}NF`,
      amount: '100.00',
      method: 'efectivo',
    });
    expect(r).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('deleteExpense', () => {
  it('returns forbidden for cajero', async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new ForbiddenError());
    const r = await deleteExpense('00000000-0000-0000-0000-000000000000');
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('hard-deletes existing', async () => {
    const seedId = await seed();
    const r = await deleteExpense(seedId);
    expect(r.ok).toBe(true);
    const rows = await db.select().from(expenses).where(eq(expenses.id, seedId));
    expect(rows).toHaveLength(0);
  });

  it('returns not_found for unknown', async () => {
    const r = await deleteExpense('00000000-0000-0000-0000-000000000000');
    expect(r).toEqual({ ok: false, error: 'not_found' });
  });
});
