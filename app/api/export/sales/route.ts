/**
 * GET /api/export/sales
 *
 * Query params (per 05-API-CONTRACTS.md):
 *   - period   = daily   (only value supported in MVP — monthly/annual in V1)
 *   - date     = YYYY-MM-DD anchor for the period
 *   - format   = xlsx    (pdf wired in Day 9)
 *   - q, method, cardBrand, installments — same shape as the page params
 *
 * RBAC (per 08-SECURITY.md): both roles can export a daily sheet. Monthly /
 * annual will be super_admin-only when implemented.
 *
 * Response: binary file with Content-Disposition: attachment.
 */
import { NextResponse } from 'next/server';
import {
  ForbiddenError,
  UnauthorizedError,
  getSessionUser,
} from '@/lib/auth';
import { dayRangeInAppTZ, isValidDateString, todayInAppTZ } from '@/lib/dates';
import { parseSalesFilters } from '@/lib/filters';
import { getDailySalesTotals, listDailySales } from '@/lib/queries/sales';
import { buildSalesDailyXlsx, salesDailyFilename } from '@/lib/export/sales-xlsx';
import { buildSalesDailyPdf, salesDailyPdfFilename } from '@/lib/export/sales-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORTED_PERIODS = new Set(['daily']);
const SUPPORTED_FORMATS = new Set(['xlsx', 'pdf']);

const CONTENT_TYPE: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

function bad(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(req: Request): Promise<Response> {
  // 1. Auth — both roles allowed for daily.
  try {
    await getSessionUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return bad('unauthorized', 401);
    if (e instanceof ForbiddenError) return bad('forbidden', 403);
    throw e;
  }

  // 2. Parse + validate query.
  const url = new URL(req.url);
  const period = url.searchParams.get('period') ?? 'daily';
  const format = url.searchParams.get('format') ?? 'xlsx';
  const dateParam = url.searchParams.get('date');

  if (!SUPPORTED_PERIODS.has(period)) return bad('unsupported_period');
  if (!SUPPORTED_FORMATS.has(format)) return bad('unsupported_format');

  const date = dateParam && isValidDateString(dateParam) ? dateParam : todayInAppTZ();
  const { start, end } = dayRangeInAppTZ(date);

  // Filters share the same param names as the daily-sheet page.
  const rawParams: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) rawParams[k] = v;
  const filters = parseSalesFilters(rawParams);

  // 3. Fetch (reuses the page queries — same WHERE, same totals).
  const [totals, sales] = await Promise.all([
    getDailySalesTotals(start, end, filters),
    listDailySales(start, end, filters),
  ]);

  // 4. Build the file. Cast through unknown to satisfy TS 5.7's stricter
  //    Uint8Array<ArrayBufferLike> vs BodyInit shape. The runtime accepts
  //    Uint8Array directly.
  let bytes: Uint8Array;
  let filename: string;
  if (format === 'xlsx') {
    bytes = await buildSalesDailyXlsx(date, totals, sales);
    filename = salesDailyFilename(date);
  } else {
    bytes = buildSalesDailyPdf(date, totals, sales);
    filename = salesDailyPdfFilename(date);
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
