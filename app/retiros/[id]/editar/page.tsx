import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
} from '@/lib/auth';
import {
  getWithdrawalForEdit,
  listActiveWithdrawalPersons,
} from '@/lib/queries/withdrawals';
import { formatDateInAppTZ } from '@/lib/dates';
import { WithdrawalForm } from '@/components/withdrawals/withdrawal-form';
import type { UpdateWithdrawalInput } from '@/lib/validators/withdrawal';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function EditWithdrawalPage({ params }: { params: Params }) {
  try {
    await requireRole(['super_admin']);
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect('/');
    if (e instanceof ForbiddenError) redirect('/');
    throw e;
  }

  const { id } = await params;
  const [withdrawal, persons] = await Promise.all([
    getWithdrawalForEdit(id),
    listActiveWithdrawalPersons(),
  ]);

  if (!withdrawal) notFound();

  const defaultValues: UpdateWithdrawalInput = {
    amount: withdrawal.amount,
    personId: withdrawal.personId,
    withdrawalDate: formatDateInAppTZ(withdrawal.withdrawalDate),
  };

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <header className="mb-8">
        <Link
          href="/retiros/diaria"
          className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          ← Volver a planilla diaria
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Editar retiro</h1>
      </header>

      <WithdrawalForm
        mode="edit"
        persons={persons}
        withdrawalId={withdrawal.id}
        defaultValues={defaultValues}
      />
    </main>
  );
}
