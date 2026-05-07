'use server';

/**
 * Server Actions for sales.
 *
 * Layer-2 of the sum invariant defense (see 04-DATA-MODEL.md / D-005):
 *   - requireRole() blocks unauthorized callers BEFORE any DB work.
 *   - createSaleSchema.parse() re-runs on the server (client is untrusted).
 *   - The DB trigger (layer 3, SQLSTATE P5001) is mapped here to the
 *     'sum_mismatch' ActionError so callers don't need to introspect
 *     Postgres errors.
 *
 * All mutations live in app/actions/* per 03-ARCHITECTURE.md.
 */
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { getDb } from '@/db';
import { sales, salePayments } from '@/db/schema';
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  type SessionUser,
} from '@/lib/auth';
import { createSaleSchema } from '@/lib/validators/sale';

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
 *
 * Drizzle wraps the underlying Neon driver error, so we look at both
 * `code` and `cause.code`, and as a last resort the message text.
 */
function isSumMismatchError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const err = e as { code?: unknown; cause?: { code?: unknown }; message?: unknown };
  if (err.code === 'P5001') return true;
  if (err.cause && typeof err.cause === 'object' && err.cause.code === 'P5001') return true;
  if (typeof err.message === 'string' && err.message.includes('sum_mismatch')) return true;
  return false;
}

export async function createSale(
  input: unknown,
): Promise<ActionResult<{ saleId: string }>> {
  // 1. RBAC — both roles can create sales.
  let user: SessionUser;
  try {
    user = await requireRole(['super_admin', 'cajero']);
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: 'unauthorized' };
    if (e instanceof ForbiddenError) return { ok: false, error: 'forbidden' };
    throw e;
  }

  // 2. Zod re-validation (client cannot be trusted).
  let parsed;
  try {
    parsed = createSaleSchema.parse(input);
  } catch (e) {
    if (e instanceof ZodError) {
      const issues = e.issues;
      const isSum = issues.some((i) => i.message === 'sum_mismatch');
      return {
        ok: false,
        error: isSum ? 'sum_mismatch' : 'validation_error',
        message: issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      };
    }
    throw e;
  }

  // 3. Insert atomically. Drizzle's neon-http driver does NOT support
  //    db.transaction() — instead db.batch() ships every query in a single
  //    HTTP request to Neon's /sql/v1/transaction endpoint, which wraps
  //    them in BEGIN/COMMIT server-side. The DEFERRABLE trigger
  //    (trg_assert_sale_payments_sum) fires at COMMIT, after both the
  //    parent sale and the child payments are present.
  //
  //    We pre-generate the saleId in app code so the second insert can
  //    reference it without a chained RETURNING (batch queries can't pipe
  //    values between each other).
  const db = getDb();
  const saleId = crypto.randomUUID();
  try {
    await db.batch([
      db.insert(sales).values({
        id: saleId,
        totalAmount: parsed.totalAmount,
        observations: parsed.observations ?? null,
        createdBy: user.userId,
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

    // 4. Revalidate the daily sheet (Spanish URL per D-010).
    revalidatePath('/ventas/diaria');
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
