import { describe, expect, it } from 'vitest';
import { createSaleSchema, paymentInputSchema } from './sale';

const ok = (input: unknown) => createSaleSchema.safeParse(input);
const okPayment = (input: unknown) => paymentInputSchema.safeParse(input);

describe('createSaleSchema', () => {
  it('accepts a single cash payment that matches total', () => {
    const r = ok({
      totalAmount: '1000.00',
      payments: [{ method: 'efectivo', amount: '1000.00' }],
    });
    expect(r.success).toBe(true);
  });

  it('accepts a mixed payment: cash + credit Visa 3 installments', () => {
    const r = ok({
      totalAmount: '1500.00',
      payments: [
        { method: 'efectivo', amount: '500.00' },
        { method: 'credito', amount: '1000.00', cardBrandId: 1, installments: 3 },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('accepts amounts with 1 decimal (e.g. 1234.5)', () => {
    const r = ok({
      totalAmount: '1234.5',
      payments: [{ method: 'transferencia', amount: '1234.5' }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects when sum of payments does not match total', () => {
    const r = ok({
      totalAmount: '1000.00',
      payments: [{ method: 'efectivo', amount: '999.99' }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'sum_mismatch')).toBe(true);
    }
  });

  it('rejects debito without cardBrandId', () => {
    const r = ok({
      totalAmount: '500.00',
      payments: [{ method: 'debito', amount: '500.00' }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some(
          (i) => i.path.includes('cardBrandId') && i.message === 'card_brand_requerido',
        ),
      ).toBe(true);
    }
  });

  it('rejects efectivo with cardBrandId', () => {
    const r = okPayment({ method: 'efectivo', amount: '100.00', cardBrandId: 1 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.message === 'card_brand_no_aplica'),
      ).toBe(true);
    }
  });

  it('rejects credito without installments', () => {
    const r = okPayment({
      method: 'credito',
      amount: '100.00',
      cardBrandId: 1,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'cuotas_requeridas')).toBe(true);
    }
  });

  it('rejects debito with installments', () => {
    const r = okPayment({
      method: 'debito',
      amount: '100.00',
      cardBrandId: 1,
      installments: 3,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'cuotas_no_aplica')).toBe(true);
    }
  });

  it('rejects installments outside {1,3,6}', () => {
    const r = okPayment({
      method: 'credito',
      amount: '100.00',
      cardBrandId: 1,
      installments: 12 as unknown as 1 | 3 | 6,
    });
    expect(r.success).toBe(false);
  });

  it('rejects amount = 0', () => {
    const r = okPayment({ method: 'efectivo', amount: '0' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'monto_no_positivo')).toBe(true);
    }
  });

  it('rejects total = 0', () => {
    const r = ok({
      totalAmount: '0',
      payments: [{ method: 'efectivo', amount: '0' }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'total_no_positivo')).toBe(true);
    }
  });

  it('rejects malformed money string', () => {
    const r = ok({
      totalAmount: '12.345', // 3 decimals
      payments: [{ method: 'efectivo', amount: '12.345' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty payments array', () => {
    const r = ok({ totalAmount: '100.00', payments: [] });
    expect(r.success).toBe(false);
  });

  it('handles 3-payment mix without floating-point drift (0.1+0.2+0.7=1.00)', () => {
    const r = ok({
      totalAmount: '1.00',
      payments: [
        { method: 'efectivo', amount: '0.10' },
        { method: 'transferencia', amount: '0.20' },
        { method: 'efectivo', amount: '0.70' },
      ],
    });
    expect(r.success).toBe(true);
  });
});
