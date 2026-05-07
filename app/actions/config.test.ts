/**
 * Integration tests for the config Server Actions.
 *
 * Mocks Clerk auth + Next cache; hits real Neon. Cleanup is scoped to
 * names prefixed `__test_brand_` so a partial failure doesn't pollute
 * the seeded set.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, like } from 'drizzle-orm';

import { getDb } from '@/db';
import { cardBrands } from '@/db/schema';
import {
  ForbiddenError,
  UnauthorizedError,
  type SessionUser,
} from '@/lib/auth';

const TEST_PREFIX = 'Test-Brand-';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, requireRole: vi.fn() };
});

const { requireRole } = await import('@/lib/auth');
const { addCardBrand, setCardBrandActive } = await import('./config');

const db = getDb();

async function cleanup() {
  await db.delete(cardBrands).where(like(cardBrands.name, `${TEST_PREFIX}%`));
}

beforeEach(async () => {
  vi.mocked(requireRole).mockReset();
  vi.mocked(requireRole).mockResolvedValue({
    userId: 'u_admin',
    role: 'super_admin',
  } satisfies SessionUser);
  await cleanup();
});

afterAll(cleanup);

describe('addCardBrand', () => {
  it('returns unauthorized when not signed in', async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new UnauthorizedError());
    const r = await addCardBrand(`${TEST_PREFIX}A`);
    expect(r).toEqual({ ok: false, error: 'unauthorized' });
  });

  it('returns forbidden when role is not super_admin', async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new ForbiddenError());
    const r = await addCardBrand(`${TEST_PREFIX}A`);
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });

  it('returns validation_error for empty / disallowed names', async () => {
    expect((await addCardBrand('')).ok).toBe(false);
    expect((await addCardBrand('   ')).ok).toBe(false);
    const bad = await addCardBrand('<script>');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe('validation_error');
  });

  it('inserts a brand and returns its id', async () => {
    const name = `${TEST_PREFIX}Cabal`;
    const r = await addCardBrand(name);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.id).toBeGreaterThan(0);
    const rows = await db.select().from(cardBrands).where(eq(cardBrands.name, name));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.isActive).toBe(true);
  });

  it('rejects a duplicate name with already_exists', async () => {
    const name = `${TEST_PREFIX}Dup`;
    await addCardBrand(name);
    const second = await addCardBrand(name);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe('already_exists');
  });
});

describe('setCardBrandActive', () => {
  it('flips is_active on an existing brand', async () => {
    const name = `${TEST_PREFIX}Toggle`;
    const created = await addCardBrand(name);
    if (!created.ok) throw new Error('seed insert failed');
    const id = created.data.id;

    const off = await setCardBrandActive(id, false);
    expect(off.ok).toBe(true);
    let row = await db.select().from(cardBrands).where(eq(cardBrands.id, id));
    expect(row[0]!.isActive).toBe(false);

    const on = await setCardBrandActive(id, true);
    expect(on.ok).toBe(true);
    row = await db.select().from(cardBrands).where(eq(cardBrands.id, id));
    expect(row[0]!.isActive).toBe(true);
  });

  it('returns not_found for an id that does not exist', async () => {
    const r = await setCardBrandActive(999999999, false);
    expect(r).toEqual({ ok: false, error: 'not_found' });
  });

  it('returns validation_error for invalid id values', async () => {
    expect((await setCardBrandActive(0, true)).ok).toBe(false);
    expect((await setCardBrandActive(-1, true)).ok).toBe(false);
    expect((await setCardBrandActive(1.5, true)).ok).toBe(false);
  });

  it('is forbidden for non-admin roles', async () => {
    vi.mocked(requireRole).mockRejectedValueOnce(new ForbiddenError());
    const r = await setCardBrandActive(1, true);
    expect(r).toEqual({ ok: false, error: 'forbidden' });
  });
});
