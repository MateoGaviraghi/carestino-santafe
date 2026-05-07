import { describe, expect, it } from 'vitest';
import { createExpenseSchema, updateExpenseSchema } from './expense';
import { todayInAppTZ } from '@/lib/dates';

const valid = { provider: 'Acme', amount: '500.00', method: 'efectivo' as const };

describe('createExpenseSchema', () => {
  it('accepts a cash expense', () => {
    expect(createExpenseSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a transferencia expense', () => {
    expect(
      createExpenseSchema.safeParse({ ...valid, method: 'transferencia' }).success,
    ).toBe(true);
  });

  it('accepts a credito expense with brand and installments', () => {
    expect(
      createExpenseSchema.safeParse({
        ...valid,
        method: 'credito',
        cardBrandId: 1,
        installments: 3,
      }).success,
    ).toBe(true);
  });

  it('rejects credito without brand', () => {
    const r = createExpenseSchema.safeParse({
      ...valid,
      method: 'credito',
      installments: 3,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'card_brand_requerido')).toBe(true);
    }
  });

  it('rejects credito without installments', () => {
    const r = createExpenseSchema.safeParse({
      ...valid,
      method: 'credito',
      cardBrandId: 1,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'cuotas_requeridas')).toBe(true);
    }
  });

  it('rejects efectivo with brand', () => {
    const r = createExpenseSchema.safeParse({ ...valid, cardBrandId: 1 });
    expect(r.success).toBe(false);
  });

  it('rejects debito with installments', () => {
    const r = createExpenseSchema.safeParse({
      ...valid,
      method: 'debito',
      cardBrandId: 1,
      installments: 3,
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty provider', () => {
    expect(createExpenseSchema.safeParse({ ...valid, provider: '' }).success).toBe(false);
    expect(createExpenseSchema.safeParse({ ...valid, provider: '   ' }).success).toBe(false);
  });

  it('rejects amount = 0', () => {
    expect(createExpenseSchema.safeParse({ ...valid, amount: '0' }).success).toBe(false);
  });
});

describe('updateExpenseSchema', () => {
  it('accepts an in-window expenseDate', () => {
    expect(
      updateExpenseSchema.safeParse({ ...valid, expenseDate: todayInAppTZ() }).success,
    ).toBe(true);
  });

  it('rejects an out-of-window expenseDate', () => {
    const r = updateExpenseSchema.safeParse({ ...valid, expenseDate: '2020-01-01' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'fecha_fuera_de_rango')).toBe(true);
    }
  });
});
