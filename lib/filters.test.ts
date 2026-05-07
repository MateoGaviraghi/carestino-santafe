import { describe, expect, it } from 'vitest';
import {
  hasActiveFilters,
  parseSalesFilters,
  serializeSalesFilters,
} from './filters';

describe('parseSalesFilters', () => {
  it('returns empty filters for empty params', () => {
    expect(parseSalesFilters({})).toEqual({});
  });

  it('parses a single method', () => {
    expect(parseSalesFilters({ method: 'efectivo' })).toEqual({
      methods: ['efectivo'],
    });
  });

  it('parses multiple methods from CSV', () => {
    expect(parseSalesFilters({ method: 'efectivo,credito' })).toEqual({
      methods: ['efectivo', 'credito'],
    });
  });

  it('drops unknown methods silently', () => {
    expect(parseSalesFilters({ method: 'efectivo,hack,credito' })).toEqual({
      methods: ['efectivo', 'credito'],
    });
  });

  it('deduplicates repeated methods', () => {
    expect(parseSalesFilters({ method: 'efectivo,efectivo,credito' })).toEqual({
      methods: ['efectivo', 'credito'],
    });
  });

  it('parses card brand ids as positive integers', () => {
    expect(parseSalesFilters({ cardBrand: '1,2,3' })).toEqual({
      cardBrandIds: [1, 2, 3],
    });
  });

  it('drops non-numeric / negative / zero card brand ids', () => {
    expect(parseSalesFilters({ cardBrand: '1,abc,-2,0,3' })).toEqual({
      cardBrandIds: [1, 3],
    });
  });

  it('parses installments only when in {1,3,6}', () => {
    expect(parseSalesFilters({ installments: '1,3,12,6' })).toEqual({
      installments: [1, 3, 6],
    });
  });

  it('trims and stores search query', () => {
    expect(parseSalesFilters({ q: '  navidad  ' })).toEqual({ search: 'navidad' });
  });

  it('returns no search when q is empty string', () => {
    expect(parseSalesFilters({ q: '' })).toEqual({});
  });

  it('combines all four filter categories', () => {
    const f = parseSalesFilters({
      q: 'tarjeta',
      method: 'credito,debito',
      cardBrand: '1',
      installments: '3,6',
    });
    expect(f).toEqual({
      search: 'tarjeta',
      methods: ['credito', 'debito'],
      cardBrandIds: [1],
      installments: [3, 6],
    });
  });

  it('handles array-valued params (Next.js may pass string[])', () => {
    expect(parseSalesFilters({ method: ['efectivo', 'credito'] })).toEqual({
      methods: ['efectivo'],
    });
  });
});

describe('serializeSalesFilters', () => {
  it('returns empty params when no filters', () => {
    expect(serializeSalesFilters({}).toString()).toBe('');
  });

  it('round-trips through parse+serialize', () => {
    const original = {
      search: 'tarjeta',
      methods: ['credito', 'debito'] as ('credito' | 'debito')[],
      cardBrandIds: [1, 2],
      installments: [3] as (1 | 3 | 6)[],
    };
    const sp = serializeSalesFilters(original);
    const parsed = parseSalesFilters(Object.fromEntries(sp));
    expect(parsed).toEqual(original);
  });
});

describe('hasActiveFilters', () => {
  it('false on empty', () => {
    expect(hasActiveFilters({})).toBe(false);
  });
  it('true when any filter is set', () => {
    expect(hasActiveFilters({ search: 'x' })).toBe(true);
    expect(hasActiveFilters({ methods: ['efectivo'] })).toBe(true);
    expect(hasActiveFilters({ cardBrandIds: [1] })).toBe(true);
    expect(hasActiveFilters({ installments: [3] })).toBe(true);
  });
});
