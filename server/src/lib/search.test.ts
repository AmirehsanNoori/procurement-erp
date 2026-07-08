import { describe, it, expect } from 'vitest';
import { searchTerms, toLatinDigits } from './search';

describe('toLatinDigits', () => {
  it('folds Persian and Arabic-Indic digits to Latin, leaving other chars', () => {
    expect(toLatinDigits('۶۴۹۵')).toBe('6495');
    expect(toLatinDigits('٦٤٩٥')).toBe('6495');
    expect(toLatinDigits('PQ-۶۴۹۵')).toBe('PQ-6495');
    expect(toLatinDigits('abc')).toBe('abc');
  });
});

describe('searchTerms', () => {
  it('returns [] for empty/whitespace input', () => {
    expect(searchTerms('')).toEqual([]);
    expect(searchTerms('   ')).toEqual([]);
    expect(searchTerms(null)).toEqual([]);
    expect(searchTerms(undefined)).toEqual([]);
  });

  it('expands a Latin term into Persian/Arabic digit variants', () => {
    const terms = searchTerms('6495');
    expect(terms).toContain('6495');
    expect(terms).toContain('۶۴۹۵');
    expect(terms).toContain('٦٤٩٥');
  });

  it('preserves non-digit characters (prefix/dash) across variants', () => {
    const terms = searchTerms('PQ-6495');
    expect(terms).toContain('PQ-6495');
    expect(terms).toContain('PQ-۶۴۹۵');
  });

  it('a Persian-typed term still yields the Latin variant', () => {
    expect(searchTerms('۶۴۹۵')).toContain('6495');
  });

  it('dedupes when there are no digits to vary', () => {
    expect(searchTerms('abc')).toEqual(['abc']);
  });
});
