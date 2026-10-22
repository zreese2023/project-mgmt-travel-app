const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatMoney(amount: number): string {
  return money.format(amount);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 'YYYY-MM-DD' to 'Thu, Nov 5' (UTC, so the day never shifts with the viewer's timezone). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[date.getUTCDay()]}, ${MONTHS[m - 1]} ${d}`;
}

/** '2026-11-05T08:15:00.000Z' to '08:15 UTC'. */
export function formatTimeUtc(timestamp: string): string {
  return `${timestamp.slice(11, 16)} UTC`;
}

/** '13:00' to '1:00 PM'; null stays empty. */
export function formatClock(time: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  if (h === undefined || m === undefined) return time;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function stopsLabel(stops: number): string {
  return stops === 0 ? 'Nonstop' : plural(stops, 'stop');
}

export function titleCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
