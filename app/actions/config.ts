'use server';

/**
 * Configuration Server Actions — super_admin only.
 *
 * MVP scope: card brands. (Withdrawal persons + employee mgmt arrive in V1.)
 */
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { ZodError } from 'zod';

import { getDb } from '@/db';
import { cardBrands, withdrawalPersons } from '@/db/schema';
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
} from '@/lib/auth';
import { cardBrandNameSchema } from '@/lib/validators/card-brand';

export type ConfigError =
  | 'unauthorized'
  | 'forbidden'
  | 'validation_error'
  | 'already_exists'
  | 'not_found'
  | 'internal_error';

export type ConfigResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ConfigError; message?: string };

const REVALIDATE_PATHS = [
  '/configuracion/marcas-de-tarjeta',
  '/ventas/nueva', // sale form's brand dropdown depends on the active list
];

const WITHDRAWAL_PERSON_REVALIDATE_PATHS = [
  '/configuracion/personas-que-retiran',
  '/retiros/nuevo', // withdrawal form's person dropdown depends on the active list
];

/** Postgres SQLSTATE 23505 (unique_violation), surfaced through Drizzle/Neon. */
function isUniqueViolation(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const err = e as { code?: unknown; cause?: { code?: unknown } };
  if (err.code === '23505') return true;
  if (err.cause && typeof err.cause === 'object' && err.cause.code === '23505') return true;
  return false;
}

type GateError = { ok: false; error: ConfigError; message?: string };

async function gateAdmin(): Promise<GateError | null> {
  try {
    await requireRole(['super_admin']);
    return null;
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: 'unauthorized' };
    if (e instanceof ForbiddenError) return { ok: false, error: 'forbidden' };
    throw e;
  }
}

export async function addCardBrand(name: string): Promise<ConfigResult<{ id: number }>> {
  const gated = await gateAdmin();
  if (gated) return gated;

  let parsed: string;
  try {
    parsed = cardBrandNameSchema.parse(name);
  } catch (e) {
    if (e instanceof ZodError) {
      return {
        ok: false,
        error: 'validation_error',
        message: e.issues.map((i) => i.message).join('; '),
      };
    }
    throw e;
  }

  const db = getDb();
  try {
    const inserted = await db
      .insert(cardBrands)
      .values({ name: parsed, isActive: true })
      .returning({ id: cardBrands.id });
    const head = inserted[0];
    if (!head) throw new Error('insert_returned_no_row');
    REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
    return { ok: true, data: { id: head.id } };
  } catch (e) {
    if (isUniqueViolation(e)) {
      return {
        ok: false,
        error: 'already_exists',
        message: `Ya existe una marca con el nombre "${parsed}".`,
      };
    }
    console.error('addCardBrand failed:', e);
    return { ok: false, error: 'internal_error' };
  }
}

/**
 * Form-action wrapper for useActionState. Reads `name` from FormData and
 * delegates to addCardBrand; the previous state is ignored.
 */
export async function addCardBrandFormAction(
  _prev: ConfigResult<{ id: number }> | null,
  formData: FormData,
): Promise<ConfigResult<{ id: number }>> {
  const name = formData.get('name')?.toString() ?? '';
  return addCardBrand(name);
}

export async function setCardBrandActive(
  id: number,
  isActive: boolean,
): Promise<ConfigResult<void>> {
  const gated = await gateAdmin();
  if (gated) return gated;

  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: 'validation_error', message: 'id_invalido' };
  }

  const db = getDb();
  try {
    const updated = await db
      .update(cardBrands)
      .set({ isActive })
      .where(eq(cardBrands.id, id))
      .returning({ id: cardBrands.id });
    if (updated.length === 0) {
      return { ok: false, error: 'not_found' };
    }
    REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
    return { ok: true, data: undefined };
  } catch (e) {
    console.error('setCardBrandActive failed:', e);
    return { ok: false, error: 'internal_error' };
  }
}

