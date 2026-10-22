import { describe, expect, it, vi } from 'vitest';
import { OID, parseDate, parseNumber, registerTypeParsers } from '../../src/lib/pgTypes.js';

describe('TECH-02: pg type parsers', () => {
  it('parses numeric strings to numbers (no string-money bugs)', () => {
    expect(parseNumber('199.99')).toBe(199.99);
    expect(parseNumber('42')).toBe(42);
  });

  it('keeps date values as YYYY-MM-DD strings', () => {
    expect(parseDate('2026-11-05')).toBe('2026-11-05');
  });

  it('registers numeric, int8 and date parsers', () => {
    const setTypeParser = vi.fn();
    registerTypeParsers({ setTypeParser } as never);
    const registered = new Map(setTypeParser.mock.calls.map(([oid, fn]) => [oid, fn]));
    expect(registered.get(OID.numeric)).toBe(parseNumber);
    expect(registered.get(OID.int8)).toBe(parseNumber);
    expect(registered.get(OID.date)).toBe(parseDate);
  });
});
