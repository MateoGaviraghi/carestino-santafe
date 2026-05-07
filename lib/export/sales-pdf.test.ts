import { describe, expect, it } from 'vitest';
import { buildSalesDailyPdf, salesDailyPdfFilename } from './sales-pdf';
import type { DailySale, DailyTotals } from '@/lib/queries/sales';

const TOTALS: DailyTotals = {
  salesCount: 2,
  salesTotal: '1500.00',
  perMethod: {
    efectivo: '500.00',
    transferencia: '0',
    debito: '0',
    credito1: '0',
    credito3: '1000.00',
    credito6: '0',
  },
};

const SALES: DailySale[] = [
  {
    id: 'sale-1',
    totalAmount: '1500.00',
    observations: 'venta test',
    saleDate: new Date('2026-04-01T17:00:00Z'),
    createdBy: 'u1',
    payments: [
      {
        id: 'p1',
        method: 'efectivo',
        amount: '500.00',
        cardBrandId: null,
        cardBrandName: null,
        installments: null,
      },
      {
        id: 'p2',
        method: 'credito',
        amount: '1000.00',
        cardBrandId: 1,
        cardBrandName: 'Visa',
        installments: 3,
      },
    ],
  },
];

const EMPTY_TOTALS: DailyTotals = {
  salesCount: 0,
  salesTotal: '0',
  perMethod: {
    efectivo: '0',
    transferencia: '0',
    debito: '0',
    credito1: '0',
    credito3: '0',
    credito6: '0',
  },
};

function pdfMagic(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes.subarray(0, 5));
}

describe('salesDailyPdfFilename', () => {
  it('builds the expected filename', () => {
    expect(salesDailyPdfFilename('2026-04-01')).toBe('ventas-diaria-2026-04-01.pdf');
  });
});

describe('buildSalesDailyPdf', () => {
  it('produces a non-empty PDF starting with the %PDF- magic header', () => {
    const bytes = buildSalesDailyPdf('2026-04-01', TOTALS, SALES);
    expect(bytes.byteLength).toBeGreaterThan(1000); // anything reasonable
    expect(pdfMagic(bytes)).toBe('%PDF-');
  });

  it('handles a no-sales day (renders an empty-state line, not crashes)', () => {
    const bytes = buildSalesDailyPdf('2025-01-01', EMPTY_TOTALS, []);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(pdfMagic(bytes)).toBe('%PDF-');
  });

  it('handles a many-sales day without throwing (pagination smoke)', () => {
    // Synthesize 60 sales with varying methods so autoTable spills to a 2nd page.
    const many: DailySale[] = Array.from({ length: 60 }).map((_, i) => ({
      id: `sale-${i}`,
      totalAmount: '100.00',
      observations: i % 5 === 0 ? `obs ${i}` : null,
      saleDate: new Date(`2026-04-01T${String(13 + (i % 8)).padStart(2, '0')}:00:00Z`),
      createdBy: 'u1',
      payments: [
        {
          id: `p${i}`,
          method: 'efectivo',
          amount: '100.00',
          cardBrandId: null,
          cardBrandName: null,
          installments: null,
        },
      ],
    }));
    const bytes = buildSalesDailyPdf('2026-04-01', TOTALS, many);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(pdfMagic(bytes)).toBe('%PDF-');
  });
});
