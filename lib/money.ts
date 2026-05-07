import { Decimal } from 'decimal.js';

/**
 * Money handling primitives. See 09-RULES.md / D-003.
 *
 * Wire format: string matching /^\d+(\.\d{1,2})?$/.
 * Code format: Decimal (decimal.js) — never JS Number.
 * DB format:   numeric(12,2).
 */

export const MONEY_REGEX = /^\d+(\.\d{1,2})?$/;

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

export function toDecimal(value: string): Decimal {
  if (!MONEY_REGEX.test(value)) {
    throw new Error(`invalid money string: ${value}`);
  }
  return new Decimal(value);
}

export function sumDecimals(values: readonly string[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(toDecimal(v)), new Decimal(0));
}

export function decimalsEqual(a: string, b: string): boolean {
  return toDecimal(a).equals(toDecimal(b));
}

export function formatMoney(value: string | Decimal): string {
  const d = typeof value === 'string' ? toDecimal(value) : value;
  return d.toFixed(2);
}
