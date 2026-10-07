const pad = (n: number) => String(n).padStart(2, '0');

export function parseISODate(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function formatDMY(value: string): string {
  const d = parseISODate(value);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '';
}

export function formatShortDM(value: string): string {
  const d = parseISODate(value);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` : '';
}

export function addDays(value: string, days: number): string {
  const d = parseISODate(value);
  if (!d) return '';
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function daysBetween(from: string, to: string): number | null {
  const a = parseISODate(from);
  const b = parseISODate(to);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function ageInYears(dob: string, ref: string): number | null {
  const b = parseISODate(dob);
  const r = parseISODate(ref);
  if (!b || !r) return null;
  let age = r.getFullYear() - b.getFullYear();
  const m = r.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && r.getDate() < b.getDate())) age--;
  return age;
}

export function isValidTime(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

export function timeToMinutes(t: string): number | null {
  if (!isValidTime(t)) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins: number): string {
  const v = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`;
}

export function addHoursToTime(t: string, hours: number): string {
  const m = timeToMinutes(t);
  return m === null ? '' : minutesToTime(m + hours * 60);
}

export function crossesMidnight(t: string, hours: number): boolean {
  const m = timeToMinutes(t);
  return m !== null && m + hours * 60 >= 1440;
}

/** Smallest absolute difference between two clock times, in minutes. */
export function timeDeviation(a: string, b: string): number | null {
  const x = timeToMinutes(a);
  const y = timeToMinutes(b);
  if (x === null || y === null) return null;
  const d = Math.abs(x - y);
  return Math.min(d, 1440 - d);
}

export function nowTime(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
