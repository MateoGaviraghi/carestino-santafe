import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
} from '@/lib/auth';
import {
  formatLongDateInAppTZ,
  isValidDateString,
  isWithinDaysWindow,
  todayInAppTZ,
} from '@/lib/dates';
import { EXPENSE_DATE_EDIT_WINDOW_DAYS } from '@/lib/validators/expense';
import { listActiveCardBrands } from '@/lib/queries/card-brands';
import { listExpenseProviders } from '@/lib/queries/expenses';
import { ExpenseForm } from '@/components/expenses/expense-form';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = 'force-dynamic';

function resolveBackdate(
  raw: string | string[] | undefined,
  today: string,
): string | undefined {
  if (typeof raw !== 'string') return undefined;
  if (!isValidDateString(raw)) return undefined;
  if (raw === today) return undefined;
  if (!isWithinDaysWindow(raw, EXPENSE_DATE_EDIT_WINDOW_DAYS)) return undefined;
  return raw;
}

export default async function NewExpensePage({
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

  const [cardBrands, providers] = await Promise.all([
    listActiveCardBrands(),
    listExpenseProviders(),
  ]);

  const today = todayInAppTZ();
  const params = await searchParams;
  const prefillDate = resolveBackdate(params.date, today);
  const prefillDateLabel = prefillDate
    ? formatLongDateInAppTZ(prefillDate)
    : undefined;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <Link
          href={prefillDate ? `/gastos/lista?from=${prefillDate}&to=${prefillDate}` : '/'}
          className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          ← {prefillDate ? 'Volver al listado' : 'Volver'}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nuevo gasto</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cargá el proveedor, monto y método de pago.
        </p>
      </header>
      <ExpenseForm
        mode="create"
        cardBrands={cardBrands}
        providers={providers}
        prefillDate={prefillDate}
        prefillDateLabel={prefillDateLabel}
      />
    </main>
  );
}
