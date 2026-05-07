/**
 * URL-driven expense filters. Same shape philosophy as lib/filters.ts but
 * a different field set (expenses have provider + date range; sales don't).
 *
 *   q=texto                ⇒ ILIKE on provider OR observations
 *   provider=Acme          ⇒ exact match on provider
 *   method=efectivo,credito
 *   cardBrand=1,2
 *   installments=3,6
 *   from=YYYY-MM-DD
 *   to=YYYY-MM-DD
 */
import {
  ALLOWED_INSTALLMENTS,
  PAYMENT_METHODS,
  type PaymentMethod,
} from '@/db/schema';
import { isValidDateString } from '@/lib/dates';

export type Installments = (typeof ALLOWED_INSTALLMENTS)[number];

export type ExpenseFilters = {
  search?: string;
  provider?: string;
  methods?: PaymentMethod[];
  cardBrandIds?: number[];
  installments?: Installments[];
  from?: string; // YYYY-MM-DD inclusive
  to?: string; // YYYY-MM-DD inclusive
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

export function parseExpenseFilters(params: RawParams): ExpenseFilters {
  const out: ExpenseFilters = {};

  const q = readSingle(params, 'q')?.trim();
  if (q) out.search = q;

  const provider = readSingle(params, 'provider')?.trim();
  if (provider) out.provider = provider;

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

  const from = readSingle(params, 'from');
  if (from && isValidDateString(from)) out.from = from;

  const to = readSingle(params, 'to');
  if (to && isValidDateString(to)) out.to = to;

  return out;
}

export function serializeExpenseFilters(filters: ExpenseFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (filters.search) sp.set('q', filters.search);
  if (filters.provider) sp.set('provider', filters.provider);
  if (filters.methods?.length) sp.set('method', filters.methods.join(','));
  if (filters.cardBrandIds?.length) sp.set('cardBrand', filters.cardBrandIds.join(','));
  if (filters.installments?.length) sp.set('installments', filters.installments.join(','));
  if (filters.from) sp.set('from', filters.from);
  if (filters.to) sp.set('to', filters.to);
  return sp;
}

export function hasActiveExpenseFilters(filters: ExpenseFilters): boolean {
  return Boolean(
    filters.search ||
      filters.provider ||
      filters.methods?.length ||
      filters.cardBrandIds?.length ||
      filters.installments?.length ||
      filters.from ||
      filters.to,
  );
}
