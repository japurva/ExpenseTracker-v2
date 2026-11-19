import type { Category, PaymentSource, Transaction } from '@/types/models';
import { buildTransactionsCsv, csvFileName } from '@/utils/csv';

import { saveCsvFile, type SaveCsvResult } from './saveCsv';

/**
 * Cross-platform CSV export. Adds a UTF-8 BOM so Excel opens accented merchant
 * names correctly instead of mojibake.
 */
export async function exportTransactionsToCsv(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  paymentSources: readonly PaymentSource[] = [],
): Promise<SaveCsvResult> {
  const contents = `\uFEFF${buildTransactionsCsv(transactions, categories, paymentSources)}`;
  return saveCsvFile(csvFileName(), contents);
}
