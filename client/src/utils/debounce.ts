export interface Debounced<Args extends unknown[]> {
  (...args: Args): void;
  cancel(): void;
}

/** Calls `fn` once, `waitMs` after the last call; earlier pending calls are dropped. */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
): Debounced<Args> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: Args): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, waitMs);
  };
  debounced.cancel = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  return debounced;
}
