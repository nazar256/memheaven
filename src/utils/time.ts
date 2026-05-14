export function nowIso(date = new Date()): string {
  return date.toISOString();
}

export function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isoToUnixSeconds(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

export function asIsoDate(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date or datetime: ${value}`);
  }
  return date.toISOString();
}

export function isDateOrDateTime(value: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return true;
  }
  return !Number.isNaN(new Date(value).getTime());
}
