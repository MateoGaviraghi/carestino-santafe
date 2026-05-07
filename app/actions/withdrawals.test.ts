/**
 * Integration tests for withdrawal Server Actions — RBAC + happy path.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import {
  withdrawalPersons,
  withdrawals,
  users,
} from '@/db/schema';
import {
  ForbiddenError,
  UnauthorizedError,
  type SessionUser,
} from '@/lib/auth';

const TEST_USER_ID = '__test_withdrawal_user__';
const TEST_PERSON_NAME = 'Test-Person-Withdrawals';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, requireRole: vi.fn() };
});

const { requireRole } = await import('@/lib/auth');
const { createWithdrawal, updateWithdrawal, deleteWithdrawal } = await import(
  './withdrawals'
);
const { todayInAppTZ } = await import('@/lib/dates');

const db = getDb();
let testPersonId: number;

async function cleanup() {
  await db.delete(withdrawals).where(eq(withdrawals.createdBy, TEST_USER_ID));
  await db.delete(users).where(eq(users.id, TEST_USER_ID));
  await db
    .delete(withdrawalPersons)
    .where(eq(withdrawalPersons.name, TEST_PERSON_NAME));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(users).values({
    id: TEST_USER_ID,
    email: 'w@local',
    displayName: 'Withdrawal Test',
    role: 'super_admin',
    isActive: true,
  });
  const p = await db
    .insert(withdrawalPersons)
    .values({ name: TEST_PERSON_NAME, isActive: true })
    .returning({ id: withdrawalPersons.id });
  testPersonId = p[0]!.id;
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
  const r = await createWithdrawal({ amount: '1000.00', personId: testPersonId });
  if (!r.ok) throw new Error(`seed failed: ${r.error}`);
  return r.data.withdrawalId;
}

describe('createWithdrawal', () => {
  it('accepts both roles (super_admin path)', async () => {
    const r = await createWithdrawal({ amount: '500.00', personId: testPersonId });
    expect(r.ok).toBe(true);
  });

  it('accepts both roles (cajero path)', async () => {
    vi.mocked(requireRole).mockResolvedValueOnce({
      userId: TEST_USER_ID,
      role: 'cajero',
    } satisfies SessionUser);
    const r = await createWithdrawal({ amount: '500.00', personId: testPersonId });
    expect(r.ok).toBe(true);
  });

  it('returns unauthorized without session', async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new UnauthorizedError());
    const r = await createWithdrawal({ amount: '500.00', personId: testPersonId });
    expect(r).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('returns validation_error for malformed input', async () => {
    const r = await createWithdrawal({ amount: 'foo', personId: testPersonId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('validation_error');
  });
});

describe('updateWithdrawal — super_admin only', () => {
  it('returns forbidden for cajero', async () => {
    const seedId = await seed();
    vi.mocked(requireRole).mockRejectedValueOnce(new ForbiddenError());
    const r = await updateWithdrawal(seedId, {
      amount: '2000.00',
      personId: testPersonId,
    });
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('updates amount and personId successfully', async () => {
    const seedId = await seed();
    const r = await updateWithdrawal(seedId, {
      amount: '2500.00',
      personId: testPersonId,
    });
    expect(r.ok).toBe(true);
    const row = await db.select().from(withdrawals).where(eq(withdrawals.id, seedId));
    expect(row[0]!.amount).toBe('2500.00');
  });

  it('returns not_found for an unknown id', async () => {
    const r = await updateWithdrawal('00000000-0000-0000-0000-000000000000', {
      amount: '100.00',
      personId: testPersonId,
    });
    expect(r).toEqual({ ok: false, error: 'not_found' });
  });

  it('accepts an in-window withdrawalDate', async () => {
    const seedId = await seed();
    const r = await updateWithdrawal(seedId, {
      amount: '1000.00',
      personId: testPersonId,
      withdrawalDate: todayInAppTZ(),
    });
    expect(r.ok).toBe(true);
  });

  it('rejects an out-of-window withdrawalDate', async () => {
    const seedId = await seed();
    const r = await updateWithdrawal(seedId, {
      amount: '1000.00',
      personId: testPersonId,
      withdrawalDate: '2020-01-01',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('validation_error');
  });
});

describe('deleteWithdrawal — super_admin only', () => {
  it('returns forbidden for cajero', async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new ForbiddenError());
    const r = await deleteWithdrawal('00000000-0000-0000-0000-000000000000');
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('hard-deletes an existing withdrawal', async () => {
    const seedId = await seed();
    const r = await deleteWithdrawal(seedId);
    expect(r.ok).toBe(true);
    const row = await db.select().from(withdrawals).where(eq(withdrawals.id, seedId));
    expect(row).toHaveLength(0);
  });

  it('returns not_found for an unknown id', async () => {
    const r = await deleteWithdrawal('00000000-0000-0000-0000-000000000000');
    expect(r).toEqual({ ok: false, error: 'not_found' });
  });
});
