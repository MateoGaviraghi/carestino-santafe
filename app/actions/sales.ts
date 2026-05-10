'use server';

/**
 * Server Actions for sales.
 *
 * Layer-2 of the sum invariant defense (see 04-DATA-MODEL.md / D-005):
 *   - requireRole() blocks unauthorized callers BEFORE any DB work.
 *   - createSaleSchema.parse() / updateSaleSchema.parse() re-runs on the
 *     server (client is untrusted).
 *   - The DB trigger (layer 3, SQLSTATE P5001) is mapped here to the
 *     'sum_mismatch' ActionError so callers don't need to introspect
 *     Postgres errors.
 *
 * All mutations live in app/actions/* per 03-ARCHITECTURE.md.
 *
 * V1 actions added: updateSale, deleteSale (super_admin only — D-018).
 */
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { ZodError } from 'zod';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { getDb } from '@/db';
import { sales, salePayments } from '@/db/schema';
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  type SessionUser,
} from '@/lib/auth';
import { APP_TZ } from '@/lib/dates';
import {
  createSaleSchema,
  updateSaleSchema,
  type CreateSaleInput,
  type UpdateSaleInput,
} from '@/lib/validators/sale';

export type ActionError =
  | 'unauthorized'
  | 'forbidden'
  | 'validation_error'
  | 'sum_mismatch'
  | 'not_found'
  | 'internal_error';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError; message?: string };

/**
 * Returns true if `e` is the custom Postgres exception raised by
 * trg_assert_sale_payments_sum (SQLSTATE 'P5001').
 */
function isSumMismatchError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const err = e as { code?: unknown; cause?: { code?: unknown }; message?: unknown };
  if (err.code === 'P5001') return true;
  if (err.cause && typeof err.cause === 'object' && err.cause.code === 'P5001') return true;
  if (typeof err.message === 'string' && err.message.includes('sum_mismatch')) return true;
  return false;
}

function mapZodError(e: ZodError): ActionResult<never> {
  const issues = e.issues;
  const isSum = issues.some((i) => i.message === 'sum_mismatch');
  return {
    ok: false,
    error: isSum ? 'sum_mismatch' : 'validation_error',
    message: issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
  };
}

const REVALIDATE_PATHS = ['/ventas/diaria'];

// -----------------------------------------------------------------------------
// createSale — both roles.
// -----------------------------------------------------------------------------

export async function createSale(
  input: unknown,
): Promise<ActionResult<{ saleId: string }>> {
  let user: SessionUser;
  try {
    user = await requireRole(['super_admin', 'cajero']);
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: 'unauthorized' };
    if (e instanceof ForbiddenError) return { ok: false, error: 'forbidden' };
    throw e;
  }

  let parsed: CreateSaleInput;
  try {
    parsed = createSaleSchema.parse(input);
  } catch (e) {
    if (e instanceof ZodError) return mapZodError(e);
    throw e;
  }

  // Backdating gate: only super_admin can pick a custom saleDate (D-016
  // extended to CREATE). Cajero attempting to backdate is rejected — defense
  // in depth; the form hides the field for non-admins anyway.
  if (parsed.saleDate && user.role !== 'super_admin') {
    return { ok: false, error: 'forbidden' };
  }
  const customSaleDate = parsed.saleDate
    ? buildBackdatedSaleDate(parsed.saleDate)
    : null;

  const db = getDb();
  const saleId = crypto.randomUUID();
  try {
    await db.batch([
      db.insert(sales).values({
        id: saleId,
        totalAmount: parsed.totalAmount,
        observations: parsed.observations ?? null,
        createdBy: user.userId,
        ...(customSaleDate ? { saleDate: customSaleDate } : {}),
      }),
      db.insert(salePayments).values(
        parsed.payments.map((p) => ({
          saleId,
          method: p.method,
          amount: p.amount,
          cardBrandId: p.cardBrandId ?? null,
          installments: p.installments ?? null,
        })),
      ),
    ]);
    REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
    return { ok: true, data: { saleId } };
  } catch (e) {
    if (isSumMismatchError(e)) {
      return {
        ok: false,
        error: 'sum_mismatch',
        message: 'La suma de los pagos no coincide con el total.',
      };
    }
    console.error('createSale failed:', e);
    return { ok: false, error: 'internal_error' };
  }
}

// -----------------------------------------------------------------------------
// updateSale — super_admin only (V1 — D-018).
//
// Replaces all sale_payments rows for the given sale and updates the parent.
// The DEFERRABLE trigger evaluates the sum invariant at COMMIT, after both the
// new payments and the new total are in place.
//
// If `saleDate` (YYYY-MM-DD) is provided, the calendar day moves but the
// original wall-clock TIME of the sale is preserved (per D-016) — this avoids
// reshuffling the chronological order inside a day's planilla unless the admin
// genuinely intends a backdating, in which case they pick a different day.
// -----------------------------------------------------------------------------

