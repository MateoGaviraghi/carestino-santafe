/**
 * Withdrawal validators — shared between the client form and the
 * Server Action. V1 (per 11-ROADMAP.md / 05-API-CONTRACTS.md).
 *
 * Single-row entity (no multi-method split, no sum invariant). Only the
 * monetary CHECK constraint + per-method/person coherence in the DB.
 *
 * D-016 applies: super_admin can move withdrawal_date up to 60 days back
 * on update; create is server-set to now().
 */
import { z } from 'zod';
import { MONEY_REGEX, safeDecimal } from '@/lib/money';
import { isValidDateString, isWithinDaysWindow } from '@/lib/dates';

export const WITHDRAWAL_DATE_EDIT_WINDOW_DAYS = 60;

const moneyString = z
  .string()
  .min(1, 'requerido')
  .regex(MONEY_REGEX, 'monto_invalido');

const personIdSchema = z.number().int().positive();

const editableDateSchema = z
  .string()
  .refine(isValidDateString, { message: 'fecha_invalida' })
  .refine((s) => isWithinDaysWindow(s, WITHDRAWAL_DATE_EDIT_WINDOW_DAYS), {
    message: 'fecha_fuera_de_rango',
  });

export const createWithdrawalSchema = z
  .object({
    amount: moneyString,
    personId: personIdSchema,
    withdrawalDate: editableDateSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const amount = safeDecimal(data.amount);
    if (amount && amount.lte(0)) {
      ctx.addIssue({
        code: 'custom',
        message: 'monto_no_positivo',
        path: ['amount'],
      });
    }
  });

export const updateWithdrawalSchema = z
  .object({
    amount: moneyString,
    personId: personIdSchema,
    withdrawalDate: editableDateSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const amount = safeDecimal(data.amount);
    if (amount && amount.lte(0)) {
      ctx.addIssue({
        code: 'custom',
        message: 'monto_no_positivo',
        path: ['amount'],
      });
    }
  });

export type CreateWithdrawalInput = z.infer<typeof createWithdrawalSchema>;
export type UpdateWithdrawalInput = z.infer<typeof updateWithdrawalSchema>;
