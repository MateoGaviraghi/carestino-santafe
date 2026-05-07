/**
 * Daily sales Excel export — built with `exceljs` for true cell styling
 * (the community `xlsx` build can read styles but cannot write them).
 *
 * Two sheets:
 *
 *   1. "Resumen" — title block + totals table with Carestino-orange header.
 *   2. "Ventas"  — native Excel Table (autofilter, banded rows, theme).
 *                  One row per PAYMENT; sales with mixed methods span
 *                  consecutive rows. Total/Hora/Observaciones are written
 *                  only on the first row of each sale so vertical SUMs
 *                  over the totals column don't double-count.
 *
 * Money cells use a "$#,##0.00" format so the user can SUM/filter them
 * natively; numeric(12,2) values fit safely in a JS Number (max
 * 9.999.999.999,99 < Number.MAX_SAFE_INTEGER).
 */
import ExcelJS from 'exceljs';
import { formatLongDateInAppTZ, formatTimeInAppTZ } from '@/lib/dates';
import type { DailySale, DailyTotals } from '@/lib/queries/sales';
import type { PaymentMethod } from '@/db/schema';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
};

const MONEY_FMT = '"$"#,##0.00';

// Carestino brand orange (matches the UI primary color #F26522).
const BRAND_ORANGE_ARGB = 'FFF26522';
const BRAND_ORANGE_LIGHT_ARGB = 'FFFEEDE5';
const TEXT_DARK_ARGB = 'FF1F2937';
const TEXT_MUTED_ARGB = 'FF6B7280';
const BORDER_LIGHT_ARGB = 'FFE5E7EB';

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: BORDER_LIGHT_ARGB } },
  bottom: { style: 'thin', color: { argb: BORDER_LIGHT_ARGB } },
  left: { style: 'thin', color: { argb: BORDER_LIGHT_ARGB } },
  right: { style: 'thin', color: { argb: BORDER_LIGHT_ARGB } },
};

function buildSummarySheet(wb: ExcelJS.Workbook, date: string, totals: DailyTotals): void {
  const ws = wb.addWorksheet('Resumen', {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 18 },
  });

  ws.columns = [
    { width: 26 }, // Concepto
    { width: 22 }, // Monto
  ];

  // --- Title block ----------------------------------------------------------
  ws.mergeCells('A1:B1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'Carestino Santa Fe';
  titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: BRAND_ORANGE_ARGB } };
  ws.getRow(1).height = 28;

  ws.mergeCells('A2:B2');
  const subCell = ws.getCell('A2');
  subCell.value = 'Planilla diaria';
  subCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: TEXT_DARK_ARGB } };
  ws.getRow(2).height = 18;

  ws.mergeCells('A3:B3');
  const dateCell = ws.getCell('A3');
  dateCell.value = `Fecha: ${formatLongDateInAppTZ(date)}`;
  dateCell.font = { name: 'Calibri', size: 11, color: { argb: TEXT_MUTED_ARGB } };
  ws.getRow(3).height = 16;

  // Row 4: spacer.

  // --- Header row -----------------------------------------------------------
  const header = ws.getRow(5);
  header.values = ['Concepto', 'Monto'];
  header.height = 22;
  header.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: BRAND_ORANGE_ARGB },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cell.border = thinBorder;
  });
  ws.getCell('B5').alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };

  // --- Data rows ------------------------------------------------------------
  type RowSpec = { label: string; value: number; isMoney: boolean; emphasize?: boolean };
  const rows: RowSpec[] = [
    { label: 'Cantidad de ventas', value: totals.salesCount, isMoney: false },
    { label: 'Ventas total', value: Number(totals.salesTotal), isMoney: true, emphasize: true },
    { label: 'Efectivo', value: Number(totals.perMethod.efectivo), isMoney: true },
    { label: 'Transferencia', value: Number(totals.perMethod.transferencia), isMoney: true },
    { label: 'Débito', value: Number(totals.perMethod.debito), isMoney: true },
    { label: 'Crédito 1 cuota', value: Number(totals.perMethod.credito1), isMoney: true },
    { label: 'Crédito 3 cuotas', value: Number(totals.perMethod.credito3), isMoney: true },
    { label: 'Crédito 6 cuotas', value: Number(totals.perMethod.credito6), isMoney: true },
  ];

  rows.forEach((spec, i) => {
    const rowIdx = 6 + i;
    const r = ws.getRow(rowIdx);
    r.values = [spec.label, spec.value];
    r.height = 20;

    const labelCell = r.getCell(1);
    const valueCell = r.getCell(2);
    labelCell.font = {
      name: 'Calibri',
      size: 11,
      bold: spec.emphasize ?? false,
      color: { argb: TEXT_DARK_ARGB },
    };
    labelCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    valueCell.font = {
      name: 'Calibri',
      size: 11,
      bold: spec.emphasize ?? false,
      color: { argb: spec.emphasize ? BRAND_ORANGE_ARGB : TEXT_DARK_ARGB },
    };
    valueCell.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
    if (spec.isMoney) valueCell.numFmt = MONEY_FMT;

    // Subtle banding via background on alternating rows.
    if (i % 2 === 1) {
      const fill: ExcelJS.FillPattern = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: BRAND_ORANGE_LIGHT_ARGB },
      };
      labelCell.fill = fill;
      valueCell.fill = fill;
    }

    labelCell.border = thinBorder;
    valueCell.border = thinBorder;
  });
}

