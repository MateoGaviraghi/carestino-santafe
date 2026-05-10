'use client';

/**
 * Expense form (super_admin only). Mode discriminator (create | edit) like
 * SaleForm. Single payment method (no split). Provider is free-text.
 */
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Decimal } from 'decimal.js';

import {
  createExpense,
  updateExpense,
  type ExpenseActionError,
} from '@/app/actions/expenses';
import {
  updateExpenseSchema,
  type UpdateExpenseInput,
} from '@/lib/validators/expense';
import { formatARS, safeDecimal } from '@/lib/money';
import { PAYMENT_METHODS, type PaymentMethod } from '@/db/schema';
import type { CardBrandOption } from '@/lib/queries/card-brands';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SuccessToast } from '@/components/ui/success-toast';
import { ExpenseConfirmDialog } from '@/components/expenses/expense-confirm-dialog';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
};

const INSTALLMENT_OPTIONS = [1, 3, 6] as const;

const ACTION_MESSAGE: Record<ExpenseActionError, string> = {
  unauthorized: 'No estás autenticado.',
  forbidden: 'No tenés permisos.',
  validation_error: 'Datos inválidos. Revisá el formulario.',
  not_found: 'No encontrado.',
  fk_violation: 'La marca seleccionada ya no existe.',
  internal_error: 'Error interno. Intentá de nuevo.',
};

type Props =
  | {
      mode: 'create';
      cardBrands: CardBrandOption[];
      providers: string[];
      /** Today in APP_TZ (YYYY-MM-DD). Used as max attribute on date input. */
      todayInAppTZ?: string;
    }
  | {
      mode: 'edit';
      cardBrands: CardBrandOption[];
      providers: string[];
      expenseId: string;
      defaultValues: UpdateExpenseInput;
    };

const EMPTY_FORM: UpdateExpenseInput = {
  provider: '',
  amount: '',
  method: 'efectivo',
  observations: '',
  expenseDate: undefined,
};

