'use client';

/**
 * Withdrawal form (cashier + admin in create mode; super_admin only in edit mode).
 *
 * Three fields: monto, persona (select), fecha (only in edit mode — D-016).
 * No confirm dialog — withdrawals are intentionally fast (<5s per the UX spec).
 */
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Decimal } from 'decimal.js';

import {
  createWithdrawal,
  updateWithdrawal,
  type WithdrawalActionError,
} from '@/app/actions/withdrawals';
import {
  updateWithdrawalSchema,
  type UpdateWithdrawalInput,
} from '@/lib/validators/withdrawal';
import { formatARS, safeDecimal } from '@/lib/money';
import type { WithdrawalPersonOption } from '@/lib/queries/withdrawals';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SuccessToast } from '@/components/ui/success-toast';

const ACTION_MESSAGE: Record<WithdrawalActionError, string> = {
  unauthorized: 'No estás autenticado.',
  forbidden: 'No tenés permisos.',
  validation_error: 'Datos inválidos. Revisá el formulario.',
  not_found: 'No encontrado.',
  fk_violation: 'La persona seleccionada ya no existe.',
  internal_error: 'Error interno. Intentá de nuevo.',
};

type Props =
  | {
      mode: 'create';
      persons: WithdrawalPersonOption[];
    }
  | {
      mode: 'edit';
      persons: WithdrawalPersonOption[];
      withdrawalId: string;
      defaultValues: UpdateWithdrawalInput;
    };

const EMPTY_FORM: UpdateWithdrawalInput = {
  amount: '',
  personId: 0,
  withdrawalDate: undefined,
};

export function WithdrawalForm(props: Props) {
  const { mode, persons } = props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<{
    amount: string;
    saleId: string;
  } | null>(null);
  const amountRef = useRef<HTMLInputElement | null>(null);

  const initial = mode === 'edit' ? props.defaultValues : EMPTY_FORM;

  const form = useForm<UpdateWithdrawalInput>({
    resolver: zodResolver(updateWithdrawalSchema),
    mode: 'onSubmit',
    defaultValues: initial,
  });
  const { register, handleSubmit, reset, formState, watch } = form;
  const watchedAmount = watch('amount');

  const onSubmit = handleSubmit(
    (data) => {
      setErrorMessage(null);
      startTransition(async () => {
        const result =
          mode === 'create'
            ? await createWithdrawal(data)
            : await updateWithdrawal(props.withdrawalId, data);
        if (result.ok) {
          if (mode === 'create') {
            setSuccessToast({ amount: data.amount, saleId: result.data.withdrawalId });
            reset(EMPTY_FORM);
            amountRef.current?.focus();
            router.refresh();
          } else {
            setSuccessToast({ amount: data.amount, saleId: result.data.withdrawalId });
            setTimeout(() => {
              router.push('/retiros/diaria');
              router.refresh();
            }, 1200);
          }
        } else {
          setErrorMessage(
            ACTION_MESSAGE[result.error] + (result.message ? ` — ${result.message}` : ''),
          );
        }
      });
    },
    () => setErrorMessage('Revisá los campos marcados.'),
  );

  const amountDecimal = safeDecimal(watchedAmount) ?? new Decimal(0);
  const canSubmit = amountDecimal.gt(0) && !isPending;

  return (
    <form onSubmit={onSubmit} className="space-y-6" aria-busy={isPending}>
      {/* Amount */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="amount">Monto</Label>
        <Input
          id="amount"
          inputMode="decimal"
          autoFocus
          placeholder="0.00"
          aria-invalid={Boolean(formState.errors.amount)}
          {...register('amount', {
            setValueAs: (v) => (typeof v === 'string' ? v.trim() : v),
          })}
          ref={(el) => {
            amountRef.current = el;
            register('amount').ref(el);
          }}
        />
        {amountDecimal.gt(0) && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatARS(amountDecimal)}
          </p>
        )}
        {formState.errors.amount && (
          <p className="text-xs text-destructive">{formState.errors.amount.message}</p>
        )}
      </div>

      {/* Person */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="personId">Persona que retira</Label>
        <Select
          id="personId"
          aria-invalid={Boolean(formState.errors.personId)}
          {...register('personId', { valueAsNumber: true })}
        >
          <option value={0}>Elegir…</option>
          {persons.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        {formState.errors.personId && (
          <p className="text-xs text-destructive">
            {formState.errors.personId.message ?? 'Seleccioná una persona.'}
          </p>
        )}
      </div>

      {/* Date — edit mode only (D-016) */}
      {mode === 'edit' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="withdrawalDate">Fecha del retiro</Label>
          <Input
            id="withdrawalDate"
            type="date"
            aria-invalid={Boolean(formState.errors.withdrawalDate)}
            {...register('withdrawalDate')}
          />
          <p className="text-xs text-muted-foreground">
            Solo se puede mover hasta 60 días hacia atrás. La hora original se preserva.
          </p>
          {formState.errors.withdrawalDate && (
            <p className="text-xs text-destructive">
              {formState.errors.withdrawalDate.message}
            </p>
          )}
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="rounded-card border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {errorMessage}
        </div>
      )}

      {successToast && (
        <SuccessToast
          amount={successToast.amount}
          saleId={successToast.saleId}
          onClose={() => setSuccessToast(null)}
        />
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={!canSubmit}>
          {isPending ? 'Guardando…' : mode === 'edit' ? 'Guardar cambios' : 'Registrar retiro'}
        </Button>
      </div>
    </form>
  );
}
