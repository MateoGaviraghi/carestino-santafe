import { describe, expect, it } from 'vitest';
import { cardBrandNameSchema } from './card-brand';

describe('cardBrandNameSchema', () => {
  it.each(['Visa', 'Mastercard', 'Amex', 'Naranja', 'Cabal', 'Tuya', 'Naranja X'])(
    'accepts the well-known brand %s',
    (name) => {
      expect(cardBrandNameSchema.safeParse(name).success).toBe(true);
    },
  );

  it('trims surrounding whitespace before validating', () => {
    const r = cardBrandNameSchema.safeParse('  Visa  ');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('Visa');
  });

  it('rejects empty / whitespace-only', () => {
    expect(cardBrandNameSchema.safeParse('').success).toBe(false);
    expect(cardBrandNameSchema.safeParse('    ').success).toBe(false);
  });

  it('rejects names longer than 50 chars', () => {
    expect(cardBrandNameSchema.safeParse('x'.repeat(51)).success).toBe(false);
  });

  it('rejects names with disallowed characters', () => {
    for (const bad of ['<script>', "'; DROP TABLE", 'Visa$', 'Visa@', 'Visa!', 'Visa,Mastercard']) {
      expect(cardBrandNameSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('accepts Spanish accented characters', () => {
    expect(cardBrandNameSchema.safeParse('Crédito Ñandú').success).toBe(true);
  });
});
