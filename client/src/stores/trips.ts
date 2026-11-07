import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { endpoints } from '../api/endpoints';
import type { TripListEntry } from '../api/types';

const STORAGE_KEY = 'wayfarer.activeTrip';

function readStored(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const id = raw === null ? NaN : Number(raw);
    return Number.isInteger(id) ? id : null;
  } catch {
    return null; // storage can be unavailable (private mode); the store still works in memory
  }
}

function writeStored(id: number | null): void {
  try {
    if (id === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    /* ignore: remembering the selection is a convenience only */
  }
}

/** The user's trips plus the "current trip" that flight/hotel selections are added to. */
export const useTripsStore = defineStore('trips', () => {
  const trips = ref<TripListEntry[]>([]);
  const loaded = ref(false);
  const activeTripId = ref<number | null>(readStored());

  const activeTrip = computed(() => trips.value.find((t) => t.id === activeTripId.value) ?? null);
  /** Trips that can still take flights and hotels (paid and past trips are closed). */
  const openTrips = computed(() => trips.value.filter((t) => !t.paid && !t.isPast));

  function setActive(id: number | null): void {
    activeTripId.value = id;
    writeStored(id);
  }

  async function load(): Promise<void> {
    trips.value = (await endpoints.trips.list()).trips;
    loaded.value = true;
    // Forget a stored selection that no longer exists or was paid for or over; default to the only open trip.
    if (activeTripId.value !== null && !openTrips.value.some((t) => t.id === activeTripId.value)) {
      setActive(null);
    }
    if (activeTripId.value === null && openTrips.value.length === 1) {
      setActive((openTrips.value[0] as TripListEntry).id);
    }
  }

  function clear(): void {
    trips.value = [];
    loaded.value = false;
    setActive(null);
  }

  return { trips, openTrips, loaded, activeTripId, activeTrip, setActive, load, clear };
});
