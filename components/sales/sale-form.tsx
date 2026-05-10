'use client';

/**
 * Sale form (cashier + admin).
 *
 * Layer 1 of the sum-invariant defense — see 04-DATA-MODEL.md / D-005.
 * The same zod schema runs again server-side (lib/validators/sale.ts) and
 * the DB trigger is the third backstop.
 *
 * Two modes (D-017):
 *   - create: submitted to createSale, resets on success, stays in /ventas/nueva.
 *   - edit:   submitted to updateSale, redirects to /ventas/diaria on success.
 *             Renders an extra date picker (D-016 — last 60 days, super_admin).
 *
 * The form always uses updateSaleSchema as the resolver because it is a
 * strict superset of createSaleSchema (saleDate is optional). Create mode
 * simply never populates saleDate.
 */
import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Decimal } from 'decimal.js';
import { Trash2 } from 'lucide-react';

import {
  createSale,
  updateSale,
  type ActionError,
} from '@/app/actions/sales';
import {
  updateSaleSchema,
  type CreateSaleInput,
  type UpdateSaleInput,
} from '@/lib/validators/sale';
import { formatARS, safeDecimal } from '@/lib/money';
import { PAYMENT_METHODS, type PaymentMethod } from '@/db/schema';
import type { CardBrandOption } from '@/lib/queries/card-brands';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SuccessToast } from '@/components/ui/success-toast';
import { SaleConfirmDialog } from '@/components/sales/sale-confirm-dialog';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
};

const INSTALLMENT_OPTIONS = [1, 3, 6] as const;

const ACTION_MESSAGE: Record<ActionError, string> = {
  unauthorized: 'No estás autenticado.',
  forbidden: 'No tenés permisos para registrar ventas.',
  validation_error: 'Datos inválidos. Revisá el formulario.',
  sum_mismatch: 'La suma de los pagos no coincide con el total.',
  not_found: 'No encontrado.',
  internal_error: 'Error interno. Intentá de nuevo.',
};

const EMPTY_PAYMENT: CreateSaleInput['payments'][number] = {
  method: 'efectivo',
  amount: '',
};

const EMPTY_FORM: UpdateSaleInput = {
  totalAmount: '',
  observations: '',
  payments: [EMPTY_PAYMENT],
  saleDate: undefined,
};

type Props =
  | {
      mode: 'create';
      cardBrands: CardBrandOption[];
      /**
       * Hidden backdate: when set, the form submits with this saleDate instead
       * of letting the server default to "now()". Driven by the planilla URL
       * (?date=YYYY-MM-DD) — never edited inside the form. Already validated
       * upstream by the page (admin only, within 60-day window).
       */
      prefillDate?: string;
      /** Long-form Spanish label of prefillDate (e.g. "viernes, 2 de mayo de 2026"). */
      prefillDateLabel?: string;
    }
  | {
      mode: 'edit';
      cardBrands: CardBrandOption[];
      saleId: string;
      defaultValues: UpdateSaleInput;
    };

