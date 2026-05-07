/**
 * Daily withdrawals Excel export — same pattern as sales-xlsx.ts.
 */
import ExcelJS from 'exceljs';
import { formatLongDateInAppTZ, formatTimeInAppTZ } from '@/lib/dates';
import type {
  DailyWithdrawal,
  DailyWithdrawalsTotals,
} from '@/lib/queries/withdrawals';

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

function buildSummarySheet(
  wb: ExcelJS.Workbook,
  date: string,
  totals: DailyWithdrawalsTotals,
): void {
  const ws = wb.addWorksheet('Resumen', {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 18 },
  });
  ws.columns = [{ width: 26 }, { width: 22 }];

  ws.mergeCells('A1:B1');
  ws.getCell('A1').value = 'Carestino Santa Fe';
  ws.getCell('A1').font = { name: 'Calibri', size: 18, bold: true, color: { argb: BRAND_ORANGE } };
  ws.getRow(1).height = 28;

  ws.mergeCells('A2:B2');
  ws.getCell('A2').value = 'Retiros — Planilla diaria';
  ws.getCell('A2').font = { name: 'Calibri', size: 12, bold: true, color: { argb: TEXT_DARK } };

  ws.mergeCells('A3:B3');
  ws.getCell('A3').value = `Fecha: ${formatLongDateInAppTZ(date)}`;
  ws.getCell('A3').font = { name: 'Calibri', size: 11, color: { argb: TEXT_MUTED } };

  const header = ws.getRow(5);
  header.values = ['Concepto', 'Monto'];
  header.height = 22;
  header.eachCell((cell, col) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_ORANGE } };
    cell.alignment = { vertical: 'middle', horizontal: col === 2 ? 'right' : 'left', indent: 1 };
    cell.border = thinBorder;
  });

  const rows: { label: string; value: number; isMoney: boolean; emphasize?: boolean }[] = [
    { label: 'Cantidad de retiros', value: totals.withdrawalsCount, isMoney: false },
    {
      label: 'Retiros total',
      value: Number(totals.withdrawalsTotal),
      isMoney: true,
      emphasize: true,
    },
    ...totals.perPerson.map((p) => ({ label: p.name, value: Number(p.total), isMoney: true })),
  ];

  rows.forEach((spec, i) => {
    const r = ws.getRow(6 + i);
    r.values = [spec.label, spec.value];
    r.height = 20;
    const labelCell = r.getCell(1);
    const valueCell = r.getCell(2);
    labelCell.font = { bold: spec.emphasize ?? false, color: { argb: TEXT_DARK } };
    labelCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    valueCell.font = {
      bold: spec.emphasize ?? false,
      color: { argb: spec.emphasize ? BRAND_ORANGE : TEXT_DARK },
    };
    valueCell.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
    if (spec.isMoney) valueCell.numFmt = MONEY_FMT;
    if (i % 2 === 1) {
      const fill: ExcelJS.FillPattern = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: BRAND_ORANGE_LIGHT },
      };
      labelCell.fill = fill;
      valueCell.fill = fill;
    }
    labelCell.border = thinBorder;
    valueCell.border = thinBorder;
  });
}

function buildDetailSheet(wb: ExcelJS.Workbook, withdrawals: DailyWithdrawal[]): void {
  const ws = wb.addWorksheet('Retiros', {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
  });
  ws.columns = [
    { header: '#', key: 'num', width: 6 },
    { header: 'Hora', key: 'hora', width: 10 },
    { header: 'Persona', key: 'persona', width: 24 },
    { header: 'Monto', key: 'monto', width: 16 },
  ];

  const header = ws.getRow(1);
  header.height = 24;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_ORANGE } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    cell.border = thinBorder;
  });

  withdrawals.forEach((w, i) => {
    const row = ws.getRow(i + 2);
    row.values = {
      num: i + 1,
      hora: formatTimeInAppTZ(w.withdrawalDate),
      persona: w.personName,
      monto: Number(w.amount),
    };
    row.height = 20;
    if ((i + 1) % 2 === 0) {
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
      if (col === 4) {
        cell.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
        cell.numFmt = MONEY_FMT;
      } else if (col === 1) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      }
    });
  });

  if (withdrawals.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: withdrawals.length + 1, column: 4 },
    };
  }
}

export async function buildWithdrawalsDailyXlsx(
  date: string,
  totals: DailyWithdrawalsTotals,
  withdrawals: DailyWithdrawal[],
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Carestino Santa Fe';
  wb.created = new Date();
  buildSummarySheet(wb, date, totals);
  buildDetailSheet(wb, withdrawals);
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

export function withdrawalsDailyFilename(date: string): string {
  return `retiros-diaria-${date}.xlsx`;
}