/**
 * Build a UTC Date for a backdated sale: chosen calendar day in APP_TZ +
 * current wall-clock time in APP_TZ. Keeps the new row time-sorted
 * naturally inside the chosen day's planilla.
 */
function buildBackdatedSaleDate(dateStr: string): Date {
  const nowHms = formatInTimeZone(new Date(), APP_TZ, 'HH:mm:ss.SSS');
  return fromZonedTime(`${dateStr}T${nowHms}`, APP_TZ);
}

function rebuildSaleDate(originalUtc: Date, newDateStr: string): Date {
  // Preserve the wall-clock HH:mm:ss of the original (interpreted in APP_TZ),
  // attach it to newDateStr (interpreted in APP_TZ), convert back to UTC.
  const time = formatInTimeZone(originalUtc, APP_TZ, 'HH:mm:ss.SSS');
  return fromZonedTime(`${newDateStr}T${time}`, APP_TZ);
}

export async function updateSale(
  saleId: string,
  input: unknown,
): Promise<ActionResult<{ saleId: string }>> {
  // 1. RBAC — super_admin only (D-018).
  try {
    await requireRole(['super_admin']);
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: 'unauthorized' };
    if (e instanceof ForbiddenError) return { ok: false, error: 'forbidden' };
    throw e;
  }

  if (typeof saleId !== 'string' || saleId.length === 0) {
    return { ok: false, error: 'validation_error', message: 'id_invalido' };
  }

  let parsed: UpdateSaleInput;
  try {
    parsed = updateSaleSchema.parse(input);
  } catch (e) {
    if (e instanceof ZodError) return mapZodError(e);
    throw e;
  }

  const db = getDb();

  // Pre-check existence + read original sale_date (needed when rebuilding
  // the timestamp on a date change).
  const existing = await db
    .select({ id: sales.id, saleDate: sales.saleDate })
    .from(sales)
    .where(eq(sales.id, saleId));
  const head = existing[0];
  if (!head) return { ok: false, error: 'not_found' };

  const newSaleDate =
    parsed.saleDate !== undefined ? rebuildSaleDate(head.saleDate, parsed.saleDate) : head.saleDate;

  try {
    await db.batch([
      // Replace children.
      db.delete(salePayments).where(eq(salePayments.saleId, saleId)),
      db.insert(salePayments).values(
        parsed.payments.map((p) => ({
          saleId,
          method: p.method,
          amount: p.amount,
          cardBrandId: p.cardBrandId ?? null,
          installments: p.installments ?? null,
        })),
      ),
      // Update the parent.
      db
        .update(sales)
        .set({
          totalAmount: parsed.totalAmount,
          observations: parsed.observations ?? null,
          saleDate: newSaleDate,
          updatedAt: new Date(),
        })
        .where(eq(sales.id, saleId)),
    ]);
    REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
    revalidatePath(`/ventas/${saleId}/editar`);
    return { ok: true, data: { saleId } };
  } catch (e) {
    if (isSumMismatchError(e)) {
      return {
        ok: false,
        error: 'sum_mismatch',
        message: 'La suma de los pagos no coincide con el total.',
      };
    }
    console.error('updateSale failed:', e);
    return { ok: false, error: 'internal_error' };
  }
}

// -----------------------------------------------------------------------------
// deleteSale — super_admin only (V1 — D-018).
//
// Hard delete; sale_payments cascade via FK. Mistakes are recoverable for 7
// days through Neon PITR. The UI requires a typed-confirmation modal
// ("ELIMINAR") before invoking this action.
// -----------------------------------------------------------------------------

export async function deleteSale(saleId: string): Promise<ActionResult<void>> {
  try {
    await requireRole(['super_admin']);
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: 'unauthorized' };
    if (e instanceof ForbiddenError) return { ok: false, error: 'forbidden' };
    throw e;
  }

  if (typeof saleId !== 'string' || saleId.length === 0) {
    return { ok: false, error: 'validation_error', message: 'id_invalido' };
  }

  const db = getDb();
  try {
    const result = await db
      .delete(sales)
      .where(eq(sales.id, saleId))
      .returning({ id: sales.id });
    if (result.length === 0) {
      return { ok: false, error: 'not_found' };
    }
    REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
    return { ok: true, data: undefined };
  } catch (e) {
    console.error('deleteSale failed:', e);
    return { ok: false, error: 'internal_error' };
  }
}
