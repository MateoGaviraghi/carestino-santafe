import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
} from '@/lib/auth';
import { fromZonedTime } from 'date-fns-tz';
import { APP_TZ, todayInAppTZ } from '@/lib/dates';
import { getAnnualWithdrawals } from '@/lib/queries/withdrawals';
import { formatARS } from '@/lib/money';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = 'force-dynamic';

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

export default async function AnnualWithdrawalsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  try {
    await requireRole(['super_admin']);
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect('/');
    if (e instanceof ForbiddenError) redirect('/');
    throw e;
  }

  const params = await searchParams;
  const yearParam = typeof params.year === 'string' ? params.year : undefined;
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : Number(todayInAppTZ().slice(0, 4));

  const start = fromZonedTime(`${year}-01-01T00:00:00.000`, APP_TZ);
  const end = fromZonedTime(`${year + 1}-01-01T00:00:00.000`, APP_TZ);

  const rows = await getAnnualWithdrawals(start, end);
  const yearTotal = rows.reduce((acc, r) => acc + Number(r.total), 0);
  const yearCount = rows.reduce((acc, r) => acc + r.count, 0);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Link
            href="/"
            className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Retiros — Anual</h1>
          <p className="mt-1 text-sm text-muted-foreground">{year}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <form method="get" className="col-span-2 flex items-center gap-2 sm:col-span-1">
            <input
              type="number"
              name="year"
              min="2020"
              max="2100"
              defaultValue={year}
              className="h-11 w-28 rounded-input border border-input bg-background px-3 text-base tabular-nums sm:h-9 sm:w-24 sm:text-sm"
            />
            <button
              type="submit"
              className="h-11 rounded-input bg-muted px-4 text-sm font-medium hover:bg-muted/80 sm:h-9 sm:px-3 sm:text-xs"
            >
              Ver
            </button>
          </form>
          <a
            href={`/api/export/withdrawals?period=annual&year=${year}&format=xlsx`}
            className="inline-flex h-10 items-center justify-center rounded-input border border-border bg-background px-3 text-sm font-medium hover:bg-muted sm:h-9 sm:text-xs"
          >
            Excel
          </a>
          <a
            href={`/api/export/withdrawals?period=annual&year=${year}&format=pdf`}
            className="inline-flex h-10 items-center justify-center rounded-input border border-border bg-background px-3 text-sm font-medium hover:bg-muted sm:h-9 sm:text-xs"
          >
            PDF
          </a>
        </div>
      </header>

      <div className="mb-8 rounded-card border border-primary/30 bg-primary/5 p-5 text-center">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Total del año
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums text-primary sm:text-3xl">
          {formatARS(yearTotal.toFixed(2))}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {yearCount} retiro{yearCount === 1 ? '' : 's'}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
          No hay retiros registrados en este año.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left">
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Mes
                </th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Cantidad
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Monto
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const [, mm] = r.month.split('-');
                const monthIdx = Number(mm) - 1;
                const label = `${MONTHS_ES[monthIdx]}`;
                return (
                  <tr
                    key={r.month}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-3 py-3 capitalize">
                      <Link
                        href={`/retiros/mensual?month=${r.month}`}
                        className="hover:underline"
                      >
                        {label}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground tabular-nums">
                      {r.count}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums">
                      {formatARS(r.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