function buildDetailSheet(wb: ExcelJS.Workbook, sales: DailySale[]): void {
  const ws = wb.addWorksheet('Ventas', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
  });

  ws.columns = [
    { header: '#', key: 'num', width: 6 },
    { header: 'Hora', key: 'hora', width: 9 },
    { header: 'Total venta', key: 'total', width: 16 },
    { header: 'Método', key: 'metodo', width: 14 },
    { header: 'Marca', key: 'marca', width: 14 },
    { header: 'Cuotas', key: 'cuotas', width: 9 },
    { header: 'Monto pago', key: 'monto', width: 16 },
    { header: 'Observaciones', key: 'obs', width: 42 },
  ];

  // Header row styling.
  const headerRow = ws.getRow(1);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: BRAND_ORANGE_ARGB },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cell.border = thinBorder;
  });

  // Data rows.
  let saleNumber = 1;
  let rowIdx = 2;
  for (const sale of sales) {
    let firstRow = true;
    for (const p of sale.payments) {
      const row = ws.getRow(rowIdx);
      row.values = {
        num: firstRow ? saleNumber : null,
        hora: firstRow ? formatTimeInAppTZ(sale.saleDate) : null,
        total: firstRow ? Number(sale.totalAmount) : null,
        metodo: METHOD_LABEL[p.method],
        marca: p.cardBrandName ?? '',
        cuotas: p.installments ?? null,
        monto: Number(p.amount),
        obs: firstRow ? (sale.observations ?? '') : '',
      };
      row.height = 20;

      // Banding by SALE (not by row) so a mixed-method sale stays visually
      // grouped — every row of the same sale shares the same background.
      if (saleNumber % 2 === 0) {
        const fill: ExcelJS.FillPattern = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: BRAND_ORANGE_LIGHT_ARGB },
        };
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = fill;
        });
      }

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 11, color: { argb: TEXT_DARK_ARGB } };
        cell.border = thinBorder;
        // Right-align money + numeric columns.
        if (colNumber === 3 || colNumber === 7) {
          cell.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
          cell.numFmt = MONEY_FMT;
        } else if (colNumber === 1 || colNumber === 6) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        }
      });

      firstRow = false;
      rowIdx++;
    }
    saleNumber++;
  }

  // Native Excel autofilter over the data range — gives a dropdown per column.
  if (rowIdx > 2) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: rowIdx - 1, column: 8 } };
  } else {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };
  }
}

