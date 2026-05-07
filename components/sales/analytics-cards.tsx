import { formatARS } from '@/lib/money';
import type { DailyTotals } from '@/lib/queries/sales';
import { cn } from '@/lib/utils';

type CardSpec = {
  label: string;
  value: string;
  emphasized?: boolean;
};

type Props = {
  totals: DailyTotals;
  className?: string;
};

export function AnalyticsCards({ totals, className }: Props) {
  const cards: CardSpec[] = [
    { label: 'Ventas total', value: formatARS(totals.salesTotal), emphasized: true },
    { label: 'Efectivo', value: formatARS(totals.perMethod.efectivo) },
    { label: 'Transferencia', value: formatARS(totals.perMethod.transferencia) },
    { label: 'Débito', value: formatARS(totals.perMethod.debito) },
    { label: 'Crédito 1c', value: formatARS(totals.perMethod.credito1) },
    { label: 'Crédito 3c', value: formatARS(totals.perMethod.credito3) },
    { label: 'Crédito 6c', value: formatARS(totals.perMethod.credito6) },
  ];

  return (
    <div
      className={cn(
        'flex gap-3 overflow-x-auto pb-2',
        'scrollbar-thin scrollbar-thumb-border',
        className,
      )}
    >
      {cards.map((c) => (
        <div
          key={c.label}
          className={cn(
            'min-w-[160px] flex-shrink-0 rounded-card border p-4',
            c.emphasized
              ? 'border-primary/30 bg-primary/5'
              : 'border-border bg-card',
          )}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {c.label}
          </div>
          <div
            className={cn(
              'mt-2 text-xl font-semibold tabular-nums',
              c.emphasized ? 'text-primary' : 'text-foreground',
            )}
          >
            {c.value}
          </div>
          {c.emphasized && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              {totals.salesCount} venta{totals.salesCount === 1 ? '' : 's'}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