export function SaleForm(props: Props) {
  const { mode, cardBrands } = props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<{
    amount: string;
    referenceId: string;
  } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<UpdateSaleInput | null>(null);
  const totalInputRef = useRef<HTMLInputElement | null>(null);

  const initialValues: UpdateSaleInput =
    mode === 'edit'
      ? props.defaultValues
      : { ...EMPTY_FORM, saleDate: props.prefillDate ?? undefined };

  const form = useForm<UpdateSaleInput>({
    resolver: zodResolver(updateSaleSchema),
    mode: 'onSubmit',
    defaultValues: initialValues,
  });
  const { register, control, handleSubmit, reset, formState, setValue } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'payments' });

  const totalAmount = useWatch({ control, name: 'totalAmount' });
  const payments = useWatch({ control, name: 'payments' });

  const { remaining, totalDecimal, paymentsSum } = useMemo(() => {
    const totalD = safeDecimal(totalAmount) ?? new Decimal(0);
    const sumD = (payments ?? []).reduce<Decimal>((acc, p) => {
      const d = safeDecimal(p?.amount);
      return d ? acc.plus(d) : acc;
    }, new Decimal(0));
    return {
      remaining: totalD.minus(sumD),
      totalDecimal: totalD,
      paymentsSum: sumD,
    };
  }, [totalAmount, payments]);

  const remainingIsZero = remaining.equals(0);
  const totalIsPositive = totalDecimal.gt(0);
  const canSubmit = totalIsPositive && remainingIsZero && !isPending;

  const handleAddPayment = () => append({ method: 'efectivo', amount: '' });

  const onMethodChange = (index: number, value: PaymentMethod) => {
    setValue(`payments.${index}.method`, value, { shouldValidate: false });
    if (value === 'efectivo' || value === 'transferencia') {
      setValue(`payments.${index}.cardBrandId`, undefined);
      setValue(`payments.${index}.installments`, undefined);
    } else if (value === 'debito') {
      setValue(`payments.${index}.installments`, undefined);
    }
  };

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
      if (mode === 'create') {
        const result = await createSale(data);
        if (result.ok) {
          setPendingConfirm(null);
          setSuccessToast({ amount: data.totalAmount, referenceId: result.data.saleId });
          // Preserve the prefilled date across submissions so the admin can
          // keep loading sales for the same past day without re-clicking.
          reset(initialValues);
          totalInputRef.current?.focus();
          router.refresh();
        } else {
          setPendingConfirm(null);
          setErrorMessage(
            ACTION_MESSAGE[result.error] + (result.message ? ` — ${result.message}` : ''),
          );
        }
      } else {
        const result = await updateSale(props.saleId, data);
        if (result.ok) {
          setPendingConfirm(null);
          setSuccessToast({ amount: data.totalAmount, referenceId: result.data.saleId });
          // Redirect back to the daily sheet after a brief moment so the user
          // sees the success modal land before navigating away.
          setTimeout(() => {
            router.push('/ventas/diaria');
            router.refresh();
          }, 1200);
        } else {
          setPendingConfirm(null);
          setErrorMessage(
            ACTION_MESSAGE[result.error] + (result.message ? ` — ${result.message}` : ''),
          );
        }
      }
    });
  };

  const fmt = (d: Decimal): string => formatARS(d);

  return (
    <form onSubmit={onSubmit} className="space-y-6" aria-busy={isPending}>
      {/* Backdate banner — only when create mode + URL drove a past date. */}
      {mode === 'create' && props.prefillDate && (
        <div
          role="status"
          className="rounded-card border border-primary/30 bg-primary/5 px-4 py-3 text-sm"
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Cargando para
          </div>
          <div className="mt-0.5 font-medium capitalize text-primary">
            {props.prefillDateLabel ?? props.prefillDate}
          </div>
        </div>
      )}

      {/* Total */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="totalAmount">Total</Label>
        <Input
          id="totalAmount"
          inputMode="decimal"
          autoFocus
          placeholder="0.00"
          aria-invalid={Boolean(formState.errors.totalAmount)}
          {...register('totalAmount', {
            setValueAs: (v) => (typeof v === 'string' ? v.trim() : v),
          })}
          ref={(el) => {
            totalInputRef.current = el;
            register('totalAmount').ref(el);
          }}
        />
        {totalDecimal.gt(0) && (
          <p className="text-xs text-muted-foreground tabular-nums">{fmt(totalDecimal)}</p>
        )}
        {formState.errors.totalAmount && (
          <p className="text-xs text-destructive">{formState.errors.totalAmount.message}</p>
        )}
      </div>

      {/* Sale date — edit mode only (D-016). In create mode, the date comes
          from the planilla URL (prefillDate) — banner above shows it. */}
      {mode === 'edit' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="saleDate">Fecha de la venta</Label>
          <Input
            id="saleDate"
            type="date"
            aria-invalid={Boolean(formState.errors.saleDate)}
            {...register('saleDate')}
          />
          <p className="text-xs text-muted-foreground">
            Solo se puede mover la fecha hasta 60 días hacia atrás. La hora original se preserva.
          </p>
          {formState.errors.saleDate && (
            <p className="text-xs text-destructive">{formState.errors.saleDate.message}</p>
          )}
        </div>
      )}
      {/* Hidden saleDate carrier (only when prefilled from URL) so RHF tracks the value. */}
      {mode === 'create' && props.prefillDate && (
        <input type="hidden" {...register('saleDate')} />
      )}

      {/* Payments */}
      <fieldset className="space-y-3">
        <div className="flex items-end justify-between">
          <Label>Métodos de pago</Label>
          <Button type="button" variant="outline" size="sm" onClick={handleAddPayment}>
            + Agregar método
          </Button>
        </div>

        {fields.map((field, index) => {
          const currentMethod = (payments?.[index]?.method ?? 'efectivo') as PaymentMethod;
          const showCard = currentMethod === 'debito' || currentMethod === 'credito';
          const showInstallments = currentMethod === 'credito';
          const paymentErrors = formState.errors.payments?.[index];

          return (
            <div
              key={field.id}
              className="rounded-card border border-border bg-card p-4"
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                <div className="md:col-span-3">
                  <Label htmlFor={`payments.${index}.method`}>Método</Label>
                  <Controller
                    control={control}
                    name={`payments.${index}.method`}
                    render={({ field: f }) => (
                      <Select
                        id={`payments.${index}.method`}
                        value={f.value}
                        onChange={(e) => {
                          f.onChange(e);
                          onMethodChange(index, e.target.value as PaymentMethod);
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

                <div className="md:col-span-3">
                  <Label htmlFor={`payments.${index}.amount`}>Monto</Label>
                  <Input
                    id={`payments.${index}.amount`}
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-invalid={Boolean(paymentErrors?.amount)}
                    {...register(`payments.${index}.amount`, {
                      setValueAs: (v) => (typeof v === 'string' ? v.trim() : v),
                    })}
                  />
                  {(() => {
                    const d = safeDecimal(payments?.[index]?.amount);
                    return d && d.gt(0) ? (
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">{fmt(d)}</p>
                    ) : null;
                  })()}
                  {paymentErrors?.amount && (
                    <p className="mt-1 text-xs text-destructive">{paymentErrors.amount.message}</p>
                  )}
                </div>

                {showCard && (
                  <div className="md:col-span-3">
                    <Label htmlFor={`payments.${index}.cardBrandId`}>Marca</Label>
                    <Controller
                      control={control}
                      name={`payments.${index}.cardBrandId`}
                      render={({ field: f }) => (
                        <Select
                          id={`payments.${index}.cardBrandId`}
                          value={f.value ?? ''}
                          onChange={(e) =>
                            f.onChange(e.target.value === '' ? undefined : Number(e.target.value))
                          }
                          aria-invalid={Boolean(paymentErrors?.cardBrandId)}
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
                    {paymentErrors?.cardBrandId && (
                      <p className="mt-1 text-xs text-destructive">
                        {paymentErrors.cardBrandId.message}
                      </p>
                    )}
                  </div>
                )}

                {showInstallments && (
                  <div className="md:col-span-2">
                    <Label htmlFor={`payments.${index}.installments`}>Cuotas</Label>
                    <Controller
                      control={control}
                      name={`payments.${index}.installments`}
                      render={({ field: f }) => (
                        <Select
                          id={`payments.${index}.installments`}
                          value={f.value ?? ''}
                          onChange={(e) =>
                            f.onChange(
                              e.target.value === ''
                                ? undefined
                                : (Number(e.target.value) as 1 | 3 | 6),
                            )
                          }
                          aria-invalid={Boolean(paymentErrors?.installments)}
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
                    {paymentErrors?.installments && (
                      <p className="mt-1 text-xs text-destructive">
                        {paymentErrors.installments.message}
                      </p>
                    )}
                  </div>
                )}

                {fields.length > 1 && (
                  <div className="flex items-end justify-end md:col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Eliminar método"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </fieldset>

      {/* Remaining indicator */}
      <div
        className={cn(
          'flex items-center justify-between rounded-card border px-4 py-3 text-sm',
          totalIsPositive && remainingIsZero
            ? 'border-success/40 bg-success/10 text-success'
            : 'border-destructive/40 bg-destructive/10 text-destructive',
        )}
      >
        <span className="font-medium uppercase tracking-wide">Restante</span>
        <span className="tabular-nums text-base font-semibold">{fmt(remaining)}</span>
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

      {/* Error inline; success uses the floating toast outside this fieldset. */}
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
          title="Venta registrada"
          amount={successToast.amount}
          referenceId={successToast.referenceId}
          onClose={() => setSuccessToast(null)}
        />
      )}

      {pendingConfirm && (
        <SaleConfirmDialog
          mode={mode}
          data={pendingConfirm}
          cardBrands={cardBrands}
          isPending={isPending}
          onConfirm={handleConfirm}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      {/* Submit */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground tabular-nums">
          Total: {fmt(totalDecimal)} · Pagos: {fmt(paymentsSum)}
        </p>
        <Button type="submit" disabled={!canSubmit}>
          Continuar →
        </Button>
      </div>
    </form>
  );
}
