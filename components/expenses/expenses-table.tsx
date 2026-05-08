import Link from 'next/link';
import { Pencil } from 'lucide-react';

import { formatTimeInAppTZ, formatDateInAppTZ } from '@/lib/dates';
import { formatARS } from '@/lib/money';
import type { ExpenseRow } from '@/lib/queries/expenses';
import type { PaymentMethod } from '@/db/schema';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DeleteExpenseButton } from '@/components/expenses/delete-expense-button';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
};

function methodChipText(r: ExpenseRow): string {
  const base = METHOD_LABEL[r.method];
  const brand = r.cardBrandName ? ` ${r.cardBrandName}` : '';
  const cuotas = r.installments ? ` ${r.installments}c` : '';
  return `${base}${brand}${cuotas}`;
}

type Props = {
  rows: ExpenseRow[];
};

export function ExpensesTable({ rows }: Props) {
  if (rows.length === 0) return null;

  return (
    <div className="-mx-4 overflow-x-auto rounded-none border-y border-border sm:mx-0 sm:rounded-card sm:border">
      <table className="w-full min-w-[680px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left">
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Fecha
            </th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Proveedor
            </th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Método
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Monto
            </th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Observaciones
            </th>
            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-border last:border-0 hover:bg-muted/30"
            >
              <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground tabular-nums">
                <div>{formatDateInAppTZ(r.expenseDate)}</div>
                <div className="text-[10px]">{formatTimeInAppTZ(r.expenseDate)}</div>
              </td>
              <td className="px-3 py-3 font-medium">{r.provider}</td>
              <td className="px-3 py-3">
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs',
                    'border-border bg-muted text-foreground',
                  )}
                >
                  {methodChipText(r)}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums">
                {formatARS(r.amount)}
              </td>
              <td className="px-3 py-3 text-xs text-muted-foreground">
                {r.observations || '—'}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-right">
                <div className="flex justify-end gap-1">
                  <Link href={`/gastos/${r.id}/editar`}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Editar gasto"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </Link>
                  <DeleteExpenseButton
                    expenseId={r.id}
                    amount={r.amount}
                    expenseDate={r.expenseDate}
                    provider={r.provider}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
