/**
 * GET /api/export/withdrawals
 *
 * Periods: daily | monthly | annual. Super_admin only (08-SECURITY.md
 * matrix: cashier blocked from any withdrawals report).
 *
 * Query params:
 *   period=daily   + date=YYYY-MM-DD
 *   period=monthly + month=YYYY-MM
 *   period=annual  + year=YYYY
 *   format=xlsx | pdf
 */
import { NextResponse } from 'next/server';
import { fromZonedTime } from 'date-fns-tz';

import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
} from '@/lib/auth';
import {
  APP_TZ,
  dayRangeInAppTZ,
  isValidDateString,
  todayInAppTZ,
} from '@/lib/dates';
import {
  getAnnualWithdrawals,
  getDailyWithdrawalsTotals,
  getMonthlyWithdrawals,
  listDailyWithdrawals,
} from '@/lib/queries/withdrawals';
import {
  buildWithdrawalsAnnualXlsx,
  buildWithdrawalsDailyXlsx,
  buildWithdrawalsMonthlyXlsx,
  withdrawalsAnnualFilename,
  withdrawalsDailyFilename,
  withdrawalsMonthlyFilename,
} from '@/lib/export/withdrawals-xlsx';
import {
  buildWithdrawalsAnnualPdf,
  buildWithdrawalsDailyPdf,
  buildWithdrawalsMonthlyPdf,
  withdrawalsAnnualPdfFilename,
  withdrawalsDailyPdfFilename,
  withdrawalsMonthlyPdfFilename,
} from '@/lib/export/withdrawals-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORTED_PERIODS = new Set(['daily', 'monthly', 'annual']);
const SUPPORTED_FORMATS = new Set(['xlsx', 'pdf']);

const CONTENT_TYPE: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

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

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function isValidYearMonth(s: string): boolean {
  return /^\d{4}-\d{2}$/.test(s);
}

export async function GET(req: Request): Promise<Response> {
  try {
    await requireRole(['super_admin']);
  } catch (e) {
    if (e instanceof UnauthorizedError) return bad('unauthorized', 401);
    if (e instanceof ForbiddenError) return bad('forbidden', 403);
    throw e;
  }

  const url = new URL(req.url);
  const period = url.searchParams.get('period') ?? 'daily';
  const format = url.searchParams.get('format') ?? 'xlsx';

  if (!SUPPORTED_PERIODS.has(period)) return bad('unsupported_period');
  if (!SUPPORTED_FORMATS.has(format)) return bad('unsupported_format');

  let bytes: Uint8Array;
  let filename: string;

  if (period === 'daily') {
    const dateParam = url.searchParams.get('date');
    const date = dateParam && isValidDateString(dateParam) ? dateParam : todayInAppTZ();
    const { start, end } = dayRangeInAppTZ(date);
    const [totals, list] = await Promise.all([
      getDailyWithdrawalsTotals(start, end),
      listDailyWithdrawals(start, end),
    ]);
    if (format === 'xlsx') {
      bytes = await buildWithdrawalsDailyXlsx(date, totals, list);
      filename = withdrawalsDailyFilename(date);
    } else {
      bytes = buildWithdrawalsDailyPdf(date, totals, list);
      filename = withdrawalsDailyPdfFilename(date);
    }
  } else if (period === 'monthly') {
    const monthParam = url.searchParams.get('month');
    const month =
      monthParam && isValidYearMonth(monthParam) ? monthParam : todayInAppTZ().slice(0, 7);
    const [y, m] = month.split('-').map(Number) as [number, number];
    const start = fromZonedTime(`${month}-01T00:00:00.000`, APP_TZ);
    const nextYear = m === 12 ? y + 1 : y;
    const nextMonth = m === 12 ? 1 : m + 1;
    const end = fromZonedTime(
      `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01T00:00:00.000`,
      APP_TZ,
    );
    const rows = await getMonthlyWithdrawals(start, end);
    const aggregate = rows.map((r) => ({ label: r.day, total: r.total, count: r.count }));
    if (format === 'xlsx') {
      bytes = await buildWithdrawalsMonthlyXlsx(month, aggregate);
      filename = withdrawalsMonthlyFilename(month);
    } else {
      bytes = buildWithdrawalsMonthlyPdf(month, aggregate);
      filename = withdrawalsMonthlyPdfFilename(month);
    }
  } else {
    // annual
    const yearParam = url.searchParams.get('year');
    const year =
      yearParam && /^\d{4}$/.test(yearParam)
        ? Number(yearParam)
        : Number(todayInAppTZ().slice(0, 4));
    const start = fromZonedTime(`${year}-01-01T00:00:00.000`, APP_TZ);
    const end = fromZonedTime(`${year + 1}-01-01T00:00:00.000`, APP_TZ);
    const rows = await getAnnualWithdrawals(start, end);
    const aggregate = rows.map((r) => {
      const [, mm] = r.month.split('-');
      const idx = Number(mm) - 1;
      return {
        label: `${MONTHS_ES[idx] ?? r.month} ${year}`,
        total: r.total,
        count: r.count,
      };
    });
    if (format === 'xlsx') {
      bytes = await buildWithdrawalsAnnualXlsx(year, aggregate);
      filename = withdrawalsAnnualFilename(year);
    } else {
      bytes = buildWithdrawalsAnnualPdf(year, aggregate);
      filename = withdrawalsAnnualPdfFilename(year);
    }
  }

  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': CONTENT_TYPE[format]!,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
