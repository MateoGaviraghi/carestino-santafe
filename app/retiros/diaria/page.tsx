import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
} from '@/lib/auth';
import {
  dayRangeInAppTZ,
  formatLongDateInAppTZ,
  isValidDateString,
  todayInAppTZ,
} from '@/lib/dates';
import {
  getDailyWithdrawalsTotals,
  listDailyWithdrawals,
} from '@/lib/queries/withdrawals';
import { DatePicker } from '@/components/sales/date-picker';
import { WithdrawalsAnalyticsCards } from '@/components/withdrawals/withdrawals-analytics-cards';
import { WithdrawalsTable } from '@/components/withdrawals/withdrawals-table';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = 'force-dynamic';

export default async function DailyWithdrawalsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // super_admin only — cashier creates withdrawals but can't see the sheet.
  try {
    await requireRole(['super_admin']);
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

  const [totals, list] = await Promise.all([
    getDailyWithdrawalsTotals(start, end),
    listDailyWithdrawals(start, end),
  ]);

  const exportXlsx = `/api/export/withdrawals?period=daily&date=${date}&format=xlsx`;
  const exportPdf = `/api/export/withdrawals?period=daily&date=${date}&format=pdf`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Link
            href="/"
            className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            ← Volver
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Retiros — Diaria</h1>
          <p className="mt-1 text-sm capitalize text-muted-foreground">
            {longDate}
            {isToday && ' (hoy)'}
          </p>
        </div>

        <div className="grid grid-cols-2 items-stretch gap-2 sm:flex sm:items-center">
          <div className="col-span-2 sm:col-span-1">
            <DatePicker date={date} />
          </div>
          <a
            href={exportXlsx}
            className="inline-flex h-10 items-center justify-center rounded-input border border-border bg-background px-3 text-sm font-medium hover:bg-muted sm:h-9 sm:text-xs"
          >
            Excel
          </a>
          <a
            href={exportPdf}
            className="inline-flex h-10 items-center justify-center rounded-input border border-border bg-background px-3 text-sm font-medium hover:bg-muted sm:h-9 sm:text-xs"
          >
            PDF
          </a>
          <Link
            href={isToday ? '/retiros/nuevo' : `/retiros/nuevo?date=${date}`}
            className="col-span-2 inline-flex h-11 items-center justify-center rounded-input bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 sm:col-span-1 sm:h-9 sm:px-3 sm:text-xs"
          >
            + Nuevo retiro{!isToday ? ' (este día)' : ''}
          </Link>
        </div>
      </header>

      <WithdrawalsAnalyticsCards totals={totals} className="mb-8" />

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-card px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No hay retiros registrados para esta fecha.
          </p>
          <Link
            href={isToday ? '/retiros/nuevo' : `/retiros/nuevo?date=${date}`}
            className="rounded-input bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Registrar el primer retiro{!isToday ? ' de ese día' : ''}
          </Link>
        </div>
      ) : (
        <WithdrawalsTable withdrawals={list} role="super_admin" />
      )}
    </main>
  );
}
