import { describe, expect, it } from 'vitest';
import {
  createWithdrawalSchema,
  updateWithdrawalSchema,
} from './withdrawal';
import { todayInAppTZ } from '@/lib/dates';

describe('createWithdrawalSchema', () => {
  it('accepts a valid withdrawal', () => {
    const r = createWithdrawalSchema.safeParse({
      amount: '5000.00',
      personId: 1,
    });
    expect(r.success).toBe(true);
  });

  it('rejects amount = 0', () => {
    const r = createWithdrawalSchema.safeParse({ amount: '0', personId: 1 });
    expect(r.success).toBe(false);
  });

  it('rejects malformed money', () => {
    const r = createWithdrawalSchema.safeParse({ amount: '12.345', personId: 1 });
    expect(r.success).toBe(false);
  });

  it('rejects non-positive personId', () => {
    expect(
      createWithdrawalSchema.safeParse({ amount: '100.00', personId: 0 }).success,
    ).toBe(false);
    expect(
      createWithdrawalSchema.safeParse({ amount: '100.00', personId: -1 }).success,
    ).toBe(false);
  });
});

describe('updateWithdrawalSchema', () => {
  it('accepts a payload with no withdrawalDate', () => {
    const r = updateWithdrawalSchema.safeParse({ amount: '5000.00', personId: 1 });
    expect(r.success).toBe(true);
  });

  it('accepts a withdrawalDate inside the 60-day window', () => {
    const r = updateWithdrawalSchema.safeParse({
      amount: '5000.00',
      personId: 1,
      withdrawalDate: todayInAppTZ(),
    });
    expect(r.success).toBe(true);
  });

  it('rejects a withdrawalDate older than 60 days', () => {
    const today = todayInAppTZ();
    const [y, m, d] = today.split('-').map(Number) as [number, number, number];
    const past = new Date(Date.UTC(y, m - 1, d - 90, 12)).toISOString().slice(0, 10);
    const r = updateWithdrawalSchema.safeParse({
      amount: '5000.00',
      personId: 1,
      withdrawalDate: past,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message === 'fecha_fuera_de_rango')).toBe(true);
    }
  });

  it('rejects a withdrawalDate in the future', () => {
    const today = todayInAppTZ();
    const [y, m, d] = today.split('-').map(Number) as [number, number, number];
    const future = new Date(Date.UTC(y, m - 1, d + 1, 12)).toISOString().slice(0, 10);
    const r = updateWithdrawalSchema.safeParse({
      amount: '5000.00',
      personId: 1,
      withdrawalDate: future,
    });
    expect(r.success).toBe(false);
  });
});
