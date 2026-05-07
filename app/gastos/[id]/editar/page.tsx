import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
} from '@/lib/auth';
import { listActiveCardBrands } from '@/lib/queries/card-brands';
import {
  getExpenseForEdit,
  listExpenseProviders,
} from '@/lib/queries/expenses';
import { formatDateInAppTZ } from '@/lib/dates';
import { ExpenseForm } from '@/components/expenses/expense-form';
import type { UpdateExpenseInput } from '@/lib/validators/expense';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function EditExpensePage({ params }: { params: Params }) {
  try {
    await requireRole(['super_admin']);
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect('/');
    if (e instanceof ForbiddenError) redirect('/');
    throw e;
  }

  const { id } = await params;
  const [expense, cardBrands, providers] = await Promise.all([
    getExpenseForEdit(id),
    listActiveCardBrands(),
    listExpenseProviders(),
  ]);
  if (!expense) notFound();

  const defaultValues: UpdateExpenseInput = {
    provider: expense.provider,
    amount: expense.amount,
    method: expense.method,
    cardBrandId: expense.cardBrandId ?? undefined,
    installments: (expense.installments ?? undefined) as 1 | 3 | 6 | undefined,
    observations: expense.observations ?? '',
    expenseDate: formatDateInAppTZ(expense.expenseDate),
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <Link
          href="/gastos/lista"
          className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          ← Volver a gastos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Editar gasto</h1>
      </header>

      <ExpenseForm
        mode="edit"
        cardBrands={cardBrands}
        providers={providers}
        expenseId={expense.id}
        defaultValues={defaultValues}
      />
    </main>
  );
}
