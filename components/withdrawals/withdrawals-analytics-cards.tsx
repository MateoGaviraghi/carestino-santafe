import { formatARS } from '@/lib/money';
import type { DailyWithdrawalsTotals } from '@/lib/queries/withdrawals';
import { cn } from '@/lib/utils';

type Props = {
  totals: DailyWithdrawalsTotals;
  className?: string;
};

export function WithdrawalsAnalyticsCards({ totals, className }: Props) {
  return (
    <div className={cn('flex gap-3 overflow-x-auto pb-2', className)}>
      <div className="min-w-[180px] flex-shrink-0 rounded-card border border-primary/30 bg-primary/5 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Retiros total
        </div>
        <div className="mt-2 text-xl font-semibold tabular-nums text-primary">
          {formatARS(totals.withdrawalsTotal)}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          {totals.withdrawalsCount} retiro{totals.withdrawalsCount === 1 ? '' : 's'}
        </div>
      </div>
      {totals.perPerson.map((p) => (
        <div
          key={p.id}
          className="min-w-[160px] flex-shrink-0 rounded-card border border-border bg-card p-4"
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {p.name}
          </div>
          <div className="mt-2 text-xl font-semibold tabular-nums text-foreground">
            {formatARS(p.total)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {p.count} retiro{p.count === 1 ? '' : 's'}
          </div>
        </div>
      ))}
    </div>
  );
}
