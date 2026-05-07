/**
 * GET /api/export/withdrawals
 *
 * Daily-only in V1. Super_admin only (08-SECURITY.md: cajero blocked from
 * any withdrawals report).
 */
import { NextResponse } from 'next/server';
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
} from '@/lib/auth';
import { dayRangeInAppTZ, isValidDateString, todayInAppTZ } from '@/lib/dates';
import {
  getDailyWithdrawalsTotals,
  listDailyWithdrawals,
} from '@/lib/queries/withdrawals';
import {
  buildWithdrawalsDailyXlsx,
  withdrawalsDailyFilename,
} from '@/lib/export/withdrawals-xlsx';
import {
  buildWithdrawalsDailyPdf,
  withdrawalsDailyPdfFilename,
} from '@/lib/export/withdrawals-pdf';

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
  const dateParam = url.searchParams.get('date');

  if (!SUPPORTED_PERIODS.has(period)) return bad('unsupported_period');
  if (!SUPPORTED_FORMATS.has(format)) return bad('unsupported_format');

  const date = dateParam && isValidDateString(dateParam) ? dateParam : todayInAppTZ();
  const { start, end } = dayRangeInAppTZ(date);

  const [totals, withdrawals] = await Promise.all([
    getDailyWithdrawalsTotals(start, end),
    listDailyWithdrawals(start, end),
  ]);

  let bytes: Uint8Array;
  let filename: string;
  if (format === 'xlsx') {
    bytes = await buildWithdrawalsDailyXlsx(date, totals, withdrawals);
    filename = withdrawalsDailyFilename(date);
  } else {
    bytes = buildWithdrawalsDailyPdf(date, totals, withdrawals);
    filename = withdrawalsDailyPdfFilename(date);
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
