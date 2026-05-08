'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, X } from 'lucide-react';

import {
  deleteExpense,
  type ExpenseActionError,
} from '@/app/actions/expenses';
import { formatARS } from '@/lib/money';
import { formatTimeInAppTZ } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const CONFIRM_WORD = 'ELIMINAR';

const ACTION_MESSAGE: Record<ExpenseActionError, string> = {
  unauthorized: 'No estás autenticado.',
  forbidden: 'No tenés permisos para eliminar.',
  validation_error: 'Datos inválidos.',
  not_found: 'El gasto no existe (¿alguien más lo borró?).',
  fk_violation: 'Conflicto de integridad.',
  internal_error: 'Error interno. Intentá de nuevo.',
};

type Props = {
  expenseId: string;
  amount: string;
  expenseDate: Date;
  provider: string;
  onClose: () => void;
};

export function DeleteExpenseDialog({
  expenseId,
  amount,
  expenseDate,
  provider,
  onClose,
}: Props) {
  const router = useRouter();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (isPending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPending, onClose]);

  const canDelete = typed === CONFIRM_WORD && !isPending;

  const handleDelete = () => {
    if (!canDelete) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteExpense(expenseId);
      if (result.ok) {
        router.refresh();
        onClose();
      } else {
        setError(ACTION_MESSAGE[result.error] + (result.message ? ` — ${result.message}` : ''));
      }
    });
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Eliminar gasto"
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 px-4 backdrop-blur-sm"
      onClick={isPending ? undefined : onClose}
    >
      <div
        className="animate-success-in relative w-full max-w-md overflow-hidden rounded-card border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          aria-label="Cerrar"
          className="absolute right-3 top-3 rounded-input p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center gap-3 border-b border-border bg-destructive/5 px-6 pb-5 pt-7 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <AlertTriangle className="h-6 w-6" strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              ¿Eliminar este gasto?
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Esta acción no se puede deshacer.
            </p>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <dl className="rounded-input border border-border bg-muted/30 px-4 py-3 text-sm">
            <div className="flex items-baseline justify-between">
              <dt className="text-muted-foreground">Hora</dt>
              <dd className="tabular-nums">{formatTimeInAppTZ(expenseDate)}</dd>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between">
              <dt className="text-muted-foreground">Proveedor</dt>
              <dd>{provider}</dd>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between">
              <dt className="text-muted-foreground">Monto</dt>
              <dd className="font-semibold tabular-nums">{formatARS(amount)}</dd>
            </div>
          </dl>

          <div>
            <p className="mb-2 text-sm">
              Para confirmar, escribí{' '}
              <span className="rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-destructive">
                {CONFIRM_WORD}
              </span>{' '}
              abajo:
            </p>
            <Input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={isPending}
              autoComplete="off"
              placeholder={CONFIRM_WORD}
              aria-invalid={typed.length > 0 && typed !== CONFIRM_WORD}
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-input border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-border bg-muted/20 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="flex-1"
            onClick={handleDelete}
            disabled={!canDelete}
          >
            {isPending ? 'Eliminando…' : 'Eliminar gasto'}
          </Button>
        </div>
      </div>
    </div>
  );
}
