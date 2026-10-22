/** Money is held as integer cents while calculating to avoid floating-point drift. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Applies a fractional rate (e.g. 0.075 tax) to cents, rounding half up.
 * The toFixed step removes binary float noise (11257.499999999999 -> 11257.5) before rounding.
 */
export function applyRate(cents: number, rate: number): number {
  return Math.round(Number((cents * rate).toFixed(6)));
}
