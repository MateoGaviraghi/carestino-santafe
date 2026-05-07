import Link from 'next/link';
import { formatARS } from '@/lib/money';
import type { AggregatePerMethodRow } from '@/lib/queries/sales';

type Props = {
  rows: AggregatePerMethodRow[];
  /** First column header — "Día" for monthly, "Mes" for annual. */
  bucketHeader: string;
  /** Builder for drill-down link. Receives the bucket string, returns href or null for no link. */
  drillHref?: (bucket: string) => string | null;
  /** How to render the bucket text (e.g. "lun 7" instead of "2026-05-07"). */
  formatBucket?: (bucket: string) => string;
};

export function AggregateSalesTable({
  rows,
  bucketHeader,
  drillHref,
  formatBucket,
}: Props) {
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left">
            <Th>{bucketHeader}</Th>
            <Th>Cant.</Th>
            <Th align="right">Ventas total</Th>
            <Th align="right">Efectivo</Th>
            <Th align="right">Transf.</Th>
            <Th align="right">Débito</Th>
            <Th align="right">Crédito 1c</Th>
            <Th align="right">Crédito 3c</Th>
            <Th align="right">Crédito 6c</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const href = drillHref?.(r.bucket);
            const label = formatBucket ? formatBucket(r.bucket) : r.bucket;
            return (
              <tr
                key={r.bucket}
                className="border-b border-border last:border-0 hover:bg-muted/30"
              >
                <td className="px-3 py-3 tabular-nums">
                  {href ? (
                    <Link href={href} className="hover:underline">
                      {label}
                    </Link>
                  ) : (
                    label
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground tabular-nums">
                  {r.salesCount}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-primary">
                  {formatARS(r.salesTotal)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                  {formatARS(r.perMethod.efectivo)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                  {formatARS(r.perMethod.transferencia)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                  {formatARS(r.perMethod.debito)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                  {formatARS(r.perMethod.credito1)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                  {formatARS(r.perMethod.credito3)}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                  {formatARS(r.perMethod.credito6)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${
        align === 'right' ? 'text-right' : ''
      }`}
    >
      {children}
    </th>
  );
}
