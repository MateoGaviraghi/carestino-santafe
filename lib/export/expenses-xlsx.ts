/**
 * Expenses Excel export — single filterable list (no daily/monthly/annual).
 * Same branded pattern as sales/withdrawals.
 */
import ExcelJS from 'exceljs';
import { formatLongDateInAppTZ, formatTimeInAppTZ, todayInAppTZ } from '@/lib/dates';
import { formatARS } from '@/lib/money';
import type { ExpenseRow, ExpensesListResult } from '@/lib/queries/expenses';
import type { PaymentMethod } from '@/db/schema';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
};

const MONEY_FMT = '"$"#,##0.00';
const BRAND_ORANGE = 'FFF26522';
const BRAND_ORANGE_LIGHT = 'FFFEEDE5';
const TEXT_DARK = 'FF1F2937';
const TEXT_MUTED = 'FF6B7280';
const BORDER_LIGHT = 'FFE5E7EB';

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: BORDER_LIGHT } },
  bottom: { style: 'thin', color: { argb: BORDER_LIGHT } },
  left: { style: 'thin', color: { argb: BORDER_LIGHT } },
  right: { style: 'thin', color: { argb: BORDER_LIGHT } },
};

function methodChipText(r: ExpenseRow): string {
  const base = METHOD_LABEL[r.method];
  const brand = r.cardBrandName ? ` ${r.cardBrandName}` : '';
  const cuotas = r.installments ? ` ${r.installments}c` : '';
  return `${base}${brand}${cuotas}`;
}

export async function buildExpensesXlsx(result: ExpensesListResult): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Carestino Santa Fe';
  wb.created = new Date();

  const ws = wb.addWorksheet('Gastos', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 4 }],
    properties: { defaultRowHeight: 18 },
  });
  ws.columns = [
    { header: 'Fecha', key: 'fecha', width: 12 },
    { header: 'Hora', key: 'hora', width: 8 },
    { header: 'Proveedor', key: 'proveedor', width: 28 },
    { header: 'Método', key: 'metodo', width: 22 },
    { header: 'Monto', key: 'monto', width: 14 },
    { header: 'Observaciones', key: 'obs', width: 40 },
  ];

  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = 'Carestino Santa Fe';
  ws.getCell('A1').font = { name: 'Calibri', size: 18, bold: true, color: { argb: BRAND_ORANGE } };
  ws.getRow(1).height = 28;

  ws.mergeCells('A2:F2');
  ws.getCell('A2').value = `Gastos — ${formatLongDateInAppTZ(todayInAppTZ())}`;
  ws.getCell('A2').font = { name: 'Calibri', size: 12, bold: true, color: { argb: TEXT_DARK } };

  ws.mergeCells('A3:E3');
  ws.getCell('A3').value = `Total filtrado: ${formatARS(result.total)} · ${result.count} gasto${
    result.count === 1 ? '' : 's'
  }`;
  ws.getCell('A3').font = { name: 'Calibri', size: 11, color: { argb: TEXT_MUTED } };

  // Header on row 4.
  const header = ws.getRow(4);
  header.values = ['Fecha', 'Hora', 'Proveedor', 'Método', 'Monto', 'Observaciones'];
  header.height = 22;
  header.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_ORANGE } };
    cell.alignment = {
      vertical: 'middle',
      horizontal: col === 5 ? 'right' : 'left',
      indent: 1,
    };
    cell.border = thinBorder;
  });

  // Data rows starting at row 5.
  result.rows.forEach((r, i) => {
    const row = ws.getRow(5 + i);
    row.values = {
      fecha: formatLongDateInAppTZ(formatLongDateInAppTZ(todayInAppTZ()) ? '' : ''),
    };
    row.values = [
      r.expenseDate.toISOString().slice(0, 10),
      formatTimeInAppTZ(r.expenseDate),
      r.provider,
      methodChipText(r),
      Number(r.amount),
      r.observations ?? '',
    ];
    row.height = 20;
    if (i % 2 === 1) {
      const fill: ExcelJS.FillPattern = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: BRAND_ORANGE_LIGHT },
      };
      row.eachCell({ includeEmpty: true }, (c) => {
        c.fill = fill;
      });
    }
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { color: { argb: TEXT_DARK } };
      cell.border = thinBorder;
      if (col === 5) {
        cell.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
        cell.numFmt = MONEY_FMT;
      } else if (col === 1 || col === 2) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      }
    });
  });

  if (result.rows.length > 0) {
    ws.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: result.rows.length + 4, column: 6 },
    };
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

export function expensesFilename(): string {
  return `gastos-${todayInAppTZ()}.xlsx`;
}
