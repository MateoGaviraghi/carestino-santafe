/**
 * Integration tests for the sales export route handler.
 *
 * Mocks auth and the query layer so we don't have to reset Neon between
 * runs — the only thing under test here is the routing/RBAC/headers
 * contract. Workbook content is exercised by sales-xlsx.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

import { ForbiddenError, UnauthorizedError, type SessionUser } from '@/lib/auth';
import type { DailySale, DailyTotals } from '@/lib/queries/sales';

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, getSessionUser: vi.fn() };
});
vi.mock('@/lib/queries/sales', () => ({
  getDailySalesTotals: vi.fn(),
  listDailySales: vi.fn(),
}));

const { getSessionUser } = await import('@/lib/auth');
const { getDailySalesTotals, listDailySales } = await import('@/lib/queries/sales');
const { GET } = await import('./route');

const TOTALS: DailyTotals = {
  salesCount: 1,
  salesTotal: '500.00',
  perMethod: {
    efectivo: '500.00',
    transferencia: '0',
    debito: '0',
    credito1: '0',
    credito3: '0',
    credito6: '0',
  },
};

const SALES: DailySale[] = [
  {
    id: 'sale-1',
    totalAmount: '500.00',
    observations: null,
    saleDate: new Date('2026-04-01T13:00:00Z'),
    createdBy: 'u1',
    payments: [
      {
        id: 'p1',
        method: 'efectivo',
        amount: '500.00',
        cardBrandId: null,
        cardBrandName: null,
        installments: null,
      },
    ],
  },
];

const SIGNED_IN_ADMIN: SessionUser = { userId: 'u1', role: 'super_admin' };

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset();
  vi.mocked(getDailySalesTotals).mockReset();
  vi.mocked(listDailySales).mockReset();

  vi.mocked(getSessionUser).mockResolvedValue(SIGNED_IN_ADMIN);
  vi.mocked(getDailySalesTotals).mockResolvedValue(TOTALS);
  vi.mocked(listDailySales).mockResolvedValue(SALES);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeReq(qs: string): Request {
  return new Request(`http://test.local/api/export/sales?${qs}`);
}

describe('GET /api/export/sales', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getSessionUser).mockRejectedValueOnce(new UnauthorizedError());
    const r = await GET(makeReq('period=daily&date=2026-04-01&format=xlsx'));
    expect(r.status).toBe(401);
  });

  it('returns 403 when role is not allowed', async () => {
    vi.mocked(getSessionUser).mockRejectedValueOnce(new ForbiddenError());
    const r = await GET(makeReq('period=daily&date=2026-04-01&format=xlsx'));
    expect(r.status).toBe(403);
  });

  it('returns 400 for an unsupported period', async () => {
    const r = await GET(makeReq('period=monthly&date=2026-04-01&format=xlsx'));
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.error).toBe('unsupported_period');
  });

  it('returns 400 for an unsupported format', async () => {
    const r = await GET(makeReq('period=daily&date=2026-04-01&format=pdf'));
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body.error).toBe('unsupported_format');
  });

  it('returns 200 with xlsx content-type and the expected filename', async () => {
    const r = await GET(makeReq('period=daily&date=2026-04-01&format=xlsx'));
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toMatch(/spreadsheetml/);
    expect(r.headers.get('Content-Disposition')).toContain(
      'ventas-diaria-2026-04-01.xlsx',
    );
    const ab = await r.arrayBuffer();
    expect(ab.byteLength).toBeGreaterThan(0);
    // Sanity check: round-trip the bytes through SheetJS.
    const wb = XLSX.read(new Uint8Array(ab), { type: 'array' });
    expect(wb.SheetNames).toEqual(['Resumen', 'Ventas']);
  });

  it('passes parsed filters into the queries', async () => {
    await GET(
      makeReq(
        'period=daily&date=2026-04-01&format=xlsx&method=efectivo,credito&q=tarjeta',
      ),
    );
    const totalsCall = vi.mocked(getDailySalesTotals).mock.calls[0];
    expect(totalsCall).toBeDefined();
    const filtersArg = totalsCall![2];
    expect(filtersArg).toEqual({
      methods: ['efectivo', 'credito'],
      search: 'tarjeta',
    });
  });

  it('falls back to today when date is missing or invalid', async () => {
    const r = await GET(makeReq('period=daily&format=xlsx'));
    expect(r.status).toBe(200);
    const cd = r.headers.get('Content-Disposition') ?? '';
    // Should still produce a filename of the expected shape.
    expect(cd).toMatch(/ventas-diaria-\d{4}-\d{2}-\d{2}\.xlsx/);
  });
});
