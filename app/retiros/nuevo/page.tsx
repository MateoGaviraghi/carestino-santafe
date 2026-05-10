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
import { WITHDRAWAL_DATE_EDIT_WINDOW_DAYS } from '@/lib/validators/withdrawal';
import { listActiveWithdrawalPersons } from '@/lib/queries/withdrawals';
import { WithdrawalForm } from '@/components/withdrawals/withdrawal-form';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = 'force-dynamic';

function resolveBackdate(
  raw: string | string[] | undefined,
  role: 'super_admin' | 'cajero',
  today: string,
): string | undefined {
  if (role !== 'super_admin') return undefined;
  if (typeof raw !== 'string') return undefined;
  if (!isValidDateString(raw)) return undefined;
  if (raw === today) return undefined;
  if (!isWithinDaysWindow(raw, WITHDRAWAL_DATE_EDIT_WINDOW_DAYS)) return undefined;
  return raw;
}

export default async function NewWithdrawalPage({
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

  const persons = await listActiveWithdrawalPersons();
  const today = todayInAppTZ();
  const params = await searchParams;
  const prefillDate = resolveBackdate(params.date, session.role, today);
  const prefillDateLabel = prefillDate
    ? formatLongDateInAppTZ(prefillDate)
    : undefined;

  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <Link
          href={prefillDate ? `/retiros/diaria?date=${prefillDate}` : '/'}
          className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          ← {prefillDate ? 'Volver a la planilla' : 'Volver'}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nuevo retiro</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cargá el monto y la persona que retira.
        </p>
      </header>
      <WithdrawalForm
        mode="create"
        persons={persons}
        prefillDate={prefillDate}
        prefillDateLabel={prefillDateLabel}
      />
    </main>
  );
}
