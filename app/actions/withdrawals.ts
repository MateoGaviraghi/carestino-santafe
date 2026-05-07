'use server';

/**
 * Server Actions for withdrawals (V1).
 *
 * RBAC matrix (08-SECURITY.md):
 *   - createWithdrawal:  super_admin + cajero (cashier flow).
 *   - updateWithdrawal:  super_admin only.
 *   - deleteWithdrawal:  super_admin only.
 *
 * Withdrawals are single-row, so no sum invariant trigger. Only the CHECK
 * (amount > 0) plus zod-side range validation on withdrawalDate (D-016)
 * applies on edit.
 */
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { ZodError } from 'zod';

import { getDb } from '@/db';
import { withdrawals } from '@/db/schema';
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  type SessionUser,
} from '@/lib/auth';
import { APP_TZ } from '@/lib/dates';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import {
  createWithdrawalSchema,
  updateWithdrawalSchema,
  type CreateWithdrawalInput,
  type UpdateWithdrawalInput,
} from '@/lib/validators/withdrawal';

export type WithdrawalActionError =
  | 'unauthorized'
  | 'forbidden'
  | 'validation_error'
  | 'not_found'
  | 'fk_violation'
  | 'internal_error';

export type WithdrawalActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: WithdrawalActionError; message?: string };

const REVALIDATE_PATHS = [
  '/retiros/diaria',
  '/retiros/mensual',
  '/retiros/anual',
];

function mapZodError(e: ZodError): WithdrawalActionResult<never> {
  return {
    ok: false,
    error: 'validation_error',
    message: e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
  };
}

/** Postgres FK violation (e.g. inactive personId no longer exists). */
function isFkViolation(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const err = e as { code?: unknown; cause?: { code?: unknown } };
  if (err.code === '23503') return true;
  if (err.cause && typeof err.cause === 'object' && err.cause.code === '23503') return true;
  return false;
}

function rebuildWithdrawalDate(originalUtc: Date, newDateStr: string): Date {
  const time = formatInTimeZone(originalUtc, APP_TZ, 'HH:mm:ss.SSS');
  return fromZonedTime(`${newDateStr}T${time}`, APP_TZ);
}

// -----------------------------------------------------------------------------
// createWithdrawal — both roles.
// -----------------------------------------------------------------------------

export async function createWithdrawal(
  input: unknown,
): Promise<WithdrawalActionResult<{ withdrawalId: string }>> {
  let user: SessionUser;
  try {
    user = await requireRole(['super_admin', 'cajero']);
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: 'unauthorized' };
    if (e instanceof ForbiddenError) return { ok: false, error: 'forbidden' };
    throw e;
  }

  let parsed: CreateWithdrawalInput;
  try {
    parsed = createWithdrawalSchema.parse(input);
  } catch (e) {
    if (e instanceof ZodError) return mapZodError(e);
    throw e;
  }

  const db = getDb();
  try {
    const inserted = await db
      .insert(withdrawals)
      .values({
        amount: parsed.amount,
        personId: parsed.personId,
        createdBy: user.userId,
      })
      .returning({ id: withdrawals.id });
    const head = inserted[0];
    if (!head) throw new Error('insert_returned_no_row');

    REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
    return { ok: true, data: { withdrawalId: head.id } };
  } catch (e) {
    if (isFkViolation(e)) {
      return {
        ok: false,
        error: 'fk_violation',
        message: 'La persona seleccionada ya no existe.',
      };
    }
    console.error('createWithdrawal failed:', e);
    return { ok: false, error: 'internal_error' };
  }
}

// -----------------------------------------------------------------------------
// updateWithdrawal — super_admin only.
// -----------------------------------------------------------------------------

export async function updateWithdrawal(
  withdrawalId: string,
  input: unknown,
): Promise<WithdrawalActionResult<{ withdrawalId: string }>> {
  try {
    await requireRole(['super_admin']);
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: 'unauthorized' };
    if (e instanceof ForbiddenError) return { ok: false, error: 'forbidden' };
    throw e;
  }

  if (typeof withdrawalId !== 'string' || withdrawalId.length === 0) {
    return { ok: false, error: 'validation_error', message: 'id_invalido' };
  }

  let parsed: UpdateWithdrawalInput;
  try {
    parsed = updateWithdrawalSchema.parse(input);
  } catch (e) {
    if (e instanceof ZodError) return mapZodError(e);
    throw e;
  }

  const db = getDb();

  // Pre-check existence + read original withdrawal_date (needed when rebuilding
  // the timestamp on a date change).
  const existing = await db
    .select({
      id: withdrawals.id,
      withdrawalDate: withdrawals.withdrawalDate,
    })
    .from(withdrawals)
    .where(eq(withdrawals.id, withdrawalId));
  const head = existing[0];
  if (!head) return { ok: false, error: 'not_found' };

  const newDate =
    parsed.withdrawalDate !== undefined
      ? rebuildWithdrawalDate(head.withdrawalDate, parsed.withdrawalDate)
      : head.withdrawalDate;

  try {
    await db
      .update(withdrawals)
      .set({
        amount: parsed.amount,
        personId: parsed.personId,
        withdrawalDate: newDate,
      })
      .where(eq(withdrawals.id, withdrawalId));

    REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
    revalidatePath(`/retiros/${withdrawalId}/editar`);
    return { ok: true, data: { withdrawalId } };
  } catch (e) {
    if (isFkViolation(e)) {
      return {
        ok: false,
        error: 'fk_violation',
        message: 'La persona seleccionada ya no existe.',
      };
    }
    console.error('updateWithdrawal failed:', e);
    return { ok: false, error: 'internal_error' };
  }
}

// -----------------------------------------------------------------------------
// deleteWithdrawal — super_admin only.
// -----------------------------------------------------------------------------

export async function deleteWithdrawal(
  withdrawalId: string,
): Promise<WithdrawalActionResult<void>> {
  try {
    await requireRole(['super_admin']);
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: 'unauthorized' };
    if (e instanceof ForbiddenError) return { ok: false, error: 'forbidden' };
    throw e;
  }

  if (typeof withdrawalId !== 'string' || withdrawalId.length === 0) {
    return { ok: false, error: 'validation_error', message: 'id_invalido' };
  }

  const db = getDb();
  try {
    const result = await db
      .delete(withdrawals)
      .where(eq(withdrawals.id, withdrawalId))
      .returning({ id: withdrawals.id });
    if (result.length === 0) {
      return { ok: false, error: 'not_found' };
    }
    REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
    return { ok: true, data: undefined };
  } catch (e) {
    console.error('deleteWithdrawal failed:', e);
    return { ok: false, error: 'internal_error' };
  }
}
