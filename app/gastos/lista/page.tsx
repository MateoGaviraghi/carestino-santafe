import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
} from '@/lib/auth';
import {
  hasActiveExpenseFilters,
  parseExpenseFilters,
  serializeExpenseFilters,
} from '@/lib/expense-filters';
import { listActiveCardBrands } from '@/lib/queries/card-brands';
import { listExpenseProviders, listExpenses } from '@/lib/queries/expenses';
import { formatARS } from '@/lib/money';
import { ExpensesFiltersBar } from '@/components/expenses/expenses-filters';
import { ExpensesTable } from '@/components/expenses/expenses-table';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = 'force-dynamic';

export default async function ExpensesListPage({
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
  const filters = parseExpenseFilters(params);

  const [list, cardBrands, providers] = await Promise.all([
    listExpenses(filters),
    listActiveCardBrands(),
    listExpenseProviders(),
  ]);

  // Build export URLs preserving filters.
  const baseExport = serializeExpenseFilters(filters);
  const xlsxParams = new URLSearchParams(baseExport);
  xlsxParams.set('format', 'xlsx');
  const exportXlsx = `/api/export/expenses?${xlsxParams.toString()}`;
  const pdfParams = new URLSearchParams(baseExport);
  pdfParams.set('format', 'pdf');
  const exportPdf = `/api/export/expenses?${pdfParams.toString()}`;

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
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Gastos</h1>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={exportXlsx}
            className="inline-flex h-9 items-center rounded-input border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
          >
            Excel
          </a>
          <a
            href={exportPdf}
            className="inline-flex h-9 items-center rounded-input border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
          >
            PDF
          </a>
          <Link
            href="/gastos/nuevo"
            className="inline-flex h-9 items-center rounded-input bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            + Nuevo gasto
          </Link>
        </div>
      </header>

      <ExpensesFiltersBar filters={filters} cardBrands={cardBrands} providers={providers} />

      <div className="my-6 rounded-card border border-primary/30 bg-primary/5 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Total filtrado
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-primary">
              {formatARS(list.total)}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {list.count} gasto{list.count === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {list.rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-card px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {hasActiveExpenseFilters(filters)
              ? 'Ningún gasto coincide con los filtros aplicados.'
              : 'No hay gastos registrados todavía.'}
          </p>
          {!hasActiveExpenseFilters(filters) && (
            <Link
              href="/gastos/nuevo"
              className="rounded-input bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Registrar el primer gasto
            </Link>
          )}
        </div>
      ) : (
        <ExpensesTable rows={list.rows} />
      )}
    </main>
  );
}
