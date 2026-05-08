'use client';

import { useEffect } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { formatARS, safeDecimal } from '@/lib/money';
import type { WithdrawalPersonOption } from '@/lib/queries/withdrawals';
import type { UpdateWithdrawalInput } from '@/lib/validators/withdrawal';
import { Button } from '@/components/ui/button';

type Props = {
  mode: 'create' | 'edit';
  data: UpdateWithdrawalInput;
  persons: WithdrawalPersonOption[];
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function WithdrawalConfirmDialog({
  mode,
  data,
  persons,
  isPending,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (isPending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPending, onCancel]);

  const personName =
    persons.find((p) => p.id === data.personId)?.name ?? '(persona desconocida)';
  const amountDecimal = safeDecimal(data.amount);
  const amountDisplay = amountDecimal ? formatARS(amountDecimal) : data.amount;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar retiro"
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm"
      onClick={isPending ? undefined : onCancel}
    >
      <div
        className="animate-success-in mx-4 w-full max-w-md rounded-card border border-border bg-card p-5 shadow-2xl sm:mx-6 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-5 text-center">
          <h2 className="text-xl font-semibold tracking-tight">
            {mode === 'edit' ? 'Confirmá los cambios' : 'Confirmá el retiro'}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Revisá los datos antes de guardar.
          </p>
        </header>

        <div className="mb-4 rounded-card border border-primary/30 bg-primary/5 px-4 py-3 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Monto del retiro
          </div>
          <div className="mt-1 text-3xl font-semibold tabular-nums text-primary">
            {amountDisplay}
          </div>
        </div>

        <dl className="mb-4 divide-y divide-border rounded-card border border-border">
          <div className="flex items-baseline justify-between px-3 py-2.5">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Persona
            </dt>
            <dd className="text-sm font-medium">{personName}</dd>
          </div>
          {data.withdrawalDate && (
            <div className="flex items-baseline justify-between px-3 py-2.5">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Fecha
              </dt>
              <dd className="text-sm tabular-nums">{data.withdrawalDate}</dd>
            </div>
          )}
        </dl>

        <div className="flex gap-2">
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
                {mode === 'edit' ? 'Guardar cambios' : 'Confirmar retiro'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
