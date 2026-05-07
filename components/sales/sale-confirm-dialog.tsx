'use client';

import { useEffect } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { formatARS, safeDecimal } from '@/lib/money';
import type { PaymentMethod } from '@/db/schema';
import type { CardBrandOption } from '@/lib/queries/card-brands';
import type { CreateSaleInput } from '@/lib/validators/sale';
import { Button } from '@/components/ui/button';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
};

type Props = {
  data: CreateSaleInput;
  cardBrands: CardBrandOption[];
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function SaleConfirmDialog({ data, cardBrands, isPending, onConfirm, onCancel }: Props) {
  // ESC closes (= edit) when not pending.
  useEffect(() => {
    if (isPending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPending, onCancel]);

  const brandName = (id: number | undefined): string | null =>
    id ? (cardBrands.find((b) => b.id === id)?.name ?? null) : null;

  const totalDecimal = safeDecimal(data.totalAmount);
  const totalDisplay = totalDecimal ? formatARS(totalDecimal) : data.totalAmount;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar venta"
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm"
      onClick={isPending ? undefined : onCancel}
    >
      <div
        className="animate-success-in mx-6 w-full max-w-md rounded-card border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-5 text-center">
          <h2 className="text-xl font-semibold tracking-tight">Confirmá la venta</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Revisá los datos antes de guardar.
          </p>
        </header>

        {/* Total */}
        <div className="mb-4 rounded-card border border-primary/30 bg-primary/5 px-4 py-3 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Total
          </div>
          <div className="mt-1 text-3xl font-semibold tabular-nums text-primary">
            {totalDisplay}
          </div>
        </div>

        {/* Payments breakdown */}
        <div className="mb-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Métodos
          </div>
          <ul className="divide-y divide-border rounded-card border border-border">
            {data.payments.map((p, i) => {
              const brand = brandName(p.cardBrandId);
              const cuotas = p.installments ? `${p.installments} cuotas` : null;
              const detail = [brand, cuotas].filter(Boolean).join(' · ');
              const amountD = safeDecimal(p.amount);
              return (
                <li key={i} className="flex items-baseline justify-between gap-4 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{METHOD_LABEL[p.method]}</div>
                    {detail && (
                      <div className="text-xs text-muted-foreground">{detail}</div>
                    )}
                  </div>
                  <div className="tabular-nums text-sm font-semibold">
                    {amountD ? formatARS(amountD) : p.amount}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {data.observations && data.observations.trim().length > 0 && (
          <div className="mb-4">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Observaciones
            </div>
            <p className="rounded-input border border-border bg-muted/30 px-3 py-2 text-xs">
              {data.observations}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onCancel}
            disabled={isPending}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Editar
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={onConfirm}
            disabled={isPending}
            autoFocus
          >
            {isPending ? (
              'Guardando…'
            ) : (
              <>
                <Check className="mr-1 h-4 w-4" />
                Confirmar venta
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
