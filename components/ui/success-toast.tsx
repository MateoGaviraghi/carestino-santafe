'use client';

import { useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { formatARS } from '@/lib/money';

type Props = {
  amount: string;
  /** Reference id shown in the small caption (sale id, withdrawal id, etc.). */
  referenceId: string;
  /** Big title — default "Operación registrada"; override per use case. */
  title?: string;
  onClose: () => void;
  /** Auto-dismiss after this many ms; 0 disables. Default 1800. */
  autoCloseMs?: number;
};

/**
 * Big centered success modal — temporary, auto-dismisses, blocks the page
 * for the brief moment it's visible. Used after a transaction is saved so
 * the user gets unmissable confirmation.
 */
export function SuccessToast({
  amount,
  referenceId,
  title = 'Operación registrada',
  onClose,
  autoCloseMs = 1800,
}: Props) {
  useEffect(() => {
    if (autoCloseMs <= 0) return;
    const timer = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(timer);
  }, [autoCloseMs, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label={title}
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-success-in mx-4 w-full max-w-sm rounded-card bg-success px-8 py-8 text-center text-success-foreground shadow-2xl sm:mx-6 sm:px-12 sm:py-10"
        onClick={(e) => e.stopPropagation()}
      >
        <CheckCircle2 className="mx-auto h-20 w-20" strokeWidth={2} aria-hidden />
        <h2 className="mt-5 text-2xl font-bold tracking-tight">{title}</h2>
        <p className="mt-3 text-3xl font-semibold tabular-nums">{formatARS(amount)}</p>
        <p className="mt-2 text-[11px] uppercase tracking-wide opacity-75">
          #{referenceId.slice(0, 8)}
        </p>
      </div>
    </div>
  );
}
