import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  ForbiddenError,
  UnauthorizedError,
  getSessionUser,
} from '@/lib/auth';
import { todayInAppTZ } from '@/lib/dates';
import { listActiveCardBrands } from '@/lib/queries/card-brands';
import { SaleForm } from '@/components/sales/sale-form';

export const dynamic = 'force-dynamic';

export default async function NewSalePage() {
  // Both roles can create sales — middleware already gated unauthenticated.
  let session;
  try {
    session = await getSessionUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect('/');
    if (e instanceof ForbiddenError) redirect('/');
    throw e;
  }

  const cardBrands = await listActiveCardBrands();
  const canBackdate = session.role === 'super_admin';
  const today = todayInAppTZ();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <Link
            href="/"
            className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            ← Volver
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
        canBackdate={canBackdate}
        todayInAppTZ={today}
      />
    </main>
  );
}
