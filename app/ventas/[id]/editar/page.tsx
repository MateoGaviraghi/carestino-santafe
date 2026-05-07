import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
} from '@/lib/auth';
import { listActiveCardBrands } from '@/lib/queries/card-brands';
import { getSaleForEdit } from '@/lib/queries/sales';
import { formatDateInAppTZ } from '@/lib/dates';
import { SaleForm } from '@/components/sales/sale-form';
import type { UpdateSaleInput } from '@/lib/validators/sale';

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function EditSalePage({ params }: { params: Params }) {
  // super_admin only (D-018).
  try {
    await requireRole(['super_admin']);
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect('/');
    if (e instanceof ForbiddenError) redirect('/');
    throw e;
  }

  const { id } = await params;
  const [sale, cardBrands] = await Promise.all([
    getSaleForEdit(id),
    listActiveCardBrands(),
  ]);

  if (!sale) notFound();

  // Map the sale + payments to UpdateSaleInput shape for the form.
  const defaultValues: UpdateSaleInput = {
    totalAmount: sale.totalAmount,
    observations: sale.observations ?? '',
    saleDate: formatDateInAppTZ(sale.saleDate),
    payments: sale.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      cardBrandId: p.cardBrandId ?? undefined,
      installments: (p.installments ?? undefined) as 1 | 3 | 6 | undefined,
    })),
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <Link
          href="/ventas/diaria"
          className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          ← Volver a planilla diaria
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Editar venta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Modificá los datos y confirmá. Los pagos anteriores se reemplazan por los nuevos.
        </p>
      </header>

      <SaleForm
        mode="edit"
        cardBrands={cardBrands}
        saleId={sale.id}
        defaultValues={defaultValues}
      />
    </main>
  );
}
