/**
 * Expenses PDF export — single filterable list.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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

const ORANGE: [number, number, number] = [242, 101, 34];
const ORANGE_LIGHT: [number, number, number] = [254, 237, 229];
const TEXT_DARK: [number, number, number] = [31, 41, 55];
const TEXT_MUTED: [number, number, number] = [107, 114, 128];
const BORDER: [number, number, number] = [229, 231, 235];

function methodChipText(r: ExpenseRow): string {
  const base = METHOD_LABEL[r.method];
  const brand = r.cardBrandName ? ` ${r.cardBrandName}` : '';
  const cuotas = r.installments ? ` ${r.installments}c` : '';
  return `${base}${brand}${cuotas}`;
}

export function buildExpensesPdf(result: ExpensesListResult): Uint8Array {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 40;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...ORANGE);
  doc.text('Carestino Santa Fe', marginX, 60);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...TEXT_DARK);
  doc.text('Gastos', marginX, 80);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Generado el ${formatLongDateInAppTZ(todayInAppTZ())}`, marginX, 96);

  // Total card.
  const cardY = 120;
  const cardW = pageWidth - marginX * 2;
  const cardH = 56;
  doc.setFillColor(...ORANGE);
  doc.roundedRect(marginX, cardY, cardW, cardH, 6, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL FILTRADO', marginX + 14, cardY + 18);
  doc.setFontSize(20);
  doc.text(formatARS(result.total), marginX + 14, cardY + 42);
  const countText = `${result.count} gasto${result.count === 1 ? '' : 's'}`;
  const countW = doc.getTextWidth(countText);
  doc.setFontSize(11);
  doc.text(countText, pageWidth - marginX - 14 - countW, cardY + 42);

  // Detail table.
  const head = [['Fecha', 'Hora', 'Proveedor', 'Método', 'Monto', 'Observaciones']];
  const body: string[][] = result.rows.map((r) => [
    r.expenseDate.toISOString().slice(0, 10),
    formatTimeInAppTZ(r.expenseDate),
    r.provider,
    methodChipText(r),
    formatARS(r.amount),
    r.observations ?? '',
  ]);

  autoTable(doc, {
    startY: cardY + cardH + 16,
    margin: { left: marginX, right: marginX },
    head,
    body,
    headStyles: {
      fillColor: ORANGE,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'left',
    },
    bodyStyles: { fontSize: 9, textColor: TEXT_DARK, cellPadding: 4 },
    alternateRowStyles: { fillColor: ORANGE_LIGHT },
    columnStyles: {
      0: { halign: 'center', cellWidth: 70 },
      1: { halign: 'center', cellWidth: 40 },
      2: { cellWidth: 100 },
      3: { cellWidth: 90 },
      4: { halign: 'right', cellWidth: 80 },
      5: { cellWidth: 'auto' },
    },
    styles: { lineColor: BORDER, lineWidth: 0.5, overflow: 'linebreak' },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...TEXT_MUTED);
      const footer = `Página ${data.pageNumber} de ${pageCount}`;
      const w = doc.getTextWidth(footer);
      doc.text(footer, pageWidth - marginX - w, doc.internal.pageSize.getHeight() - 20);
    },
  });

  if (body.length === 0) {
    const finalY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
      cardY + cardH + 30;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('No hay gastos que coincidan con los filtros.', marginX, finalY + 16);
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

export function expensesPdfFilename(): string {
  return `gastos-${todayInAppTZ()}.pdf`;
}
