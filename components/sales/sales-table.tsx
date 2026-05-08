import Link from 'next/link';
import { Pencil } from 'lucide-react';

import { formatTimeInAppTZ } from '@/lib/dates';
import { formatARS } from '@/lib/money';
import type { DailySale, DailySalePayment } from '@/lib/queries/sales';
import type { PaymentMethod } from '@/db/schema';
import type { Role } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DeleteSaleButton } from '@/components/sales/delete-sale-button';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
};

function paymentChipText(p: DailySalePayment): string {
  const base = METHOD_LABEL[p.method];
  const brand = p.cardBrandName ? ` ${p.cardBrandName}` : '';
  const cuotas = p.installments ? ` ${p.installments}c` : '';
  return `${base}${brand}${cuotas} · ${formatARS(p.amount)}`;
}

function PaymentChip({ payment }: { payment: DailySalePayment }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs',
        'border-border bg-muted text-foreground tabular-nums',
      )}
    >
      {paymentChipText(payment)}
    </span>
  );
}

type Props = {
  sales: DailySale[];
  /** Role of the viewer — gates the Acciones column. */
  role: Role;
};

export function SalesTable({ sales, role }: Props) {
  if (sales.length === 0) return null;
  const showActions = role === 'super_admin';

  return (
    <div className="-mx-4 overflow-x-auto rounded-none border-y border-border sm:mx-0 sm:rounded-card sm:border">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left">
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Hora
            </th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Total
            </th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Métodos
            </th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Observaciones
            </th>
            {showActions && (
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Acciones
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {sales.map((s) => (
            <tr
              key={s.id}
              className="border-b border-border last:border-0 hover:bg-muted/30"
            >
              <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground tabular-nums">
                {formatTimeInAppTZ(s.saleDate)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 font-medium tabular-nums">
                {formatARS(s.totalAmount)}
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-1.5">
                  {s.payments.map((p) => (
                    <PaymentChip key={p.id} payment={p} />
                  ))}
                </div>
              </td>
              <td className="px-3 py-3 text-xs text-muted-foreground">
                {s.observations || '—'}
              </td>
              {showActions && (
                <td className="whitespace-nowrap px-3 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Link href={`/ventas/${s.id}/editar`}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Editar venta"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Link>
                    <DeleteSaleButton
                      saleId={s.id}
                      totalAmount={s.totalAmount}
                      saleDate={s.saleDate}
                    />
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
