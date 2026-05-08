import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ForbiddenError,
  UnauthorizedError,
  getSessionUser,
} from '@/lib/auth';
import { listActiveWithdrawalPersons } from '@/lib/queries/withdrawals';
import { WithdrawalForm } from '@/components/withdrawals/withdrawal-form';

export const dynamic = 'force-dynamic';

export default async function NewWithdrawalPage() {
  // Both roles can create withdrawals (08-SECURITY.md matrix).
  try {
    await getSessionUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect('/');
    if (e instanceof ForbiddenError) redirect('/');
    throw e;
  }

  const persons = await listActiveWithdrawalPersons();

  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <Link
          href="/"
          className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          ← Volver
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nuevo retiro</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cargá el monto y la persona que retira.
        </p>
      </header>
      <WithdrawalForm mode="create" persons={persons} />
    </main>
  );
}
