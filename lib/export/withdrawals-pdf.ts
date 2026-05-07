/**
 * Daily withdrawals PDF export — same pattern as sales-pdf.ts.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  formatLongDateInAppTZ,
  formatTimeInAppTZ,
  todayInAppTZ,
} from '@/lib/dates';
import { formatARS } from '@/lib/money';
import type {
  DailyWithdrawal,
  DailyWithdrawalsTotals,
} from '@/lib/queries/withdrawals';

const ORANGE: [number, number, number] = [242, 101, 34];
const ORANGE_LIGHT: [number, number, number] = [254, 237, 229];
const TEXT_DARK: [number, number, number] = [31, 41, 55];
const TEXT_MUTED: [number, number, number] = [107, 114, 128];
const BORDER: [number, number, number] = [229, 231, 235];

export function buildWithdrawalsDailyPdf(
  date: string,
  totals: DailyWithdrawalsTotals,
  withdrawals: DailyWithdrawal[],
): Uint8Array {
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
  doc.text('Retiros — Planilla diaria', marginX, 80);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Fecha: ${formatLongDateInAppTZ(date)}`, marginX, 96);

  const generated = `Generado el ${formatLongDateInAppTZ(todayInAppTZ())}`;
  const genWidth = doc.getTextWidth(generated);
  doc.text(generated, pageWidth - marginX - genWidth, 96);

  // --- Resumen block ---
  let y = 120;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...TEXT_DARK);
  doc.text('Resumen del día', marginX, y);
  y += 10;

  const summaryCells: { label: string; value: string; emphasize?: boolean }[] = [
    {
      label: 'Retiros total',
      value: formatARS(totals.withdrawalsTotal),
      emphasize: true,
    },
    { label: 'Cantidad', value: String(totals.withdrawalsCount) },
    ...totals.perPerson.map((p) => ({ label: p.name, value: formatARS(p.total) })),
  ];

  // 4 cols grid (auto rows).
  const cols = 4;
  const gap = 6;
  const innerWidth = pageWidth - marginX * 2;
  const cellWidth = (innerWidth - gap * (cols - 1)) / cols;
  const cellHeight = 44;

  for (let i = 0; i < summaryCells.length; i++) {
    const cell = summaryCells[i]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = marginX + col * (cellWidth + gap);
    const cy = y + row * (cellHeight + gap);

    doc.setFillColor(...(cell.emphasize ? ORANGE : ORANGE_LIGHT));
    doc.roundedRect(x, cy, cellWidth, cellHeight, 4, 4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(
      ...(cell.emphasize ? ([255, 255, 255] as [number, number, number]) : TEXT_MUTED),
    );
    doc.text(cell.label.toUpperCase(), x + 8, cy + 14);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(
      ...(cell.emphasize ? ([255, 255, 255] as [number, number, number]) : TEXT_DARK),
    );
    doc.text(cell.value, x + 8, cy + 32);
  }

  const rows = Math.ceil(summaryCells.length / cols);
  y += rows * (cellHeight + gap) + 10;

  // --- Detail table ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...TEXT_DARK);
  doc.text('Detalle de retiros', marginX, y);
  y += 8;

  const head = [['#', 'Hora', 'Persona', 'Monto']];
  const body: string[][] = withdrawals.map((w, i) => [
    String(i + 1),
    formatTimeInAppTZ(w.withdrawalDate),
    w.personName,
    formatARS(w.amount),
  ]);

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
    alternateRowStyles: { fillColor: ORANGE_LIGHT },
    columnStyles: {
      0: { halign: 'center', cellWidth: 30 },
      1: { halign: 'center', cellWidth: 60 },
      2: { cellWidth: 'auto' },
      3: { halign: 'right', cellWidth: 100 },
    },
    styles: { lineColor: BORDER, lineWidth: 0.5, overflow: 'linebreak' },
    didDrawPage: (data) => {
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

  if (body.length === 0) {
    const finalY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 30;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('No hay retiros registrados para esta fecha.', marginX, finalY + 16);
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

export function withdrawalsDailyPdfFilename(date: string): string {
  return `retiros-diaria-${date}.pdf`;
}
