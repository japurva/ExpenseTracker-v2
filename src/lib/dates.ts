import type { Transaction } from '@/types/models';

/** `YYYY-MM` (or `YYYY-MM-DD`) → first day of that month, or null when unparseable. */
export function toMonthStart(value: string): string | null {
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return null;
  }
  return `${match[1]}-${match[2]}-01`;
}

/** Local-time `YYYY-MM` bucket for an ISO timestamp. */
export function monthKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** `YYYY-MM-DD` for the same instant, in local time. */
export function dayKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/** `YYYY` for the same instant, in local time. */
export function yearKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return String(date.getFullYear());
}

export interface MonthGroup {
  month: string; // `YYYY-MM`
  label: string; // e.g. "October 2026"
  transactions: Transaction[];
  total: number;
}

export interface YearGroup {
  year: string; // `YYYY`
  label: string; // e.g. "2026"
  months: MonthGroup[];
  total: number;
  monthCount: number;
}

export function groupTransactionsByYearAndMonth(
  transactions: readonly Transaction[],
): YearGroup[] {
  const byYear = new Map<string, YearGroup>();

  for (const transaction of transactions) {
    const year = yearKey(transaction.date);
    const month = monthKey(transaction.date);
    if (!year || !month) continue;

    let yearGroup = byYear.get(year);
    if (!yearGroup) {
      yearGroup = { year, label: year, months: [], total: 0, monthCount: 0 };
      byYear.set(year, yearGroup);
    }

    let monthGroup = yearGroup.months.find((m) => m.month === month);
    if (!monthGroup) {
      monthGroup = {
        month,
        label: new Intl.DateTimeFormat(undefined, {
          year: 'numeric',
          month: 'long',
        }).format(new Date(`${month}-01`)),
        transactions: [],
        total: 0,
      };
      yearGroup.months.push(monthGroup);
      yearGroup.monthCount += 1;
    }

    monthGroup.transactions.push(transaction);
    monthGroup.total += transaction.amount;
    yearGroup.total += transaction.amount;
  }

  // Sort years descending (newest first)
  const years = [...byYear.values()].sort((a, b) => b.year.localeCompare(a.year));

  // Within each year, sort months descending; transactions within each month descending by date
  for (const yearGroup of years) {
    yearGroup.months.sort((a, b) => b.month.localeCompare(a.month));
    for (const monthGroup of yearGroup.months) {
      monthGroup.transactions.sort((a, b) => b.date.localeCompare(a.date));
    }
  }

  return years;
}
