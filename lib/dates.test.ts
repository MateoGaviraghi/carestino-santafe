import { describe, expect, it } from 'vitest';
import {
  APP_TZ,
  dayRangeInAppTZ,
  formatTimeInAppTZ,
  isValidDateString,
  todayInAppTZ,
} from './dates';

describe('isValidDateString', () => {
  it('accepts well-formed YYYY-MM-DD', () => {
    expect(isValidDateString('2026-05-07')).toBe(true);
    expect(isValidDateString('2026-12-31')).toBe(true);
  });

  it('rejects malformed strings', () => {
    expect(isValidDateString('2026-5-7')).toBe(false);
    expect(isValidDateString('05/07/2026')).toBe(false);
    expect(isValidDateString('not-a-date')).toBe(false);
  });

  it('rejects calendar-invalid dates like 2026-02-30', () => {
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('2026-13-01')).toBe(false);
  });
});

describe('dayRangeInAppTZ', () => {
  it('returns Cordoba midnight as the start (UTC -3)', () => {
    // 2026-05-07 00:00 Cordoba = 2026-05-07 03:00 UTC.
    const { start, end } = dayRangeInAppTZ('2026-05-07');
    expect(start.toISOString()).toBe('2026-05-07T03:00:00.000Z');
    expect(end.toISOString()).toBe('2026-05-08T03:00:00.000Z');
  });

  it('rolls over month boundaries correctly', () => {
    const { start, end } = dayRangeInAppTZ('2026-05-31');
    expect(start.toISOString()).toBe('2026-05-31T03:00:00.000Z');
    expect(end.toISOString()).toBe('2026-06-01T03:00:00.000Z');
  });

  it('rolls over year boundaries correctly', () => {
    const { start, end } = dayRangeInAppTZ('2026-12-31');
    expect(start.toISOString()).toBe('2026-12-31T03:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-01T03:00:00.000Z');
  });

  it('throws on invalid date string', () => {
    expect(() => dayRangeInAppTZ('not-a-date')).toThrow();
  });
});

describe('todayInAppTZ', () => {
  it('returns the wall-clock date in Cordoba, not UTC', () => {
    // 2026-05-08 02:00 UTC is still 2026-05-07 23:00 in Cordoba (-3).
    const utcInstant = new Date('2026-05-08T02:00:00.000Z');
    expect(todayInAppTZ(utcInstant)).toBe('2026-05-07');
  });

  it('correctly rolls to the next day after Cordoba midnight', () => {
    // 2026-05-08 03:30 UTC is 2026-05-08 00:30 in Cordoba.
    const utcInstant = new Date('2026-05-08T03:30:00.000Z');
    expect(todayInAppTZ(utcInstant)).toBe('2026-05-08');
  });
});

describe('formatTimeInAppTZ', () => {
  it('formats HH:mm in Cordoba TZ', () => {
    const utc = new Date('2026-05-07T17:23:00.000Z');
    // 17:23 UTC -> 14:23 Cordoba.
    expect(formatTimeInAppTZ(utc)).toBe('14:23');
  });
});

describe('APP_TZ constant', () => {
  it('is America/Argentina/Cordoba', () => {
    expect(APP_TZ).toBe('America/Argentina/Cordoba');
  });
});
