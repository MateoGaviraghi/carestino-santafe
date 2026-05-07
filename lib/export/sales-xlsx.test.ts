import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { buildSalesDailyXlsx, salesDailyFilename } from './sales-xlsx';
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

describe('salesDailyFilename', () => {
  it('builds the expected filename', () => {
    expect(salesDailyFilename('2026-04-01')).toBe('ventas-diaria-2026-04-01.xlsx');
  });
});

function readCell(sheet: XLSX.WorkSheet, ref: string): unknown {
  return sheet[ref]?.v;
}

describe('buildSalesDailyXlsx — Resumen sheet', () => {
  it('writes the title block and the per-method totals', async () => {
    const bytes = await buildSalesDailyXlsx('2026-04-01', TOTALS, SALES);
    const wb = XLSX.read(bytes, { type: 'array' });
    expect(wb.SheetNames).toEqual(['Resumen', 'Ventas']);

    const sheet = wb.Sheets['Resumen']!;
    expect(String(readCell(sheet, 'A1'))).toContain('Carestino Santa Fe');
    expect(readCell(sheet, 'A2')).toBe('Planilla diaria');
    expect(String(readCell(sheet, 'A3')).toLowerCase()).toContain('fecha');

    expect(readCell(sheet, 'A5')).toBe('Concepto');
    expect(readCell(sheet, 'B5')).toBe('Monto');

    expect(readCell(sheet, 'A6')).toBe('Cantidad de ventas');
    expect(readCell(sheet, 'B6')).toBe(2);
    expect(readCell(sheet, 'A7')).toBe('Ventas total');
    expect(readCell(sheet, 'B7')).toBe(1500);
    expect(readCell(sheet, 'A8')).toBe('Efectivo');
    expect(readCell(sheet, 'B8')).toBe(500);
    expect(readCell(sheet, 'A12')).toBe('Crédito 3 cuotas');
    expect(readCell(sheet, 'B12')).toBe(1000);
  });
});

describe('buildSalesDailyXlsx — Ventas sheet', () => {
  it('emits one row per payment, with header columns set', async () => {
    const bytes = await buildSalesDailyXlsx('2026-04-01', TOTALS, SALES);
    const wb = XLSX.read(bytes, { type: 'array' });
    const sheet = wb.Sheets['Ventas']!;

    expect(readCell(sheet, 'A1')).toBe('#');
    expect(readCell(sheet, 'B1')).toBe('Hora');
    expect(readCell(sheet, 'C1')).toBe('Total venta');
    expect(readCell(sheet, 'D1')).toBe('Método');
    expect(readCell(sheet, 'E1')).toBe('Marca');
    expect(readCell(sheet, 'F1')).toBe('Cuotas');
    expect(readCell(sheet, 'G1')).toBe('Monto pago');
    expect(readCell(sheet, 'H1')).toBe('Observaciones');

    // Sale 1, payment 1 (efectivo).
    expect(readCell(sheet, 'A2')).toBe(1);
    expect(String(readCell(sheet, 'B2'))).toMatch(/^\d{2}:\d{2}$/);
    expect(readCell(sheet, 'C2')).toBe(1500);
    expect(readCell(sheet, 'D2')).toBe('Efectivo');
    expect(readCell(sheet, 'G2')).toBe(500);
    expect(readCell(sheet, 'H2')).toBe('venta test');

    // Sale 1, payment 2 (continuation row): #, Hora, Total, Observaciones
    // are blank so vertical SUMs over Total don't double-count.
    expect(readCell(sheet, 'A3') ?? '').toBe('');
    expect(readCell(sheet, 'B3') ?? '').toBe('');
    expect(readCell(sheet, 'C3') ?? '').toBe('');
    expect(readCell(sheet, 'D3')).toBe('Crédito');
    expect(readCell(sheet, 'E3')).toBe('Visa');
    expect(readCell(sheet, 'F3')).toBe(3);
    expect(readCell(sheet, 'G3')).toBe(1000);
  });

  it('renders an empty Ventas sheet (header only) on a no-sales day', async () => {
    const empty: DailyTotals = {
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
    const bytes = await buildSalesDailyXlsx('2025-01-01', empty, []);
    const wb = XLSX.read(bytes, { type: 'array' });
    const sheet = wb.Sheets['Ventas']!;
    expect(readCell(sheet, 'A1')).toBe('#');
    expect(sheet['A2']).toBeUndefined();
  });
});
