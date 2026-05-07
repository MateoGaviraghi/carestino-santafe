import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  ForbiddenError,
  UnauthorizedError,
  getSessionUser,
} from '@/lib/auth';
import {
  dayRangeInAppTZ,
  formatLongDateInAppTZ,
  isValidDateString,
  todayInAppTZ,
} from '@/lib/dates';
import {
  hasActiveFilters,
  parseSalesFilters,
  serializeSalesFilters,
} from '@/lib/filters';
import { listActiveCardBrands } from '@/lib/queries/card-brands';
import { getDailySalesTotals, listDailySales } from '@/lib/queries/sales';
import { AnalyticsCards } from '@/components/sales/analytics-cards';
import { SalesFiltersBar } from '@/components/sales/sales-filters';
import { SalesTable } from '@/components/sales/sales-table';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = 'force-dynamic';

export default async function DailySalesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Both roles can read the daily sheet — admin gets edit affordances later.
  try {
    await getSessionUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect('/');
    if (e instanceof ForbiddenError) redirect('/');
    throw e;
  }

  const params = await searchParams;
  const dateParam = typeof params.date === 'string' ? params.date : undefined;
  const requested = dateParam && isValidDateString(dateParam) ? dateParam : null;
  const date = requested ?? todayInAppTZ();
  const isToday = date === todayInAppTZ();
  const longDate = formatLongDateInAppTZ(date);
  const { start, end } = dayRangeInAppTZ(date);
  const filters = parseSalesFilters(params);

  const [totals, sales, cardBrands] = await Promise.all([
    getDailySalesTotals(start, end, filters),
    listDailySales(start, end, filters),
    listActiveCardBrands(),
  ]);

  // Build the Excel export URL with current date + filters preserved.
  const exportParams = serializeSalesFilters(filters);
  exportParams.set('period', 'daily');
  exportParams.set('date', date);
  exportParams.set('format', 'xlsx');
  const exportXlsxUrl = `/api/export/sales?${exportParams.toString()}`;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Link
            href="/"
            className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Planilla diaria</h1>
          <p className="mt-1 text-sm capitalize text-muted-foreground">
            {longDate}
            {isToday && ' (hoy)'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <form method="get" className="flex items-center gap-2">
            <label htmlFor="date" className="sr-only">
              Fecha
            </label>
            <input
              id="date"
              name="date"
              type="date"
              defaultValue={date}
              className="h-9 rounded-input border border-input bg-background px-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="submit"
              className="h-9 rounded-input bg-muted px-3 text-xs font-medium hover:bg-muted/80"
            >
              Ver
            </button>
          </form>
          <a
            href={exportXlsxUrl}
            className="inline-flex h-9 items-center rounded-input border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
          >
            Exportar Excel
          </a>
          <Link
            href="/ventas/nueva"
            className="inline-flex h-9 items-center rounded-input bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            + Nueva venta
          </Link>
        </div>
      </header>

      <SalesFiltersBar filters={filters} cardBrands={cardBrands} />

      <AnalyticsCards totals={totals} className="mb-8 mt-6" />

      {sales.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-card px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {hasActiveFilters(filters)
              ? 'Ninguna venta de esta fecha coincide con los filtros aplicados.'
              : 'No hay ventas registradas para esta fecha.'}
          </p>
          {!hasActiveFilters(filters) && (
            <Link
              href="/ventas/nueva"
              className="rounded-input bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Registrar la primera venta
            </Link>
          )}
        </div>
      ) : (
        <SalesTable sales={sales} />
      )}
    </main>
  );
}
