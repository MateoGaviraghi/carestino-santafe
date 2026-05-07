/**
 * Daily sales PDF export — jsPDF + jspdf-autotable.
 *
 * Layout (single document, A4 portrait, 40pt margins):
 *
 *   1. Branded header: title in Carestino orange, subtitle "Planilla diaria",
 *      long Spanish date, generated-at timestamp.
 *   2. "Resumen del día" — 4-column / 2-row grid of analytics cells (the
 *      spec calls for the analytics cards as a header block).
 *   3. "Detalle de ventas" — autoTable with one row per PAYMENT. Mixed-method
 *      sales span consecutive rows; #, Hora, Total venta and Observaciones
 *      are blank on continuation rows so a future SUM operation downstream
 *      doesn't double-count.
 *
 * Money formatting reuses formatARS so the document matches the on-screen
 * currency style ($1.234.567,89).
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  formatLongDateInAppTZ,
  formatTimeInAppTZ,
  todayInAppTZ,
} from '@/lib/dates';
import { formatARS } from '@/lib/money';
import type { DailySale, DailyTotals } from '@/lib/queries/sales';
import type { PaymentMethod } from '@/db/schema';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
};

// Carestino brand orange (#F26522) decomposed for jsPDF.
const ORANGE: [number, number, number] = [242, 101, 34];
const ORANGE_LIGHT: [number, number, number] = [254, 237, 229];
const TEXT_DARK: [number, number, number] = [31, 41, 55];
const TEXT_MUTED: [number, number, number] = [107, 114, 128];
const BORDER: [number, number, number] = [229, 231, 235];

export function buildSalesDailyPdf(
  date: string,
  totals: DailyTotals,
  sales: DailySale[],
): Uint8Array {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 40;
  const innerWidth = pageWidth - marginX * 2;

  // ---- Header ---------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...ORANGE);
  doc.text('Carestino Santa Fe', marginX, 60);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...TEXT_DARK);
  doc.text('Planilla diaria', marginX, 80);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Fecha: ${formatLongDateInAppTZ(date)}`, marginX, 96);

  // Generation stamp (right-aligned).
  const generated = `Generado el ${formatLongDateInAppTZ(todayInAppTZ())}`;
  const genWidth = doc.getTextWidth(generated);
  doc.text(generated, pageWidth - marginX - genWidth, 96);

  // ---- Resumen block --------------------------------------------------------
  let y = 120;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...TEXT_DARK);
  doc.text('Resumen del día', marginX, y);
  y += 10;

  const summaryCells: { label: string; value: string }[] = [
    { label: 'Ventas total', value: formatARS(totals.salesTotal) },
    { label: 'Cantidad', value: String(totals.salesCount) },
    { label: 'Efectivo', value: formatARS(totals.perMethod.efectivo) },
    { label: 'Transferencia', value: formatARS(totals.perMethod.transferencia) },
    { label: 'Débito', value: formatARS(totals.perMethod.debito) },
    { label: 'Crédito 1 cuota', value: formatARS(totals.perMethod.credito1) },
    { label: 'Crédito 3 cuotas', value: formatARS(totals.perMethod.credito3) },
    { label: 'Crédito 6 cuotas', value: formatARS(totals.perMethod.credito6) },
  ];

  // 4 cols × 2 rows grid.
  const cols = 4;
  const rows = Math.ceil(summaryCells.length / cols);
  const gap = 6;
  const cellWidth = (innerWidth - gap * (cols - 1)) / cols;
  const cellHeight = 44;

  for (let i = 0; i < summaryCells.length; i++) {
    const cell = summaryCells[i]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = marginX + col * (cellWidth + gap);
    const cy = y + row * (cellHeight + gap);

    // Cell background.
    if (i === 0) {
      doc.setFillColor(...ORANGE);
    } else {
      doc.setFillColor(...ORANGE_LIGHT);
    }
    doc.roundedRect(x, cy, cellWidth, cellHeight, 4, 4, 'F');

    // Label.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...(i === 0 ? ([255, 255, 255] as [number, number, number]) : TEXT_MUTED));
    doc.text(cell.label.toUpperCase(), x + 8, cy + 14);

    // Value.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...(i === 0 ? ([255, 255, 255] as [number, number, number]) : TEXT_DARK));
    doc.text(cell.value, x + 8, cy + 32);
  }

  y += rows * (cellHeight + gap) + 10;

  // ---- Detalle table --------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...TEXT_DARK);
  doc.text('Detalle de ventas', marginX, y);
  y += 8;

  const head = [['#', 'Hora', 'Total venta', 'Método', 'Marca', 'Cuotas', 'Monto pago', 'Observaciones']];

  const body: string[][] = [];
  let saleNumber = 1;
  for (const sale of sales) {
    let firstRow = true;
    for (const p of sale.payments) {
      body.push([
        firstRow ? String(saleNumber) : '',
        firstRow ? formatTimeInAppTZ(sale.saleDate) : '',
        firstRow ? formatARS(sale.totalAmount) : '',
        METHOD_LABEL[p.method],
        p.cardBrandName ?? '',
        p.installments ? String(p.installments) : '',
        formatARS(p.amount),
        firstRow ? (sale.observations ?? '') : '',
      ]);
      firstRow = false;
    }
    saleNumber++;
  }

  autoTable(doc, {
    startY: y,
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
    bodyStyles: {
      fontSize: 9,
      textColor: TEXT_DARK,
      cellPadding: 4,
    },
    alternateRowStyles: {
      fillColor: ORANGE_LIGHT,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 22 },
      1: { halign: 'center', cellWidth: 36 },
      2: { halign: 'right', cellWidth: 70 },
      3: { cellWidth: 60 },
      4: { cellWidth: 60 },
      5: { halign: 'center', cellWidth: 36 },
      6: { halign: 'right', cellWidth: 70 },
      7: { cellWidth: 'auto' },
    },
    styles: {
      lineColor: BORDER,
      lineWidth: 0.5,
      overflow: 'linebreak',
    },
    didDrawPage: (data) => {
      // Footer with page number.
      const pageCount = doc.getNumberOfPages();
      const current = data.pageNumber;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...TEXT_MUTED);
      const footer = `Página ${current} de ${pageCount}`;
      const w = doc.getTextWidth(footer);
      doc.text(footer, pageWidth - marginX - w, doc.internal.pageSize.getHeight() - 20);
    },
  });

  // Empty-state line if no sales.
  if (body.length === 0) {
    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 30;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('No hay ventas registradas para esta fecha.', marginX, finalY + 16);
  }

  const ab = doc.output('arraybuffer');
  return new Uint8Array(ab);
}

export function salesDailyPdfFilename(date: string): string {
  return `ventas-diaria-${date}.pdf`;
}