export async function renameCardBrand(
  id: number,
  name: string,
): Promise<ConfigResult<void>> {
  const gated = await gateAdmin();
  if (gated) return gated;

  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: 'validation_error', message: 'id_invalido' };
  }

  let parsed: string;
  try {
    parsed = cardBrandNameSchema.parse(name);
  } catch (e) {
    if (e instanceof ZodError) {
      return {
        ok: false,
        error: 'validation_error',
        message: e.issues.map((i) => i.message).join('; '),
      };
    }
    throw e;
  }

  const db = getDb();
  try {
    const updated = await db
      .update(cardBrands)
      .set({ name: parsed })
      .where(eq(cardBrands.id, id))
      .returning({ id: cardBrands.id });
    if (updated.length === 0) {
      return { ok: false, error: 'not_found' };
    }
    REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
    return { ok: true, data: undefined };
  } catch (e) {
    if (isUniqueViolation(e)) {
      return {
        ok: false,
        error: 'already_exists',
        message: `Ya existe una marca con el nombre "${parsed}".`,
      };
    }
    console.error('renameCardBrand failed:', e);
    return { ok: false, error: 'internal_error' };
  }
}

// -----------------------------------------------------------------------------
// Withdrawal persons (V1) — same shape as card brands.
// -----------------------------------------------------------------------------

export async function addWithdrawalPerson(
  name: string,
): Promise<ConfigResult<{ id: number }>> {
  const gated = await gateAdmin();
  if (gated) return gated;

  let parsed: string;
  try {
    parsed = cardBrandNameSchema.parse(name); // same shape rule as brand names
  } catch (e) {
    if (e instanceof ZodError) {
      return {
        ok: false,
        error: 'validation_error',
        message: e.issues.map((i) => i.message).join('; '),
      };
    }
    throw e;
  }

  const db = getDb();
  try {
    const inserted = await db
      .insert(withdrawalPersons)
      .values({ name: parsed, isActive: true })
      .returning({ id: withdrawalPersons.id });
    const head = inserted[0];
    if (!head) throw new Error('insert_returned_no_row');
    WITHDRAWAL_PERSON_REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
    return { ok: true, data: { id: head.id } };
  } catch (e) {
    if (isUniqueViolation(e)) {
      return {
        ok: false,
        error: 'already_exists',
        message: `Ya existe una persona con el nombre "${parsed}".`,
      };
    }
    console.error('addWithdrawalPerson failed:', e);
    return { ok: false, error: 'internal_error' };
  }
}

export async function addWithdrawalPersonFormAction(
  _prev: ConfigResult<{ id: number }> | null,
  formData: FormData,
): Promise<ConfigResult<{ id: number }>> {
  const name = formData.get('name')?.toString() ?? '';
  return addWithdrawalPerson(name);
}

export async function setWithdrawalPersonActive(
  id: number,
  isActive: boolean,
): Promise<ConfigResult<void>> {
  const gated = await gateAdmin();
  if (gated) return gated;

  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: 'validation_error', message: 'id_invalido' };
  }

  const db = getDb();
  try {
    const updated = await db
      .update(withdrawalPersons)
      .set({ isActive })
      .where(eq(withdrawalPersons.id, id))
      .returning({ id: withdrawalPersons.id });
    if (updated.length === 0) {
      return { ok: false, error: 'not_found' };
    }
    WITHDRAWAL_PERSON_REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
    return { ok: true, data: undefined };
  } catch (e) {
    console.error('setWithdrawalPersonActive failed:', e);
    return { ok: false, error: 'internal_error' };
  }
}

export async function renameWithdrawalPerson(
  id: number,
  name: string,
): Promise<ConfigResult<void>> {
  const gated = await gateAdmin();
  if (gated) return gated;

  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: 'validation_error', message: 'id_invalido' };
  }

  let parsed: string;
  try {
    parsed = cardBrandNameSchema.parse(name);
  } catch (e) {
    if (e instanceof ZodError) {
      return {
        ok: false,
        error: 'validation_error',
        message: e.issues.map((i) => i.message).join('; '),
      };
    }
    throw e;
  }

  const db = getDb();
  try {
    const updated = await db
      .update(withdrawalPersons)
      .set({ name: parsed })
      .where(eq(withdrawalPersons.id, id))
      .returning({ id: withdrawalPersons.id });
    if (updated.length === 0) {
      return { ok: false, error: 'not_found' };
    }
    WITHDRAWAL_PERSON_REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
    return { ok: true, data: undefined };
  } catch (e) {
    if (isUniqueViolation(e)) {
      return {
        ok: false,
        error: 'already_exists',
        message: `Ya existe una persona con el nombre "${parsed}".`,
      };
    }
    console.error('renameWithdrawalPerson failed:', e);
    return { ok: false, error: 'internal_error' };
  }
}