export async function buildSalesDailyXlsx(
  date: string,
  totals: DailyTotals,
  sales: DailySale[],
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Carestino Santa Fe';
  wb.created = new Date();

  buildSummarySheet(wb, date, totals);
  buildDetailSheet(wb, sales);

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

export function salesDailyFilename(date: string): string {
  return `ventas-diaria-${date}.xlsx`;
}

// -----------------------------------------------------------------------------
// Monthly + annual aggregate xlsx (V1).
// -----------------------------------------------------------------------------

import type { AggregatePerMethodRow } from '@/lib/queries/sales';

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function buildAggregateSheet(
  wb: ExcelJS.Workbook,
  title: string,
  subtitle: string,
  bucketHeader: string,
  rows: AggregatePerMethodRow[],
  formatBucket: (b: string) => string,
): void {
  const ws = wb.addWorksheet('Ventas', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 5 }],
    properties: { defaultRowHeight: 18 },
  });
  ws.columns = [
    { header: bucketHeader, key: 'bucket', width: 16 },
    { header: 'Cant.', key: 'count', width: 8 },
    { header: 'Ventas total', key: 'total', width: 16 },
    { header: 'Efectivo', key: 'cash', width: 14 },
    { header: 'Transferencia', key: 'transfer', width: 14 },
    { header: 'Débito', key: 'debit', width: 14 },
    { header: 'Crédito 1c', key: 'c1', width: 14 },
    { header: 'Crédito 3c', key: 'c3', width: 14 },
    { header: 'Crédito 6c', key: 'c6', width: 14 },
  ];

  ws.mergeCells('A1:I1');
  ws.getCell('A1').value = 'Carestino Santa Fe';
  ws.getCell('A1').font = {
    name: 'Calibri',
    size: 18,
    bold: true,
    color: { argb: 'FFF26522' },
  };
  ws.getRow(1).height = 28;

  ws.mergeCells('A2:I2');
  ws.getCell('A2').value = title;
  ws.getCell('A2').font = { bold: true, color: { argb: 'FF1F2937' } };

  ws.mergeCells('A3:I3');
  ws.getCell('A3').value = subtitle;
  ws.getCell('A3').font = { color: { argb: 'FF6B7280' } };

  // Header row at row 5.
  const header = ws.getRow(5);
  header.height = 22;
  header.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF26522' },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: col === 1 || col === 2 ? 'left' : 'right',
      indent: 1,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };
  });

  rows.forEach((r, i) => {
    const row = ws.getRow(6 + i);
    row.values = {
      bucket: formatBucket(r.bucket),
      count: r.salesCount,
      total: Number(r.salesTotal),
      cash: Number(r.perMethod.efectivo),
      transfer: Number(r.perMethod.transferencia),
      debit: Number(r.perMethod.debito),
      c1: Number(r.perMethod.credito1),
      c3: Number(r.perMethod.credito3),
      c6: Number(r.perMethod.credito6),
    };
    row.height = 20;

    if (i % 2 === 1) {
      const fill: ExcelJS.FillPattern = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEEDE5' },
      };
      row.eachCell({ includeEmpty: true }, (c) => {
        c.fill = fill;
      });
    }
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { color: { argb: 'FF1F2937' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
      if (col >= 3) {
        cell.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
        cell.numFmt = MONEY_FMT;
      } else if (col === 2) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      }
    });
  });

  if (rows.length > 0) {
    ws.autoFilter = {
      from: { row: 5, column: 1 },
      to: { row: rows.length + 5, column: 9 },
    };
  }
}

export async function buildSalesMonthlyXlsx(
  month: string,
  rows: AggregatePerMethodRow[],
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Carestino Santa Fe';
  wb.created = new Date();
  buildAggregateSheet(
    wb,
    'Ventas — Planilla mensual',
    `Mes: ${month}`,
    'Día',
    rows,
    (b) => b,
  );
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

export async function buildSalesAnnualXlsx(
  year: number,
  rows: AggregatePerMethodRow[],
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Carestino Santa Fe';
  wb.created = new Date();
  buildAggregateSheet(
    wb,
    'Ventas — Planilla anual',
    `Año: ${year}`,
    'Mes',
    rows,
    (b) => {
      const [, mm] = b.split('-');
      const idx = Number(mm) - 1;
      return `${MONTHS_ES[idx] ?? b} ${year}`;
    },
  );
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

export function salesMonthlyFilename(month: string): string {
  return `ventas-mensual-${month}.xlsx`;
}

export function salesAnnualFilename(year: number): string {
  return `ventas-anual-${year}.xlsx`;
}
