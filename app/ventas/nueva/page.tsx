import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ForbiddenError,
  UnauthorizedError,
  getSessionUser,
} from '@/lib/auth';
import {
  formatLongDateInAppTZ,
  isValidDateString,
  isWithinDaysWindow,
  todayInAppTZ,
} from '@/lib/dates';
import { SALE_DATE_EDIT_WINDOW_DAYS } from '@/lib/validators/sale';
import { listActiveCardBrands } from '@/lib/queries/card-brands';
import { SaleForm } from '@/components/sales/sale-form';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = 'force-dynamic';

/**
 * Resolve a backdate from the URL `?date=YYYY-MM-DD`. Only super_admin can
 * backdate; the date must be valid and within the 60-day window. Otherwise
 * we drop it silently and the form defaults to "now()".
 */
function resolveBackdate(
  raw: string | string[] | undefined,
  role: 'super_admin' | 'cajero',
  today: string,
): string | undefined {
  if (role !== 'super_admin') return undefined;
  if (typeof raw !== 'string') return undefined;
  if (!isValidDateString(raw)) return undefined;
  if (raw === today) return undefined; // no point — DB default is now()
  if (!isWithinDaysWindow(raw, SALE_DATE_EDIT_WINDOW_DAYS)) return undefined;
  return raw;
}

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  let session;
  try {
    session = await getSessionUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect('/');
    if (e instanceof ForbiddenError) redirect('/');
    throw e;
  }

  const cardBrands = await listActiveCardBrands();
  const today = todayInAppTZ();
  const params = await searchParams;
  const prefillDate = resolveBackdate(params.date, session.role, today);
  const prefillDateLabel = prefillDate
    ? formatLongDateInAppTZ(prefillDate)
    : undefined;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <Link
            href={prefillDate ? `/ventas/diaria?date=${prefillDate}` : '/'}
            className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            ← {prefillDate ? 'Volver a la planilla' : 'Volver'}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nueva venta</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cargá el total y los métodos de pago. La suma debe coincidir.
          </p>
        </div>
      </header>

      <SaleForm
        mode="create"
        cardBrands={cardBrands}
        prefillDate={prefillDate}
        prefillDateLabel={prefillDateLabel}
      />
    </main>
  );
}