export function ExpenseForm(props: Props) {
  const { mode, cardBrands, providers } = props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<{
    amount: string;
    referenceId: string;
  } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<UpdateExpenseInput | null>(null);
  const providerRef = useRef<HTMLInputElement | null>(null);

  const initial = mode === 'edit' ? props.defaultValues : EMPTY_FORM;

  const form = useForm<UpdateExpenseInput>({
    resolver: zodResolver(updateExpenseSchema),
    mode: 'onSubmit',
    defaultValues: initial,
  });
  const { register, control, handleSubmit, reset, formState, watch, setValue } = form;
  const watchedAmount = watch('amount');
  const watchedMethod = watch('method');
  const showCard = watchedMethod === 'debito' || watchedMethod === 'credito';
  const showInstallments = watchedMethod === 'credito';

  const onSubmit = handleSubmit(
    (data) => {
      setErrorMessage(null);
      setPendingConfirm(data);
    },
    () => setErrorMessage('Revisá los campos marcados.'),
  );

  const handleConfirm = () => {
    if (!pendingConfirm) return;
    const data = pendingConfirm;
    startTransition(async () => {
      const result =
        mode === 'create'
          ? await createExpense(data)
          : await updateExpense(props.expenseId, data);
      if (result.ok) {
        setPendingConfirm(null);
        setSuccessToast({ amount: data.amount, referenceId: result.data.expenseId });
        if (mode === 'create') {
          reset(EMPTY_FORM);
          providerRef.current?.focus();
          router.refresh();
        } else {
          setTimeout(() => {
            router.push('/gastos/lista');
            router.refresh();
          }, 1200);
        }
      } else {
        setPendingConfirm(null);
        setErrorMessage(
          ACTION_MESSAGE[result.error] + (result.message ? ` — ${result.message}` : ''),
        );
      }
    });
  };

  // Method change → clear card/installments when not applicable.
  const onMethodChange = (value: PaymentMethod) => {
    setValue('method', value);
    if (value === 'efectivo' || value === 'transferencia') {
      setValue('cardBrandId', undefined);
      setValue('installments', undefined);
    } else if (value === 'debito') {
      setValue('installments', undefined);
    }
  };

  const amountDecimal = safeDecimal(watchedAmount) ?? new Decimal(0);
  const canSubmit = amountDecimal.gt(0) && !isPending;

  return (
    <form onSubmit={onSubmit} className="space-y-6" aria-busy={isPending}>
      {/* Provider */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="provider">Proveedor</Label>
        <Input
          id="provider"
          list="provider-suggestions"
          autoFocus
          placeholder="Nombre del proveedor"
          aria-invalid={Boolean(formState.errors.provider)}
          {...register('provider')}
          ref={(el) => {
            providerRef.current = el;
            register('provider').ref(el);
          }}
        />
        <datalist id="provider-suggestions">
          {providers.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        {formState.errors.provider && (
          <p className="text-xs text-destructive">{formState.errors.provider.message}</p>
        )}
      </div>

      {/* Amount */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="amount">Monto</Label>
        <Input
          id="amount"
          inputMode="decimal"
          placeholder="0.00"
          aria-invalid={Boolean(formState.errors.amount)}
          {...register('amount', {
            setValueAs: (v) => (typeof v === 'string' ? v.trim() : v),
          })}
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

      {/* Method + Card + Installments */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="method">Método</Label>
          <Controller
            control={control}
            name="method"
            render={({ field }) => (
              <Select
                id="method"
                value={field.value}
                onChange={(e) => {
                  field.onChange(e);
                  onMethodChange(e.target.value as PaymentMethod);
                }}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABEL[m]}
                  </option>
                ))}
              </Select>
            )}
          />
        </div>

        {showCard && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="cardBrandId">Marca</Label>
            <Controller
              control={control}
              name="cardBrandId"
              render={({ field }) => (
                <Select
                  id="cardBrandId"
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value === '' ? undefined : Number(e.target.value),
                    )
                  }
                  aria-invalid={Boolean(formState.errors.cardBrandId)}
                >
                  <option value="">Elegir…</option>
                  {cardBrands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              )}
            />
            {formState.errors.cardBrandId && (
              <p className="text-xs text-destructive">
                {formState.errors.cardBrandId.message}
              </p>
            )}
          </div>
        )}

        {showInstallments && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="installments">Cuotas</Label>
            <Controller
              control={control}
              name="installments"
              render={({ field }) => (
                <Select
                  id="installments"
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value === ''
                        ? undefined
                        : (Number(e.target.value) as 1 | 3 | 6),
                    )
                  }
                  aria-invalid={Boolean(formState.errors.installments)}
                >
                  <option value="">Elegir…</option>
                  {INSTALLMENT_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              )}
            />
            {formState.errors.installments && (
              <p className="text-xs text-destructive">
                {formState.errors.installments.message}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Date — always available (super_admin-only flow). Lets the admin
          backdate a gasto pagado un día anterior. */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="expenseDate">Fecha del gasto</Label>
        <Input
          id="expenseDate"
          type="date"
          max={mode === 'create' ? props.todayInAppTZ : undefined}
          aria-invalid={Boolean(formState.errors.expenseDate)}
          {...register('expenseDate', {
            setValueAs: (v) =>
              typeof v === 'string' && v.length > 0 ? v : undefined,
          })}
        />
        <p className="text-xs text-muted-foreground">
          {mode === 'create'
            ? 'Dejá vacío para usar la fecha de hoy, o elegí una fecha hasta 60 días atrás.'
            : 'Solo se puede mover hasta 60 días hacia atrás. La hora original se preserva.'}
        </p>
        {formState.errors.expenseDate && (
          <p className="text-xs text-destructive">
            {formState.errors.expenseDate.message}
          </p>
        )}
      </div>

      {/* Observations */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="observations">Observaciones (opcional)</Label>
        <textarea
          id="observations"
          rows={2}
          className="w-full rounded-input border border-input bg-background px-3 py-2 text-base sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          {...register('observations')}
        />
      </div>

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
          title="Gasto registrado"
          amount={successToast.amount}
          referenceId={successToast.referenceId}
          onClose={() => setSuccessToast(null)}
        />
      )}

      {pendingConfirm && (
        <ExpenseConfirmDialog
          mode={mode}
          data={pendingConfirm}
          cardBrands={cardBrands}
          isPending={isPending}
          onConfirm={handleConfirm}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={!canSubmit}>
          Continuar →
        </Button>
      </div>
    </form>
  );
}
