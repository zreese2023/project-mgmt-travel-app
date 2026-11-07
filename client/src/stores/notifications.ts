import { defineStore } from 'pinia';
import { ref } from 'vue';
import { endpoints } from '../api/endpoints';
import type { AppNotification } from '../api/types';

export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<AppNotification[]>([]);
  const unread = ref(0);
  const scanning = ref(false);
  /** The automatic check on sign-in runs once per app load; the button can run it again. */
  let scannedOnLoad = false;

  async function refresh(): Promise<void> {
    const result = await endpoints.notifications.list();
    items.value = result.notifications;
    unread.value = result.unread;
  }

  /** Checks the user's upcoming trips for new alerts, then reloads the list. Returns how many are new. */
  async function scan(): Promise<number> {
    scanning.value = true;
    try {
      const { created } = await endpoints.alerts.scan();
      await refresh();
      return created;
    } finally {
      scanning.value = false;
    }
  }

  /** On sign-in: scan once per app load. Failures are ignored; the page still works without alerts. */
  async function scanOnce(): Promise<void> {
    if (scannedOnLoad) return;
    scannedOnLoad = true;
    try {
      await scan();
    } catch {
      await refresh().catch(() => undefined);
    }
  }

  async function markAllRead(): Promise<void> {
    await endpoints.notifications.readAll();
    items.value = items.value.map((n) => ({ ...n, read: true }));
    unread.value = 0;
  }

  function clear(): void {
    items.value = [];
    unread.value = 0;
    scannedOnLoad = false;
  }

  return { items, unread, scanning, refresh, scan, scanOnce, markAllRead, clear };
});
