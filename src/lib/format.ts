export const DEFAULT_CURRENCY = 'USD';

export const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** Hermes ships Intl, but the fallback keeps formatting correct if it is unavailable. */
export function formatCurrency(value: number, currency: string = DEFAULT_CURRENCY): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/** Compact axis/label form: `$1.2K`, `$640`. */
export function formatCompactCurrency(value: number, currency: string = DEFAULT_CURRENCY): string {
  if (Math.abs(value) < 1000) {
    return formatCurrency(value, currency);
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    const thousands = Math.round(Math.abs(value) / 100) / 10;
    return `${value < 0 ? '-' : ''}${currency} ${thousands}K`;
  }
}

/** `2026-10-12T…` → `Oct 12`. */
export function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`;
}
