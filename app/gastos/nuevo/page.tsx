import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
} from '@/lib/auth';
import { todayInAppTZ } from '@/lib/dates';
import { listActiveCardBrands } from '@/lib/queries/card-brands';
import { listExpenseProviders } from '@/lib/queries/expenses';
import { ExpenseForm } from '@/components/expenses/expense-form';

export const dynamic = 'force-dynamic';

export default async function NewExpensePage() {
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

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <Link
          href="/"
          className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          ← Volver
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
        todayInAppTZ={todayInAppTZ()}
      />
    </main>
  );
}
