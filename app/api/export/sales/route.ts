/**
 * GET /api/export/sales
 *
 * Periods (V1): daily | monthly | annual.
 *   daily   + date=YYYY-MM-DD
 *   monthly + month=YYYY-MM
 *   annual  + year=YYYY
 *   format  = xlsx | pdf
 *
 * RBAC (08-SECURITY.md):
 *   - daily: both roles.
 *   - monthly / annual: super_admin only.
 */
import { NextResponse } from 'next/server';
import { fromZonedTime } from 'date-fns-tz';

import {
  ForbiddenError,
  UnauthorizedError,
  getSessionUser,
  requireRole,
} from '@/lib/auth';
import {
  APP_TZ,
  dayRangeInAppTZ,
  isValidDateString,
  todayInAppTZ,
} from '@/lib/dates';
import { parseSalesFilters } from '@/lib/filters';
import {
  getAnnualSales,
  getDailySalesTotals,
  getMonthlySales,
  listDailySales,
} from '@/lib/queries/sales';
import {
  buildSalesAnnualXlsx,
  buildSalesDailyXlsx,
  buildSalesMonthlyXlsx,
  salesAnnualFilename,
  salesDailyFilename,
  salesMonthlyFilename,
} from '@/lib/export/sales-xlsx';
import {
  buildSalesAnnualPdf,
  buildSalesDailyPdf,
  buildSalesMonthlyPdf,
  salesAnnualPdfFilename,
  salesDailyPdfFilename,
  salesMonthlyPdfFilename,
} from '@/lib/export/sales-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORTED_PERIODS = new Set(['daily', 'monthly', 'annual']);
const SUPPORTED_FORMATS = new Set(['xlsx', 'pdf']);

const CONTENT_TYPE: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

function isValidYearMonth(s: string): boolean {
  return /^\d{4}-\d{2}$/.test(s);
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const period = url.searchParams.get('period') ?? 'daily';
  const format = url.searchParams.get('format') ?? 'xlsx';

  if (!SUPPORTED_PERIODS.has(period)) return bad('unsupported_period');
  if (!SUPPORTED_FORMATS.has(format)) return bad('unsupported_format');

  // Auth — daily allows both roles, monthly/annual super_admin only.
  try {
    if (period === 'daily') {
      await getSessionUser();
    } else {
      await requireRole(['super_admin']);
    }
  } catch (e) {
    if (e instanceof UnauthorizedError) return bad('unauthorized', 401);
    if (e instanceof ForbiddenError) return bad('forbidden', 403);
    throw e;
  }

  let bytes: Uint8Array;
  let filename: string;

  if (period === 'daily') {
    const dateParam = url.searchParams.get('date');
    const date = dateParam && isValidDateString(dateParam) ? dateParam : todayInAppTZ();
    const { start, end } = dayRangeInAppTZ(date);

    const rawParams: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) rawParams[k] = v;
    const filters = parseSalesFilters(rawParams);

    const [totals, sales] = await Promise.all([
      getDailySalesTotals(start, end, filters),
      listDailySales(start, end, filters),
    ]);
    if (format === 'xlsx') {
      bytes = await buildSalesDailyXlsx(date, totals, sales);
      filename = salesDailyFilename(date);
    } else {
      bytes = buildSalesDailyPdf(date, totals, sales);
      filename = salesDailyPdfFilename(date);
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
    const rows = await getMonthlySales(start, end);
    if (format === 'xlsx') {
      bytes = await buildSalesMonthlyXlsx(month, rows);
      filename = salesMonthlyFilename(month);
    } else {
      bytes = buildSalesMonthlyPdf(month, rows);
      filename = salesMonthlyPdfFilename(month);
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
    const rows = await getAnnualSales(start, end);
    if (format === 'xlsx') {
      bytes = await buildSalesAnnualXlsx(year, rows);
      filename = salesAnnualFilename(year);
    } else {
      bytes = buildSalesAnnualPdf(year, rows);
      filename = salesAnnualPdfFilename(year);
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
