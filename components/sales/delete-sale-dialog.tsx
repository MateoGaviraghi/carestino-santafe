'use client';

/**
 * Typed-confirmation modal for hard-deleting a sale (D-018).
 *
 * The user must type "ELIMINAR" exactly before the destructive action enables.
 * Esc / click-outside / Cancelar all dismiss without deleting.
 */
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, X } from 'lucide-react';

import { deleteSale, type ActionError } from '@/app/actions/sales';
import { formatARS } from '@/lib/money';
import { formatTimeInAppTZ } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const CONFIRM_WORD = 'ELIMINAR';

const ACTION_MESSAGE: Record<ActionError, string> = {
  unauthorized: 'No estás autenticado.',
  forbidden: 'No tenés permisos para eliminar.',
  validation_error: 'Datos inválidos.',
  sum_mismatch: 'Sum mismatch.',
  not_found: 'La venta no existe (¿alguien más la borró?).',
  internal_error: 'Error interno. Intentá de nuevo.',
};

type Props = {
  saleId: string;
  totalAmount: string;
  saleDate: Date;
  onClose: () => void;
};

export function DeleteSaleDialog({ saleId, totalAmount, saleDate, onClose }: Props) {
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
      const result = await deleteSale(saleId);
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
      aria-label="Eliminar venta"
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm"
      onClick={isPending ? undefined : onClose}
    >
      <div
        className="animate-success-in mx-6 w-full max-w-md rounded-card border border-destructive/30 bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-destructive">
              Eliminar venta
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Esta acción no se puede deshacer.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            aria-label="Cerrar"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 rounded-input border border-border bg-muted/30 p-3 text-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">Hora</span>
            <span className="tabular-nums">{formatTimeInAppTZ(saleDate)}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold tabular-nums">{formatARS(totalAmount)}</span>
          </div>
        </div>

        <div className="mb-4">
          <Label htmlFor="delete-confirm">
            Para confirmar, escribí <span className="font-mono text-destructive">{CONFIRM_WORD}</span>
          </Label>
          <Input
            id="delete-confirm"
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={isPending}
            autoComplete="off"
            aria-invalid={typed.length > 0 && typed !== CONFIRM_WORD}
          />
        </div>

        {error && (
          <div className="mb-4 rounded-input border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="flex gap-2">
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
            <Trash2 className="mr-1 h-4 w-4" />
            {isPending ? 'Eliminando…' : 'Eliminar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
