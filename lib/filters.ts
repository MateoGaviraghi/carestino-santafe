/**
 * URL-driven sales filters (per 06-UI-UX.md).
 *
 * Filters live in the URL search params so refresh keeps them and a
 * share-link reproduces the view exactly. Multi-value params are
 * serialized as CSV (e.g. `?method=efectivo,credito`) — keeps URLs
 * shorter and avoids duplicate-key parsing edge cases.
 *
 * Filtering semantics: a sale matches when ANY of its payments matches
 * the criterion (EXISTS subquery in the query layer).
 *   - method=efectivo,credito  ⇒ sale has at least one payment in those methods
 *   - cardBrand=1,2            ⇒ sale has at least one payment with those brands
 *   - installments=3,6         ⇒ sale has at least one credito payment with those installments
 *   - q=texto                  ⇒ sale.observations ILIKE %texto%
 *
 * Any malformed or unknown value in the URL is dropped silently (the
 * parser never throws — bad input just becomes "no filter").
 */
import { ALLOWED_INSTALLMENTS, PAYMENT_METHODS, type PaymentMethod } from '@/db/schema';

export type Installments = (typeof ALLOWED_INSTALLMENTS)[number];

export type SalesFilters = {
  search?: string;
  methods?: PaymentMethod[];
  cardBrandIds?: number[];
  installments?: Installments[];
};

const METHOD_SET = new Set<PaymentMethod>(PAYMENT_METHODS);
const INSTALLMENT_SET = new Set<number>(ALLOWED_INSTALLMENTS);

type RawParams = Record<string, string | string[] | undefined>;

function readSingle(params: RawParams, key: string): string | undefined {
  const v = params[key];
  if (Array.isArray(v)) return v[0];
  return v;
}

function readCsv(params: RawParams, key: string): string[] {
  const raw = readSingle(params, key);
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function parseSalesFilters(params: RawParams): SalesFilters {
  const out: SalesFilters = {};

  const q = readSingle(params, 'q')?.trim();
  if (q) out.search = q;

  const methods = readCsv(params, 'method').filter((m): m is PaymentMethod =>
    METHOD_SET.has(m as PaymentMethod),
  );
  if (methods.length > 0) out.methods = Array.from(new Set(methods));

  const cardBrandIds = readCsv(params, 'cardBrand')
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (cardBrandIds.length > 0) out.cardBrandIds = Array.from(new Set(cardBrandIds));

  const installments = readCsv(params, 'installments')
    .map((s) => Number(s))
    .filter((n): n is Installments => INSTALLMENT_SET.has(n));
  if (installments.length > 0) out.installments = Array.from(new Set(installments));

  return out;
}

/** Build a URLSearchParams object from a filters object. Date param is added by caller. */
export function serializeSalesFilters(filters: SalesFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (filters.search) sp.set('q', filters.search);
  if (filters.methods?.length) sp.set('method', filters.methods.join(','));
  if (filters.cardBrandIds?.length) sp.set('cardBrand', filters.cardBrandIds.join(','));
  if (filters.installments?.length) sp.set('installments', filters.installments.join(','));
  return sp;
}

export function hasActiveFilters(filters: SalesFilters): boolean {
  return Boolean(
    filters.search ||
      filters.methods?.length ||
      filters.cardBrandIds?.length ||
      filters.installments?.length,
  );
}
