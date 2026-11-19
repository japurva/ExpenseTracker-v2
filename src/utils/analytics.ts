import { dayKey, monthKey, yearKey } from '@/lib/dates';
import { MONTHS_LONG, MONTHS_SHORT } from '@/lib/format';
import { CATEGORY_COLORS } from '@/constants/category-options';
import { PAYMENT_SOURCE_COLORS, paymentKindLabel } from '@/constants/payment-options';
import type { Category, PaymentSource, Transaction } from '@/types/models';

export interface MonthlyPoint {
  /** Index signature so Victory Native's `Record<string, unknown>` constraint is satisfied. */
  [key: string]: unknown;
  index: number;
  /** `YYYY-MM` */
  key: string;
  label: string;
  income: number;
  expense: number;
}

type AmountBearing = Pick<Transaction, 'date' | 'type' | 'amount'>;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** `2026-10` + (-1) → `2026-09`. Out-of-range input is returned untouched. */
export function shiftMonth(month: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    return month;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** `2026-10` → `October 2026`. */
export function monthTitle(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    return month;
  }
  return `${MONTHS_LONG[Number(match[2]) - 1]} ${match[1]}`;
}

/**
 * Income/expense totals for the `count` months ending at `endMonth`, oldest first.
 * Transfers are excluded — moving money between accounts is neither.
 */
export function buildMonthlySeries(
  transactions: readonly AmountBearing[],
  endMonth: string,
  count = 6,
): MonthlyPoint[] {
  const months = Array.from({ length: count }, (_, offset) =>
    shiftMonth(endMonth, offset - (count - 1)),
  );

  const buckets = new Map(months.map((month) => [month, { income: 0, expense: 0 }]));

  for (const transaction of transactions) {
    const bucket = buckets.get(monthKey(transaction.date));
    if (!bucket) {
      continue;
    }
    if (transaction.type === 'income') {
      bucket.income += transaction.amount;
    } else if (transaction.type === 'expense') {
      bucket.expense += transaction.amount;
    }
  }

  return months.map((key, index) => {
    const bucket = buckets.get(key) ?? { income: 0, expense: 0 };
    return {
      index,
      key,
      label: MONTHS_SHORT[Number(key.slice(5, 7)) - 1] ?? key,
      income: round2(bucket.income),
      expense: round2(bucket.expense),
    };
  });
}

/** Time range used to scope analytics charts. */
export type DateRange =
  | { kind: 'month'; value: string } // `YYYY-MM`
  | { kind: 'year'; value: string } // `YYYY`
  | { kind: 'custom'; from: string; to: string }; // `YYYY-MM-DD` inclusive

export interface ExpenseSlice {
  id: string;
  label: string;
  value: number;
  color: string;
  icon?: string;
}

/** `YYYY-MM-DD` that exists on the calendar (rejects `2026-02-31` and malformed input). */
export function isValidDayKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return false;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return (
    date.getFullYear() === Number(match[1]) &&
    date.getMonth() === Number(match[2]) - 1 &&
    date.getDate() === Number(match[3])
  );
}

/** Test whether a transaction falls inside the given date range. */
function inRange(transaction: Transaction, range: DateRange): boolean {
  switch (range.kind) {
    case 'month':
      return monthKey(transaction.date) === range.value;
    case 'year':
      return yearKey(transaction.date) === range.value;
    case 'custom': {
      const from = range.from.trim();
      const to = range.to.trim();
      if (!isValidDayKey(from) || !isValidDayKey(to) || from > to) {
        return false;
      }
      // Local calendar day, so it buckets the same way `monthKey` does.
      const day = dayKey(transaction.date);
      return day !== '' && day >= from && day <= to;
    }
  }
}

/** Filter expenses (type === 'expense') within a date range. */
export function filterExpensesByRange(
  transactions: readonly Transaction[],
  range: DateRange,
): Transaction[] {
  return transactions.filter((t) => t.type === 'expense' && inRange(t, range));
}

/** Default "Other" colour for tiny slices. */
const OTHER_COLOR = '#94A3B8';

/** Palette for categories that were saved without a colour. */
const FALLBACK_COLORS = CATEGORY_COLORS.map((option) => option.value);

/** Minimum share (0-1) before a slice is merged into "Other". */
const SLICE_THRESHOLD = 0.03;

/** Aggregate tiny slices into "Other" and assign colours from a palette. */
function buildSlices(
  entries: { id: string; label: string; value: number; color: string; icon?: string }[],
  total: number,
): ExpenseSlice[] {
  const significant = entries.filter((e) => total > 0 && e.value / total >= SLICE_THRESHOLD);
  const others = entries.filter((e) => total === 0 || e.value / total < SLICE_THRESHOLD);

  const slices = [...significant];
  if (others.length > 0) {
    slices.push({
      id: 'other',
      label: 'Other',
      value: others.reduce((sum, e) => sum + e.value, 0),
      color: OTHER_COLOR,
    });
  }

  return slices.sort((a, b) => b.value - a.value);
}

/** Group expenses by category within a range. */
export function groupExpensesByCategory(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  range: DateRange,
): { slices: ExpenseSlice[]; total: number } {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const byCategory = new Map<string, { label: string; value: number; color: string; icon?: string }>();
  let fallbackColorIndex = 0;

  for (const transaction of filterExpensesByRange(transactions, range)) {
    const categoryId = transaction.categoryId ?? 'uncategorised';
    const existing = byCategory.get(categoryId);
    if (existing) {
      existing.value += transaction.amount;
      continue;
    }

    const category = categoryById.get(categoryId) ?? null;
    const needsFallback = category === null || category.color === null;
    const fallbackColor =
      needsFallback && categoryId !== 'uncategorised'
        ? FALLBACK_COLORS[fallbackColorIndex++ % FALLBACK_COLORS.length]
        : undefined;

    byCategory.set(categoryId, {
      label: category?.name ?? 'Uncategorised',
      value: transaction.amount,
      // Give colour-less categories a distinct palette entry instead of one shared grey.
      color: category?.color ?? fallbackColor ?? OTHER_COLOR,
      icon: category?.icon ?? undefined,
    });
  }

  const entries = [...byCategory.entries()].map(([id, data]) => ({ id, ...data }));
  const total = entries.reduce((sum, e) => sum + e.value, 0);
  return { slices: buildSlices(entries, total), total: round2(total) };
}

/** Group expenses by payment source within a range. */
export function groupExpensesByPaymentSource(
  transactions: readonly Transaction[],
  paymentSources: readonly PaymentSource[],
  range: DateRange,
): { slices: ExpenseSlice[]; total: number } {
  const sourceById = new Map(paymentSources.map((source) => [source.id, source]));
  const bySource = new Map<string, { label: string; value: number; color: string }>();

  for (const transaction of filterExpensesByRange(transactions, range)) {
    const sourceId = transaction.paymentSourceId ?? 'not-recorded';
    const existing = bySource.get(sourceId);
    if (existing) {
      existing.value += transaction.amount;
      continue;
    }

    const source = sourceById.get(sourceId) ?? null;
    const kind = source?.kind ?? transaction.paymentMethod ?? null;
    bySource.set(sourceId, {
      label: source?.name ?? paymentKindLabel(kind),
      value: transaction.amount,
      color: (kind ? PAYMENT_SOURCE_COLORS[kind] : undefined) ?? PAYMENT_SOURCE_COLORS.other,
    });
  }

  const entries = [...bySource.entries()].map(([id, data]) => ({ id, ...data }));
  const total = entries.reduce((sum, e) => sum + e.value, 0);
  return { slices: buildSlices(entries, total), total: round2(total) };
}
