/**
 * Sale validators — shared between the client form (RHF resolver) and the
 * createSale Server Action.
 *
 * This is layer 1 of the sum-invariant defense (see 04-DATA-MODEL.md / D-005).
 * Layer 2 is the Server Action explicit re-parse; layer 3 is the DB trigger.
 *
 * Money is validated as a string matching MONEY_REGEX, parsed to Decimal for
 * arithmetic. Never a JS Number (D-003).
 */
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { MONEY_REGEX, safeDecimal } from '@/lib/money';
import { ALLOWED_INSTALLMENTS, PAYMENT_METHODS } from '@/db/schema';

const moneyString = z
  .string()
  .min(1, 'requerido')
  .regex(MONEY_REGEX, 'monto_invalido');

const installmentsLiteral = z.union([z.literal(1), z.literal(3), z.literal(6)]);

export const paymentInputSchema = z
  .object({
    method: z.enum(PAYMENT_METHODS),
    amount: moneyString,
    cardBrandId: z.number().int().positive().optional(),
    installments: installmentsLiteral.optional(),
  })
  .superRefine((data, ctx) => {
    // amount > 0 (skip if already flagged by .regex())
    const amount = safeDecimal(data.amount);
    if (amount && amount.lte(0)) {
      ctx.addIssue({
        code: 'custom',
        message: 'monto_no_positivo',
        path: ['amount'],
      });
    }

    // method ∈ {debito, credito} ⇒ cardBrandId required
    // method ∈ {efectivo, transferencia} ⇒ cardBrandId must be absent
    const needsCard = data.method === 'debito' || data.method === 'credito';
    if (needsCard && data.cardBrandId == null) {
      ctx.addIssue({
        code: 'custom',
        message: 'card_brand_requerido',
        path: ['cardBrandId'],
      });
    }
    if (!needsCard && data.cardBrandId != null) {
      ctx.addIssue({
        code: 'custom',
        message: 'card_brand_no_aplica',
        path: ['cardBrandId'],
      });
    }

    // method === credito ⇒ installments ∈ {1,3,6}
    // method !== credito ⇒ installments must be absent
    if (data.method === 'credito' && data.installments == null) {
      ctx.addIssue({
        code: 'custom',
        message: 'cuotas_requeridas',
        path: ['installments'],
      });
    }
    if (data.method !== 'credito' && data.installments != null) {
      ctx.addIssue({
        code: 'custom',
        message: 'cuotas_no_aplica',
        path: ['installments'],
      });
    }
  });

export const createSaleSchema = z
  .object({
    totalAmount: moneyString,
    observations: z.string().max(2000).optional(),
    payments: z.array(paymentInputSchema).min(1, 'al_menos_un_pago'),
  })
  .superRefine((data, ctx) => {
    const total = safeDecimal(data.totalAmount);
    if (total === null) return; // already flagged by .regex()

    if (total.lte(0)) {
      ctx.addIssue({
        code: 'custom',
        message: 'total_no_positivo',
        path: ['totalAmount'],
      });
      return;
    }

    // Sum invariant: SUM(payments[].amount) === totalAmount (Decimal equality).
    // If any payment amount is malformed, skip the sum check — the offending
    // row will already carry its own .regex() issue.
    let sum = new Decimal(0);
    for (const p of data.payments) {
      const amount = safeDecimal(p.amount);
      if (amount === null) return;
      sum = sum.plus(amount);
    }
    if (!sum.equals(total)) {
      ctx.addIssue({
        code: 'custom',
        message: 'sum_mismatch',
        path: ['payments'],
      });
    }
  });

export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type PaymentInput = z.infer<typeof paymentInputSchema>;

export const ALLOWED_INSTALLMENTS_LITERAL = ALLOWED_INSTALLMENTS;
