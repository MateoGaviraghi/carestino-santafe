/**
 * GET /api/export/expenses — single filterable list export. Super_admin only.
 *
 * Query params: same as /gastos/lista (q, provider, method, cardBrand,
 * installments, from, to) + format=xlsx|pdf.
 */
import { NextResponse } from 'next/server';
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
} from '@/lib/auth';
import { parseExpenseFilters } from '@/lib/expense-filters';
import { listExpenses } from '@/lib/queries/expenses';
import { buildExpensesXlsx, expensesFilename } from '@/lib/export/expenses-xlsx';
import { buildExpensesPdf, expensesPdfFilename } from '@/lib/export/expenses-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  const format = url.searchParams.get('format') ?? 'xlsx';
  if (!SUPPORTED_FORMATS.has(format)) return bad('unsupported_format');

  const rawParams: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) rawParams[k] = v;
  const filters = parseExpenseFilters(rawParams);
  const result = await listExpenses(filters);

  let bytes: Uint8Array;
  let filename: string;
  if (format === 'xlsx') {
    bytes = await buildExpensesXlsx(result);
    filename = expensesFilename();
  } else {
    bytes = buildExpensesPdf(result);
    filename = expensesPdfFilename();
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
