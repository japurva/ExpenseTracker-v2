import { DEFAULT_CURRENCY } from '@/lib/format';
import { dayKey } from '@/lib/dates';
import { paymentKindLabel } from '@/constants/payment-options';
import type { Category, PaymentSource, Transaction } from '@/types/models';

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/** RFC 4180: quote when the value contains a delimiter, quote, or newline. */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const header = columns.map((column) => escapeCsvField(column.header)).join(',');
  const body = rows.map((row) =>
    columns.map((column) => escapeCsvField(column.value(row))).join(','),
  );
  return [header, ...body].join('\r\n');
}

export interface TransactionCsvOptions {
  currency?: string;
}

/**
 * Transaction export. Amounts are written with a fixed decimal point (no thousands
 * separators) so spreadsheets in comma-decimal locales still parse the column.
 */
export function buildTransactionsCsv(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  paymentSources: readonly PaymentSource[] = [],
  options: TransactionCsvOptions = {},
): string {
  const currency = options.currency ?? DEFAULT_CURRENCY;
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const paymentSourceById = new Map(paymentSources.map((source) => [source.id, source]));

  const columns: CsvColumn<Transaction>[] = [
    { header: 'Date', value: (transaction) => transaction.date },
    { header: 'Type', value: (transaction) => transaction.type },
    {
      header: 'Category',
      value: (transaction) =>
        transaction.categoryId
          ? (categoryById.get(transaction.categoryId)?.name ?? 'Uncategorised')
          : 'Uncategorised',
    },
    { header: 'Amount', value: (transaction) => transaction.amount.toFixed(2) },
    { header: 'Currency', value: () => currency },
    { header: 'Description', value: (transaction) => transaction.description ?? '' },
    {
      header: 'Payment Source',
      value: (transaction) =>
        transaction.paymentSourceId
          ? (paymentSourceById.get(transaction.paymentSourceId)?.name ?? '')
          : '',
    },
    {
      header: 'Payment Method',
      value: (transaction) => (transaction.paymentMethod ? paymentKindLabel(transaction.paymentMethod) : ''),
    },
    { header: 'From Receipt', value: (transaction) => (transaction.isOcrParsed ? 'yes' : 'no') },
    { header: 'Receipt', value: (transaction) => transaction.receiptUri ?? '' },
    { header: 'Created At', value: (transaction) => transaction.createdAt },
  ];

  return toCsv(transactions, columns);
}

export function csvFileName(date: Date = new Date()): string {
  return `expense-tracker-${dayKey(date) || 'export'}.csv`;
}
