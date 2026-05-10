/**
 * Expense validators (V1) — single-row entity. Same method/card/installments
 * coherence rules as sale_payments (per 04-DATA-MODEL.md).
 *
 * D-016 applies on update: super_admin can move expense_date up to 60 days
 * back; create is server-set to now().
 */
import { z } from 'zod';
import { MONEY_REGEX, safeDecimal } from '@/lib/money';
import { isValidDateString, isWithinDaysWindow } from '@/lib/dates';
import { ALLOWED_INSTALLMENTS, PAYMENT_METHODS } from '@/db/schema';

export const EXPENSE_DATE_EDIT_WINDOW_DAYS = 60;

const moneyString = z
  .string()
  .min(1, 'requerido')
  .regex(MONEY_REGEX, 'monto_invalido');

const installmentsLiteral = z.union([z.literal(1), z.literal(3), z.literal(6)]);

const baseExpenseShape = {
  provider: z.string().trim().min(1, 'requerido').max(200, 'demasiado_largo'),
  amount: moneyString,
  method: z.enum(PAYMENT_METHODS),
  cardBrandId: z.number().int().positive().optional(),
  installments: installmentsLiteral.optional(),
  observations: z.string().max(2000).optional(),
};

function applyCoherenceChecks(
  data: {
    method: (typeof PAYMENT_METHODS)[number];
    cardBrandId?: number;
    installments?: 1 | 3 | 6;
    amount: string;
  },
  ctx: z.RefinementCtx,
) {
  const amount = safeDecimal(data.amount);
  if (amount && amount.lte(0)) {
    ctx.addIssue({ code: 'custom', message: 'monto_no_positivo', path: ['amount'] });
  }

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
}

const editableDateSchema = z
  .string()
  .refine(isValidDateString, { message: 'fecha_invalida' })
  .refine((s) => isWithinDaysWindow(s, EXPENSE_DATE_EDIT_WINDOW_DAYS), {
    message: 'fecha_fuera_de_rango',
  });

export const createExpenseSchema = z
  .object({ ...baseExpenseShape, expenseDate: editableDateSchema.optional() })
  .superRefine(applyCoherenceChecks);

export const updateExpenseSchema = z
  .object({ ...baseExpenseShape, expenseDate: editableDateSchema.optional() })
  .superRefine(applyCoherenceChecks);

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const ALLOWED_INSTALLMENTS_LITERAL = ALLOWED_INSTALLMENTS;
