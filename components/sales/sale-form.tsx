'use client';

/**
 * Sale form (cashier + admin).
 *
 * Layer 1 of the sum-invariant defense — see 04-DATA-MODEL.md / D-005.
 * The same zod schema runs again server-side (lib/validators/sale.ts) and
 * the DB trigger is the third backstop.
 *
 * UX rules from 06-UI-UX.md:
 *   - Total autofocused.
 *   - Defaults to a single payment row (efectivo).
 *   - Live "Restante: $X" indicator turns green at 0, red otherwise.
 *   - Save disabled while remaining ≠ 0.
 *   - On success: message, form resets, focus returns to total.
 */
import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Decimal } from 'decimal.js';
import { Trash2 } from 'lucide-react';

import { createSale, type ActionError } from '@/app/actions/sales';
import { createSaleSchema, type CreateSaleInput } from '@/lib/validators/sale';
import { safeDecimal } from '@/lib/money';
import { PAYMENT_METHODS, type PaymentMethod } from '@/db/schema';
import type { CardBrandOption } from '@/lib/queries/card-brands';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

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

const EMPTY_FORM: CreateSaleInput = {
  totalAmount: '',
  observations: '',
  payments: [EMPTY_PAYMENT],
};

type Props = { cardBrands: CardBrandOption[] };

export function SaleForm({ cardBrands }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverMessage, setServerMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const totalInputRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<CreateSaleInput>({
    resolver: zodResolver(createSaleSchema),
    mode: 'onSubmit',
    defaultValues: EMPTY_FORM,
  });
  const { register, control, handleSubmit, reset, formState, setValue } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'payments' });

  // Live values for the remaining indicator.
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

  const handleAddPayment = () => {
    append({ method: 'efectivo', amount: '' });
  };

  const onMethodChange = (index: number, value: PaymentMethod) => {
    setValue(`payments.${index}.method`, value, { shouldValidate: false });
    // Clear card_brand / installments when not applicable.
    if (value === 'efectivo' || value === 'transferencia') {
      setValue(`payments.${index}.cardBrandId`, undefined);
      setValue(`payments.${index}.installments`, undefined);
    } else if (value === 'debito') {
      setValue(`payments.${index}.installments`, undefined);
    }
  };

  const onSubmit = handleSubmit(
    (data) => {
      setServerMessage(null);
      startTransition(async () => {
        const result = await createSale(data);
        if (result.ok) {
          setServerMessage({
            type: 'success',
            text: `Venta registrada (#${result.data.saleId.slice(0, 8)}).`,
          });
          reset(EMPTY_FORM);
          totalInputRef.current?.focus();
          router.refresh();
        } else {
          setServerMessage({
            type: 'error',
            text: ACTION_MESSAGE[result.error] + (result.message ? ` — ${result.message}` : ''),
          });
        }
      });
    },
    () => {
      setServerMessage({
        type: 'error',
        text: 'Revisá los campos marcados.',
      });
    },
  );

  const fmt = (d: Decimal): string => d.toFixed(2);

  return (
    <form onSubmit={onSubmit} className="space-y-6" aria-busy={isPending}>
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
        {formState.errors.totalAmount && (
          <p className="text-xs text-destructive">{formState.errors.totalAmount.message}</p>
        )}
      </div>

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
        <span className="tabular-nums text-base font-semibold">${fmt(remaining)}</span>
      </div>

      {/* Observations */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="observations">Observaciones (opcional)</Label>
        <textarea
          id="observations"
          rows={2}
          className="w-full rounded-input border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          {...register('observations')}
        />
      </div>

      {/* Server message */}
      {serverMessage && (
        <div
          role="status"
          className={cn(
            'rounded-card border px-4 py-3 text-sm',
            serverMessage.type === 'success'
              ? 'border-success/40 bg-success/10 text-success'
              : 'border-destructive/40 bg-destructive/10 text-destructive',
          )}
        >
          {serverMessage.text}
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground tabular-nums">
          Total: ${fmt(totalDecimal)} · Pagos: ${fmt(paymentsSum)}
        </p>
        <Button type="submit" disabled={!canSubmit}>
          {isPending ? 'Guardando…' : 'Guardar venta'}
        </Button>
      </div>
    </form>
  );
}
