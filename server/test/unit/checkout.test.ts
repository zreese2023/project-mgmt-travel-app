import { describe, expect, it } from 'vitest';
import {
  ageOn,
  validateGuest,
  validatePassengers,
  validateRequests,
  type Passenger,
} from '../../src/lib/checkout.js';
import { AppError } from '../../src/lib/errors.js';

const TODAY = '2026-11-07';
const DEPARTS = '2026-12-01';

const passenger = (overrides: Partial<Passenger> = {}): Passenger => ({
  fullName: 'Ada Lovelace',
  dateOfBirth: '1990-05-10',
  seat: 'window',
  checkedBags: 1,
  ...overrides,
});

/** The field errors of the AppError thrown by `fn`. */
function fieldErrors(fn: () => unknown): Record<string, string> {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(422);
    return (err as AppError).details ?? {};
  }
  throw new Error('expected a validation error');
}

describe('age on the day of travel', () => {
  it('counts whole years, turning a year older on the birthday', () => {
    expect(ageOn('2008-12-01', '2026-12-01')).toBe(18);
    expect(ageOn('2008-12-02', '2026-12-01')).toBe(17);
    expect(ageOn('2000-02-29', '2026-02-28')).toBe(25);
  });
});

describe('SCRUM-15: passenger details', () => {
  it('accepts valid passengers and tidies their names', () => {
    const [tidied] = validatePassengers(
      [passenger({ fullName: '  Ada   King  Lovelace ' })],
      DEPARTS,
      TODAY,
    );
    expect(tidied?.fullName).toBe('Ada King Lovelace');
  });

  it('keys each error by passenger and field', () => {
    const errors = fieldErrors(() =>
      validatePassengers(
        [
          passenger(),
          passenger({
            fullName: 'A',
            dateOfBirth: '2030-01-01',
            checkedBags: 3,
            seat: 'roof' as never,
          }),
        ],
        DEPARTS,
        TODAY,
      ),
    );
    expect(Object.keys(errors).sort()).toEqual([
      'passengers.1.checkedBags',
      'passengers.1.dateOfBirth',
      'passengers.1.fullName',
      'passengers.1.seat',
    ]);
    expect(errors['passengers.1.dateOfBirth']).toMatch(/future/);
  });

  it('rejects impossible dates of birth', () => {
    for (const dateOfBirth of ['1990-02-30', '10/05/1990', '1899-12-31']) {
      const errors = fieldErrors(() =>
        validatePassengers([passenger({ dateOfBirth })], DEPARTS, TODAY),
      );
      expect(errors).toHaveProperty(['passengers.0.dateOfBirth']);
    }
  });

  it('needs at least one adult on the day of departure', () => {
    const child = passenger({ dateOfBirth: '2015-01-01' });
    expect(fieldErrors(() => validatePassengers([child], DEPARTS, TODAY)).passengers).toMatch(
      /18 or older/,
    );
    const almostAdult = passenger({ dateOfBirth: '2008-12-01' });
    expect(() => validatePassengers([almostAdult, child], DEPARTS, TODAY)).not.toThrow();
  });

  it('allows 1 to 9 passengers', () => {
    expect(fieldErrors(() => validatePassengers([], DEPARTS, TODAY))).toHaveProperty('passengers');
    const ten = Array.from({ length: 10 }, () => passenger());
    expect(fieldErrors(() => validatePassengers(ten, DEPARTS, TODAY))).toHaveProperty('passengers');
  });
});

describe('SCRUM-16: guest contact and room requests', () => {
  const guest = {
    fullName: 'Grace Hopper',
    email: ' Grace@Example.COM ',
    phone: '+1 (555) 010-2000',
  };

  it('accepts a valid guest and normalises the email', () => {
    expect(validateGuest(guest)).toEqual({ ...guest, email: 'grace@example.com' });
  });

  it('rejects a bad name, email or phone', () => {
    const errors = fieldErrors(() =>
      validateGuest({ fullName: ' ', email: 'grace@', phone: '12-34' }),
    );
    expect(Object.keys(errors).sort()).toEqual(['email', 'fullName', 'phone']);
    expect(fieldErrors(() => validateGuest({ ...guest, phone: 'call me' }))).toHaveProperty(
      'phone',
    );
  });

  it('accepts known requests once each and rejects unknown ones', () => {
    expect(validateRequests(['crib', 'crib', 'high_floor'])).toEqual(['crib', 'high_floor']);
    expect(validateRequests()).toEqual([]);
    expect(fieldErrors(() => validateRequests(['jacuzzi']))).toHaveProperty('requests');
  });
});
