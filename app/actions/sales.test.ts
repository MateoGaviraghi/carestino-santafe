/**
 * Integration tests for the createSale Server Action.
 *
 * Mocks Clerk auth (requireRole) and Next cache, but hits the real Neon
 * branch. Uses a scoped test user so cleanup is safe to re-run.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { sales, salePayments, users, cardBrands } from '@/db/schema';
import { ForbiddenError, UnauthorizedError, type SessionUser } from '@/lib/auth';

const TEST_USER_ID = '__test_create_sale__';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return {
    ...actual,
    requireRole: vi.fn(),
  };
});

const { requireRole } = await import('@/lib/auth');
const { createSale, updateSale, deleteSale } = await import('./sales');
const { todayInAppTZ } = await import('@/lib/dates');

const db = getDb();
let visaId: number;

async function cleanup() {
  // Delete sales first (FK to users has no CASCADE); payments cascade with sales.
  await db.delete(sales).where(eq(sales.createdBy, TEST_USER_ID));
  await db.delete(users).where(eq(users.id, TEST_USER_ID));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(users).values({
    id: TEST_USER_ID,
    email: 'createsale@test.local',
    displayName: 'CreateSale Test',
    role: 'super_admin',
    isActive: true,
  });
  const visa = await db
    .select({ id: cardBrands.id })
    .from(cardBrands)
    .where(eq(cardBrands.name, 'Visa'));
  if (!visa[0]) throw new Error('Seed missing: Visa not found in card_brands');
  visaId = visa[0].id;
});

beforeEach(() => {
  vi.mocked(requireRole).mockReset();
  // Default: a valid signed-in super_admin matching TEST_USER_ID.
  vi.mocked(requireRole).mockResolvedValue({
    userId: TEST_USER_ID,
    role: 'super_admin',
  } satisfies SessionUser);
});

afterAll(cleanup);

describe('createSale', () => {
  it('returns unauthorized when there is no session', async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new UnauthorizedError());
    const r = await createSale({
      totalAmount: '100.00',
      payments: [{ method: 'efectivo', amount: '100.00' }],
    });
    expect(r).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('returns forbidden when role is not allowed', async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new ForbiddenError());
    const r = await createSale({
      totalAmount: '100.00',
      payments: [{ method: 'efectivo', amount: '100.00' }],
    });
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('returns validation_error for malformed input', async () => {
    const r = await createSale({
      totalAmount: 'not-a-number',
      payments: [{ method: 'efectivo', amount: '0' }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('validation_error');
  });

  it('returns sum_mismatch when payment total differs (caught by zod)', async () => {
    const r = await createSale({
      totalAmount: '1000.00',
      payments: [{ method: 'efectivo', amount: '900.00' }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('sum_mismatch');
  });

  it('inserts a single cash sale and returns the saleId', async () => {
    const r = await createSale({
      totalAmount: '500.00',
      observations: 'venta test 1',
      payments: [{ method: 'efectivo', amount: '500.00' }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const saleRow = await db.select().from(sales).where(eq(sales.id, r.data.saleId));
    expect(saleRow).toHaveLength(1);
    expect(saleRow[0]!.totalAmount).toBe('500.00');
    expect(saleRow[0]!.observations).toBe('venta test 1');
    expect(saleRow[0]!.createdBy).toBe(TEST_USER_ID);

    const paymentRows = await db
      .select()
      .from(salePayments)
      .where(eq(salePayments.saleId, r.data.saleId));
    expect(paymentRows).toHaveLength(1);
    expect(paymentRows[0]!.method).toBe('efectivo');
    expect(paymentRows[0]!.amount).toBe('500.00');
    expect(paymentRows[0]!.cardBrandId).toBeNull();
    expect(paymentRows[0]!.installments).toBeNull();
  });

  it('inserts a mixed-payment sale (cash + credito Visa 3 cuotas)', async () => {
    const r = await createSale({
      totalAmount: '1500.00',
      payments: [
        { method: 'efectivo', amount: '500.00' },
        { method: 'credito', amount: '1000.00', cardBrandId: visaId, installments: 3 },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const paymentRows = await db
      .select()
      .from(salePayments)
      .where(eq(salePayments.saleId, r.data.saleId));
    expect(paymentRows).toHaveLength(2);

    const cash = paymentRows.find((p) => p.method === 'efectivo');
    const credit = paymentRows.find((p) => p.method === 'credito');
    expect(cash?.amount).toBe('500.00');
    expect(cash?.cardBrandId).toBeNull();
    expect(credit?.amount).toBe('1000.00');
    expect(credit?.cardBrandId).toBe(visaId);
    expect(credit?.installments).toBe(3);
  });

  it('rejects malformed money string with validation_error', async () => {
    const r = await createSale({
      totalAmount: '12.345', // 3 decimals
      payments: [{ method: 'efectivo', amount: '12.345' }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('validation_error');
  });
});

// -----------------------------------------------------------------------------
// updateSale (super_admin only — D-018) + deleteSale.
// Each test seeds its own sale via createSale and exercises the update/delete
// path against real Neon, then cleanup wipes the test user via afterAll.
// -----------------------------------------------------------------------------

async function seedSale(): Promise<string> {
  const r = await createSale({
    totalAmount: '1000.00',
    payments: [{ method: 'efectivo', amount: '1000.00' }],
  });
  if (!r.ok) throw new Error(`seed failed: ${r.error}`);
  return r.data.saleId;
}

describe('updateSale', () => {
  it('returns unauthorized without session', async () => {
    const seedId = await seedSale();
    vi.mocked(requireRole).mockRejectedValueOnce(new UnauthorizedError());
    const r = await updateSale(seedId, {
      totalAmount: '2000.00',
      payments: [{ method: 'efectivo', amount: '2000.00' }],
    });
    expect(r).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('returns forbidden for cajero (super_admin only)', async () => {
    const seedId = await seedSale();
    vi.mocked(requireRole).mockRejectedValueOnce(new ForbiddenError());
    const r = await updateSale(seedId, {
      totalAmount: '2000.00',
      payments: [{ method: 'efectivo', amount: '2000.00' }],
    });
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('returns not_found when sale id does not exist', async () => {
    const r = await updateSale('00000000-0000-0000-0000-000000000000', {
      totalAmount: '500.00',
      payments: [{ method: 'efectivo', amount: '500.00' }],
    });
    expect(r).toEqual({ ok: false, error: 'not_found' });
  });

  it('replaces all payments and updates the total', async () => {
    const seedId = await seedSale();
    const r = await updateSale(seedId, {
      totalAmount: '1500.00',
      payments: [
        { method: 'efectivo', amount: '500.00' },
        { method: 'credito', amount: '1000.00', cardBrandId: visaId, installments: 3 },
      ],
    });
    expect(r.ok).toBe(true);

    const headRow = await db.select().from(sales).where(eq(sales.id, seedId));
    expect(headRow[0]!.totalAmount).toBe('1500.00');

    const paymentRows = await db
      .select()
      .from(salePayments)
      .where(eq(salePayments.saleId, seedId));
    expect(paymentRows).toHaveLength(2);
    expect(paymentRows.find((p) => p.method === 'credito')?.installments).toBe(3);
  });

  it('returns sum_mismatch via zod when payments do not match the total', async () => {
    const seedId = await seedSale();
    const r = await updateSale(seedId, {
      totalAmount: '1000.00',
      payments: [{ method: 'efectivo', amount: '999.00' }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('sum_mismatch');
  });

  it('accepts an editable saleDate inside the 60-day window', async () => {
    const seedId = await seedSale();
    const r = await updateSale(seedId, {
      totalAmount: '1000.00',
      payments: [{ method: 'efectivo', amount: '1000.00' }],
      saleDate: todayInAppTZ(),
    });
    expect(r.ok).toBe(true);
  });

  it('rejects a saleDate outside the 60-day window with validation_error', async () => {
    const seedId = await seedSale();
    const r = await updateSale(seedId, {
      totalAmount: '1000.00',
      payments: [{ method: 'efectivo', amount: '1000.00' }],
      saleDate: '2020-01-01',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('validation_error');
  });
});

describe('deleteSale', () => {
  it('returns unauthorized without session', async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new UnauthorizedError());
    const r = await deleteSale('00000000-0000-0000-0000-000000000000');
    expect(r).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('returns forbidden for cajero', async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new ForbiddenError());
    const r = await deleteSale('00000000-0000-0000-0000-000000000000');
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('returns not_found when the id does not exist', async () => {
    const r = await deleteSale('00000000-0000-0000-0000-000000000000');
    expect(r).toEqual({ ok: false, error: 'not_found' });
  });

  it('hard-deletes the sale and cascades to payments', async () => {
    const seedId = await seedSale();
    const r = await deleteSale(seedId);
    expect(r.ok).toBe(true);

    const heads = await db.select().from(sales).where(eq(sales.id, seedId));
    expect(heads).toHaveLength(0);

    const payments = await db
      .select()
      .from(salePayments)
      .where(eq(salePayments.saleId, seedId));
    expect(payments).toHaveLength(0);
  });
});
