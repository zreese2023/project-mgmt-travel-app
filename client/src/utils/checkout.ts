import type { Passenger, PaymentMethod, RoomRequest, SeatPreference } from '../api/types';

/**
 * Labels and client-side checks for checkout (SCRUM-15, SCRUM-16). The server repeats every check
 * and computes every price; the fees here are only for showing what a choice costs before quoting.
 */

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  credit_card: 'Credit card',
  debit_card: 'Debit card',
  paypal: 'PayPal',
};

export const SEAT_LABELS: Record<SeatPreference, string> = {
  no_preference: 'No preference',
  window: 'Window',
  aisle: 'Aisle',
  middle: 'Middle',
};

/** Checked bag options per passenger per flight; carry-on and a personal item are included. */
export const BAG_OPTIONS = [
  { value: 0, label: 'Carry-on only (included)' },
  { value: 1, label: '1 checked bag (+$35)' },
  { value: 2, label: '2 checked bags (+$80)' },
] as const;

export const ROOM_REQUEST_OPTIONS: Array<{ value: RoomRequest; label: string; fee?: string }> = [
  { value: 'early_check_in', label: 'Early check-in' },
  { value: 'late_check_out', label: 'Late check-out', fee: '+$40 per stay' },
  { value: 'high_floor', label: 'High floor' },
  { value: 'quiet_room', label: 'Quiet room' },
  { value: 'accessible_room', label: 'Accessible room' },
  { value: 'extra_bed', label: 'Extra bed', fee: '+$25 per room per night' },
  { value: 'crib', label: 'Crib' },
];

export const requestLabel = (request: RoomRequest): string =>
  ROOM_REQUEST_OPTIONS.find((o) => o.value === request)?.label ?? request;

export const MAX_ROOMS = 4;
const ADULT_AGE = 18;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const blankPassenger = (): Passenger => ({
  fullName: '',
  dateOfBirth: '',
  seat: 'no_preference',
  checkedBags: 0,
});

/** Whole years from `dateOfBirth` to `on`, both 'YYYY-MM-DD'. */
export function ageOn(dateOfBirth: string, on: string): number {
  const years = Number(on.slice(0, 4)) - Number(dateOfBirth.slice(0, 4));
  return on.slice(5) < dateOfBirth.slice(5) ? years - 1 : years;
}

/** The same rules as the server, keyed the same way (`passengers.0.fullName`). */
export function passengerErrors(
  passengers: readonly Passenger[],
  departureDay: string,
  today: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  passengers.forEach((p, i) => {
    if (p.fullName.trim().length < 2) {
      errors[`passengers.${i}.fullName`] = 'Enter the full name as it appears on the passport';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dateOfBirth) || p.dateOfBirth < '1900-01-01') {
      errors[`passengers.${i}.dateOfBirth`] = 'Enter a date of birth';
    } else if (p.dateOfBirth > today) {
      errors[`passengers.${i}.dateOfBirth`] = 'Date of birth cannot be in the future';
    }
  });
  const datesOk = passengers.every((_, i) => !errors[`passengers.${i}.dateOfBirth`]);
  if (datesOk && !passengers.some((p) => ageOn(p.dateOfBirth, departureDay) >= ADULT_AGE)) {
    errors.passengers = `At least one passenger must be ${ADULT_AGE} or older on the day of travel`;
  }
  return errors;
}

export function guestErrors(guest: {
  fullName: string;
  email: string;
  phone: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (guest.fullName.trim().length < 2) errors.fullName = 'Enter the name the booking is under';
  if (!EMAIL.test(guest.email.trim())) errors.email = 'Enter a valid email address';
  const digits = guest.phone.replace(/\D/g, '').length;
  if (digits < 7 || digits > 15) errors.phone = 'Enter a phone number of 7 to 15 digits';
  return errors;
}
