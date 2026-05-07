'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';

import { ALLOWED_INSTALLMENTS, PAYMENT_METHODS, type PaymentMethod } from '@/db/schema';
import {
  hasActiveExpenseFilters,
  serializeExpenseFilters,
  type ExpenseFilters,
  type Installments,
} from '@/lib/expense-filters';
import type { CardBrandOption } from '@/lib/queries/card-brands';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  debito: 'Débito',
  credito: 'Crédito',
};

type Props = {
  filters: ExpenseFilters;
  cardBrands: CardBrandOption[];
  providers: string[];
};

export function ExpensesFiltersBar({ filters, cardBrands, providers }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [searchDraft, setSearchDraft] = useState(filters.search ?? '');
  const [providerDraft, setProviderDraft] = useState(filters.provider ?? '');

  useEffect(() => {
    setSearchDraft(filters.search ?? '');
  }, [filters.search]);
  useEffect(() => {
    setProviderDraft(filters.provider ?? '');
  }, [filters.provider]);

  function update(next: ExpenseFilters) {
    const sp = serializeExpenseFilters(next);
    const qs = sp.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  // Debounced search.
  useEffect(() => {
    const next = searchDraft.trim() || undefined;
    if (next === filters.search) return;
    const timer = setTimeout(() => {
      update({ ...filters, search: next });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  // Debounced provider exact match.
  useEffect(() => {
    const next = providerDraft.trim() || undefined;
    if (next === filters.provider) return;
    const timer = setTimeout(() => {
      update({ ...filters, provider: next });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerDraft]);

  function toggleInArray<T>(value: T, list: T[] | undefined): T[] | undefined {
    const current = list ?? [];
    const next = current.includes(value)
      ? current.filter((x) => x !== value)
      : [...current, value];
    return next.length > 0 ? next : undefined;
  }

  const onToggleMethod = (m: PaymentMethod) =>
    update({ ...filters, methods: toggleInArray(m, filters.methods) });
  const onToggleBrand = (id: number) =>
    update({ ...filters, cardBrandIds: toggleInArray(id, filters.cardBrandIds) });
  const onToggleInstallments = (n: Installments) =>
    update({ ...filters, installments: toggleInArray(n, filters.installments) });
  const onFromChange = (v: string) =>
    update({ ...filters, from: v || undefined });
  const onToChange = (v: string) =>
    update({ ...filters, to: v || undefined });

  const onClear = () => {
    setSearchDraft('');
    setProviderDraft('');
    update({});
  };

  const active = hasActiveExpenseFilters(filters);
  void searchParams;

  return (
    <div className="rounded-card border border-border bg-card p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Buscar (proveedor / observaciones)
          </span>
          <Input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Buscar…"
            type="search"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Proveedor exacto
          </span>
          <Input
            list="provider-filter-options"
            value={providerDraft}
            onChange={(e) => setProviderDraft(e.target.value)}
            placeholder="Cualquier proveedor"
          />
          <datalist id="provider-filter-options">
            {providers.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Desde
          </span>
          <Input
            type="date"
            value={filters.from ?? ''}
            onChange={(e) => onFromChange(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Hasta
          </span>
          <Input
            type="date"
            value={filters.to ?? ''}
            onChange={(e) => onToChange(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Método
          </span>
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <ToggleChip
                key={m}
                active={filters.methods?.includes(m) ?? false}
                onClick={() => onToggleMethod(m)}
              >
                {METHOD_LABEL[m]}
              </ToggleChip>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Marca
          </span>
          <div className="flex flex-wrap gap-1.5">
            {cardBrands.map((b) => (
              <ToggleChip
                key={b.id}
                active={filters.cardBrandIds?.includes(b.id) ?? false}
                onClick={() => onToggleBrand(b.id)}
              >
                {b.name}
              </ToggleChip>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Cuotas
          </span>
          <div className="flex flex-wrap gap-1.5">
            {ALLOWED_INSTALLMENTS.map((n) => (
              <ToggleChip
                key={n}
                active={filters.installments?.includes(n) ?? false}
                onClick={() => onToggleInstallments(n)}
              >
                {n}c
              </ToggleChip>
            ))}
          </div>
        </div>
      </div>

      {active && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-input px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Limpiar filtros
          </button>
        </div>
      )}
    </div>
  );
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs transition',
        active
          ? 'border-primary/50 bg-primary/10 text-primary'
          : 'border-border bg-background text-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}
