import Link from 'next/link';
import { Pencil } from 'lucide-react';

import { formatTimeInAppTZ } from '@/lib/dates';
import { formatARS } from '@/lib/money';
import type { DailyWithdrawal } from '@/lib/queries/withdrawals';
import type { Role } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { DeleteWithdrawalButton } from '@/components/withdrawals/delete-withdrawal-button';

type Props = {
  withdrawals: DailyWithdrawal[];
  role: Role;
};

export function WithdrawalsTable({ withdrawals, role }: Props) {
  if (withdrawals.length === 0) return null;
  const showActions = role === 'super_admin';

  return (
    <div className="-mx-4 overflow-x-auto rounded-none border-y border-border sm:mx-0 sm:rounded-card sm:border">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left">
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Hora
            </th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Persona
            </th>
            <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Monto
            </th>
            {showActions && (
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Acciones
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {withdrawals.map((w) => (
            <tr
              key={w.id}
              className="border-b border-border last:border-0 hover:bg-muted/30"
            >
              <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground tabular-nums">
                {formatTimeInAppTZ(w.withdrawalDate)}
              </td>
              <td className="px-3 py-3">{w.personName}</td>
              <td className="whitespace-nowrap px-3 py-3 font-medium tabular-nums">
                {formatARS(w.amount)}
              </td>
              {showActions && (
                <td className="whitespace-nowrap px-3 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Link href={`/retiros/${w.id}/editar`}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Editar retiro"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Link>
                    <DeleteWithdrawalButton
                      withdrawalId={w.id}
                      amount={w.amount}
                      withdrawalDate={w.withdrawalDate}
                      personName={w.personName}
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
