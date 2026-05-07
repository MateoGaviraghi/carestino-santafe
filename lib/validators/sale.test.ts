import { describe, expect, it } from 'vitest';
import {
  createSaleSchema,
  paymentInputSchema,
  updateSaleSchema,
} from './sale';
import { todayInAppTZ } from '@/lib/dates';

const ok = (input: unknown) => createSaleSchema.safeParse(input);
const okUpdate = (input: unknown) => updateSaleSchema.safeParse(input);
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

describe('updateSaleSchema', () => {
  const validPayment = { method: 'efectivo', amount: '1000.00' } as const;

  it('accepts the same shape as createSale (no saleDate)', () => {
    const r = okUpdate({ totalAmount: '1000.00', payments: [validPayment] });
    expect(r.success).toBe(true);
  });

  it('accepts an explicit saleDate inside the 60-day window', () => {
    const r = okUpdate({
      totalAmount: '1000.00',
      payments: [validPayment],
      saleDate: todayInAppTZ(),
    });
    expect(r.success).toBe(true);
  });

  it('rejects a saleDate older than 60 days', () => {
    const today = todayInAppTZ();
    const [y, m, d] = today.split('-').map(Number) as [number, number, number];
    const past = new Date(Date.UTC(y, m - 1, d - 90, 12));
    const pastStr = past.toISOString().slice(0, 10);
    const r = okUpdate({
      totalAmount: '1000.00',
      payments: [validPayment],
      saleDate: pastStr,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'fecha_fuera_de_rango')).toBe(true);
    }
  });

  it('rejects a saleDate in the future', () => {
    const today = todayInAppTZ();
    const [y, m, d] = today.split('-').map(Number) as [number, number, number];
    const future = new Date(Date.UTC(y, m - 1, d + 1, 12));
    const futureStr = future.toISOString().slice(0, 10);
    const r = okUpdate({
      totalAmount: '1000.00',
      payments: [validPayment],
      saleDate: futureStr,
    });
    expect(r.success).toBe(false);
  });

  it('rejects a malformed saleDate', () => {
    const r = okUpdate({
      totalAmount: '1000.00',
      payments: [validPayment],
      saleDate: '2026/05/07',
    });
    expect(r.success).toBe(false);
  });

  it('keeps the sum invariant in edit mode', () => {
    const r = okUpdate({
      totalAmount: '1000.00',
      payments: [{ method: 'efectivo', amount: '999.00' }],
      saleDate: todayInAppTZ(),
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'sum_mismatch')).toBe(true);
    }
  });
});
