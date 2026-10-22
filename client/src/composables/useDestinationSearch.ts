import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { endpoints } from '../api/endpoints';
import type { DestinationSummary } from '../api/types';
import { errorMessage } from '../utils/errors';
import { debounce } from '../utils/debounce';

export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Destination search state. Typing in the keyword box is debounced so one request is made after
 * the user pauses; changing a filter searches immediately. Out-of-order responses are ignored.
 */
export function useDestinationSearch(initial: { q?: string } = {}) {
  const q = ref(initial.q ?? '');
  const regions = ref<string[]>([]);
  const budgets = ref<number[]>([]);
  const interests = ref<string[]>([]);
  const results = ref<DestinationSummary[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const searched = ref(false);
  let latest = 0;

  const hasFilters = computed(
    () => regions.value.length > 0 || budgets.value.length > 0 || interests.value.length > 0,
  );

  async function run(): Promise<void> {
    const ticket = ++latest;
    loading.value = true;
    error.value = null;
    try {
      const response = await endpoints.destinations.search({
        q: q.value.trim(),
        region: regions.value,
        budget: budgets.value,
        interest: interests.value,
      });
      if (ticket !== latest) return;
      results.value = response.destinations;
    } catch (err) {
      if (ticket !== latest) return;
      error.value = errorMessage(err);
    } finally {
      if (ticket === latest) {
        loading.value = false;
        searched.value = true;
      }
    }
  }

  const debouncedRun = debounce(() => void run(), SEARCH_DEBOUNCE_MS);

  watch(q, () => debouncedRun());
  watch(
    [regions, budgets, interests],
    () => {
      debouncedRun.cancel();
      void run();
    },
    { deep: true },
  );
  onBeforeUnmount(() => debouncedRun.cancel());

  function clearFilters(): void {
    regions.value = [];
    budgets.value = [];
    interests.value = [];
  }

  return {
    q,
    regions,
    budgets,
    interests,
    results,
    loading,
    error,
    searched,
    hasFilters,
    run,
    clearFilters,
  };
}
