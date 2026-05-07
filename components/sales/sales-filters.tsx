'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';

import { ALLOWED_INSTALLMENTS, PAYMENT_METHODS, type PaymentMethod } from '@/db/schema';
import {
  hasActiveFilters,
  serializeSalesFilters,
  type Installments,
  type SalesFilters,
} from '@/lib/filters';
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
  filters: SalesFilters;
  cardBrands: CardBrandOption[];
};

export function SalesFiltersBar({ filters, cardBrands }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [searchDraft, setSearchDraft] = useState(filters.search ?? '');

  // Re-sync the local search draft when the URL changes (e.g. via Clear).
  useEffect(() => {
    setSearchDraft(filters.search ?? '');
  }, [filters.search]);

  // Debounced live search: while the user types, push the URL after 300ms of
  // inactivity so the page re-fetches without requiring Enter.
  useEffect(() => {
    const trimmed = searchDraft.trim();
    const next = trimmed.length > 0 ? trimmed : undefined;
    if (next === filters.search) return;
    const timer = setTimeout(() => {
      update({ ...filters, search: next });
    }, 300);
    return () => clearTimeout(timer);
    // We deliberately depend only on searchDraft — `filters` and `update` are
    // stable enough across the same URL state, and adding them would make the
    // effect re-fire on every navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  function update(next: SalesFilters) {
    const sp = serializeSalesFilters(next);
    const date = searchParams.get('date');
    if (date) sp.set('date', date);
    const qs = sp.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

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

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchDraft.trim();
    update({ ...filters, search: trimmed.length > 0 ? trimmed : undefined });
  };

  const onClear = () => {
    setSearchDraft('');
    update({});
  };

  const active = hasActiveFilters(filters);

  return (
    <div className="rounded-card border border-border bg-card p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        {/* Search */}
        <form onSubmit={onSearchSubmit} className="flex flex-1 flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Buscar en observaciones
          </span>
          <Input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Buscar…"
            type="search"
          />
        </form>

        {/* Methods */}
        <fieldset className="flex flex-col gap-1">
          <legend className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Método
          </legend>
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
        </fieldset>

        {/* Card brands */}
        <fieldset className="flex flex-col gap-1">
          <legend className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Marca
          </legend>
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
        </fieldset>

        {/* Installments */}
        <fieldset className="flex flex-col gap-1">
          <legend className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Cuotas
          </legend>
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
        </fieldset>
      </div>

      {active && (
        <div className="mt-3 flex justify-end">
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
