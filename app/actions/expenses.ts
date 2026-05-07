'use server';

/**
 * Server Actions for expenses (V1). All super_admin-only per
 * 08-SECURITY.md (cashier doesn't see expenses at all).
 */
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { ZodError } from 'zod';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

import { getDb } from '@/db';
import { expenses } from '@/db/schema';
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  type SessionUser,
} from '@/lib/auth';
import { APP_TZ } from '@/lib/dates';
import {
  createExpenseSchema,
  updateExpenseSchema,
  type CreateExpenseInput,
  type UpdateExpenseInput,
} from '@/lib/validators/expense';

export type ExpenseActionError =
  | 'unauthorized'
  | 'forbidden'
  | 'validation_error'
  | 'not_found'
  | 'fk_violation'
  | 'internal_error';

export type ExpenseActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ExpenseActionError; message?: string };

const REVALIDATE_PATHS = ['/gastos/lista'];

function mapZodError(e: ZodError): ExpenseActionResult<never> {
  return {
    ok: false,
    error: 'validation_error',
    message: e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
  };
}

function isFkViolation(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const err = e as { code?: unknown; cause?: { code?: unknown } };
  if (err.code === '23503') return true;
  if (err.cause && typeof err.cause === 'object' && err.cause.code === '23503') return true;
  return false;
}

function rebuildExpenseDate(originalUtc: Date, newDateStr: string): Date {
  const time = formatInTimeZone(originalUtc, APP_TZ, 'HH:mm:ss.SSS');
  return fromZonedTime(`${newDateStr}T${time}`, APP_TZ);
}

async function gateAdmin(): Promise<
  | { ok: false; error: 'unauthorized' | 'forbidden' }
  | { user: SessionUser }
> {
  try {
    const user = await requireRole(['super_admin']);
    return { user };
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: 'unauthorized' };
    if (e instanceof ForbiddenError) return { ok: false, error: 'forbidden' };
    throw e;
  }
}

// -----------------------------------------------------------------------------
// createExpense — super_admin only.
// -----------------------------------------------------------------------------

export async function createExpense(
  input: unknown,
): Promise<ExpenseActionResult<{ expenseId: string }>> {
  const gated = await gateAdmin();
  if ('ok' in gated && gated.ok === false) return gated;
  const user = (gated as { user: SessionUser }).user;

  let parsed: CreateExpenseInput;
  try {
    parsed = createExpenseSchema.parse(input);
  } catch (e) {
    if (e instanceof ZodError) return mapZodError(e);
    throw e;
  }

  const db = getDb();
  try {
    const inserted = await db
      .insert(expenses)
      .values({
        provider: parsed.provider,
        amount: parsed.amount,
        method: parsed.method,
        cardBrandId: parsed.cardBrandId ?? null,
        installments: parsed.installments ?? null,
        observations: parsed.observations ?? null,
        createdBy: user.userId,
      })
      .returning({ id: expenses.id });
    const head = inserted[0];
    if (!head) throw new Error('insert_returned_no_row');

    REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
    return { ok: true, data: { expenseId: head.id } };
  } catch (e) {
    if (isFkViolation(e)) {
      return {
        ok: false,
        error: 'fk_violation',
        message: 'La marca seleccionada ya no existe.',
      };
    }
    console.error('createExpense failed:', e);
    return { ok: false, error: 'internal_error' };
  }
}

// -----------------------------------------------------------------------------
// updateExpense — super_admin only.
// -----------------------------------------------------------------------------

export async function updateExpense(
  expenseId: string,
  input: unknown,
): Promise<ExpenseActionResult<{ expenseId: string }>> {
  const gated = await gateAdmin();
  if ('ok' in gated && gated.ok === false) return gated;

  if (typeof expenseId !== 'string' || expenseId.length === 0) {
    return { ok: false, error: 'validation_error', message: 'id_invalido' };
  }

  let parsed: UpdateExpenseInput;
  try {
    parsed = updateExpenseSchema.parse(input);
  } catch (e) {
    if (e instanceof ZodError) return mapZodError(e);
    throw e;
  }

  const db = getDb();

  const existing = await db
    .select({ id: expenses.id, expenseDate: expenses.expenseDate })
    .from(expenses)
    .where(eq(expenses.id, expenseId));
  const head = existing[0];
  if (!head) return { ok: false, error: 'not_found' };

  const newDate =
    parsed.expenseDate !== undefined
      ? rebuildExpenseDate(head.expenseDate, parsed.expenseDate)
      : head.expenseDate;

  try {
    await db
      .update(expenses)
      .set({
        provider: parsed.provider,
        amount: parsed.amount,
        method: parsed.method,
        cardBrandId: parsed.cardBrandId ?? null,
        installments: parsed.installments ?? null,
        observations: parsed.observations ?? null,
        expenseDate: newDate,
      })
      .where(eq(expenses.id, expenseId));

    REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
    revalidatePath(`/gastos/${expenseId}/editar`);
    return { ok: true, data: { expenseId } };
  } catch (e) {
    if (isFkViolation(e)) {
      return {
        ok: false,
        error: 'fk_violation',
        message: 'La marca seleccionada ya no existe.',
      };
    }
    console.error('updateExpense failed:', e);
    return { ok: false, error: 'internal_error' };
  }
}

// -----------------------------------------------------------------------------
// deleteExpense — super_admin only.
// -----------------------------------------------------------------------------

export async function deleteExpense(
  expenseId: string,
): Promise<ExpenseActionResult<void>> {
  const gated = await gateAdmin();
  if ('ok' in gated && gated.ok === false) return gated;

  if (typeof expenseId !== 'string' || expenseId.length === 0) {
    return { ok: false, error: 'validation_error', message: 'id_invalido' };
  }

  const db = getDb();
  try {
    const result = await db
      .delete(expenses)
      .where(eq(expenses.id, expenseId))
      .returning({ id: expenses.id });
    if (result.length === 0) {
      return { ok: false, error: 'not_found' };
    }
    REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
    return { ok: true, data: undefined };
  } catch (e) {
    console.error('deleteExpense failed:', e);
    return { ok: false, error: 'internal_error' };
  }
}
