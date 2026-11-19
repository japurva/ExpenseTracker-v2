import { chunkArray } from '@/lib/array';
import { CloudServiceError } from '@/lib/cloudError';
import { getSupabase, requireUserId } from '@/lib/supabase';
import { upsertTransactionsBatch, type TransactionSyncInput } from '@/services/transactionService';
import type { CategoryType, Database, PaymentMethod, TransactionType } from '@/types/database.types';

type CategoryInsert = Database['public']['Tables']['categories']['Insert'];
type PaymentSourceInsert = Database['public']['Tables']['payment_sources']['Insert'];
type BudgetInsert = Database['public']['Tables']['budgets']['Insert'];

/** Local shapes mirror what the guest store (MMKV / IndexedDB) already holds. */
export interface GuestCategoryRecord {
  id: string;
  name: string;
  type: CategoryType;
  icon?: string | null;
  color?: string | null;
}

export interface GuestPaymentSourceRecord {
  id: string;
  name: string;
  kind?: PaymentMethod | string | null;
  last4?: string | null;
}

export interface GuestTransactionRecord {
  id: string;
  categoryId?: string | null;
  amount: number;
  type: TransactionType;
  paymentSourceId?: string | null;
  paymentMethod?: string | null;
  description?: string | null;
  receiptUri?: string | null;
  isOcrParsed?: boolean;
  rawOcrText?: string | null;
  date: string;
}

export interface GuestBudgetRecord {
  id: string;
  categoryId: string;
  monthlyLimit: number;
  /** `YYYY-MM` or `YYYY-MM-DD`; normalised to the first of the month. */
  monthYear: string;
}

export interface GuestDataSnapshot {
  categories: GuestCategoryRecord[];
  paymentSources: GuestPaymentSourceRecord[];
  transactions: GuestTransactionRecord[];
  budgets: GuestBudgetRecord[];
}

export type MigrationStage = 'categories' | 'paymentSources' | 'transactions' | 'budgets';

export interface MigrationProgress {
  stage: MigrationStage;
  processed: number;
  total: number;
}

export interface MigrationFailure {
  stage: MigrationStage;
  localId: string;
  reason: string;
}

export interface MigrationStageResult {
  uploaded: number;
  skipped: number;
  failed: MigrationFailure[];
}

export interface MigrationReport {
  categories: MigrationStageResult;
  paymentSources: MigrationStageResult;
  transactions: MigrationStageResult;
  budgets: MigrationStageResult;
  /** Local category id → remote category id, for callers that re-map local rows. */
  categoryIdMap: Record<string, string>;
  /** Local payment-source id → remote payment-source id. */
  paymentSourceIdMap: Record<string, string>;
}

export interface MigrationOptions {
  chunkSize?: number;
  onProgress?: (progress: MigrationProgress) => void;
}

const DEFAULT_CHUNK_SIZE = 200;

function emptyStageResult(): MigrationStageResult {
  return { uploaded: 0, skipped: 0, failed: [] };
}

function describeError(error: unknown): string {
  if (error instanceof CloudServiceError) {
    return error.code ? `${error.message} (${error.code})` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function normalizeMonthYear(value: string): string | null {
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

function categoryKey(name: string, type: CategoryType): string {
  return `${name.trim().toLowerCase()}::${type}`;
}

const PAYMENT_KINDS: readonly PaymentMethod[] = [
  'cash',
  'bank',
  'credit_card',
  'debit_card',
  'wallet',
  'upi',
  'other',
];

/** Legacy rows used `bank_transfer`; anything unknown becomes `other`. */
function normalizePaymentKind(kind: string | null | undefined): PaymentMethod {
  if (kind === 'bank_transfer') {
    return 'bank';
  }
  return PAYMENT_KINDS.find((value) => value === kind) ?? 'other';
}

/**
 * Uploads a guest snapshot to the signed-in account.
 *
 * Order matters: categories are resolved first (transactions and budgets reference
 * them), then transactions, then budgets. Every stage is idempotent — records are
 * matched on `client_id` (categories, transactions) or on the natural
 * `(category, month)` key (budgets) — so a failed or retried run never duplicates.
 */
export async function migrateGuestData(
  snapshot: GuestDataSnapshot,
  options: MigrationOptions = {},
): Promise<MigrationReport> {
  const userId = await requireUserId();
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;

  const report: MigrationReport = {
    categories: emptyStageResult(),
    paymentSources: emptyStageResult(),
    transactions: emptyStageResult(),
    budgets: emptyStageResult(),
    categoryIdMap: {},
    paymentSourceIdMap: {},
  };

  report.categoryIdMap = await migrateCategories(
    userId,
    snapshot.categories,
    chunkSize,
    report.categories,
    options.onProgress,
  );

  report.paymentSourceIdMap = await migratePaymentSources(
    userId,
    snapshot.paymentSources ?? [],
    chunkSize,
    report.paymentSources,
    options.onProgress,
  );

  await migrateTransactions(
    userId,
    snapshot.transactions,
    report.categoryIdMap,
    report.paymentSourceIdMap,
    chunkSize,
    report.transactions,
    options.onProgress,
  );

  await migrateBudgets(
    userId,
    snapshot.budgets,
    report.categoryIdMap,
    chunkSize,
    report.budgets,
    options.onProgress,
  );

  return report;
}

async function migrateCategories(
  userId: string,
  categories: readonly GuestCategoryRecord[],
  chunkSize: number,
  result: MigrationStageResult,
  onProgress?: (progress: MigrationProgress) => void,
): Promise<Record<string, string>> {
  const idMap = new Map<string, string>();
  if (categories.length === 0) {
    return {};
  }

  // RLS already limits this to the caller's own categories plus the shared defaults.
  const { data: existing, error } = await getSupabase()
    .from('categories')
    .select('id, name, type, client_id');

  if (error) {
    throw new CloudServiceError(error.message, error.code, error);
  }

  const byClientId = new Map<string, string>();
  const byNameType = new Map<string, string>();
  for (const row of existing) {
    if (row.client_id) {
      byClientId.set(row.client_id, row.id);
    }
    byNameType.set(categoryKey(row.name, row.type), row.id);
  }

  const toCreate: CategoryInsert[] = [];
  const createdLocally = new Set<string>();

  for (const category of categories) {
    if (idMap.has(category.id)) {
      continue;
    }

    const name = category.name.trim();
    if (!name) {
      result.failed.push({ stage: 'categories', localId: category.id, reason: 'Category name is empty' });
      continue;
    }

    // Reuse an existing row: same device id first, then a matching default/name.
    const matched = byClientId.get(category.id) ?? byNameType.get(categoryKey(name, category.type));
    if (matched) {
      idMap.set(category.id, matched);
      result.skipped += 1;
      continue;
    }

    toCreate.push({
      // Keep local and remote ids identical so later edits/deletes match.
      id: category.id,
      user_id: userId,
      name,
      type: category.type,
      icon: category.icon ?? null,
      color: category.color ?? null,
      is_default: false,
      client_id: category.id,
    });
    createdLocally.add(category.id);
  }

  let processed = categories.length - toCreate.length;

  for (const chunk of chunkArray(toCreate, chunkSize)) {
    const { error: insertError } = await getSupabase()
      .from('categories')
      .upsert(chunk, { onConflict: 'user_id,client_id' });

    if (insertError) {
      for (const row of chunk) {
        result.failed.push({
          stage: 'categories',
          localId: row.client_id ?? '',
          reason: insertError.message,
        });
        createdLocally.delete(row.client_id ?? '');
      }
    }

    processed += chunk.length;
    onProgress?.({ stage: 'categories', processed, total: categories.length });
  }

  if (createdLocally.size > 0) {
    // Read back the generated remote ids (also picks up rows an earlier attempt created).
    const { data: uploaded, error: reloadError } = await getSupabase()
      .from('categories')
      .select('id, client_id')
      .eq('user_id', userId)
      .not('client_id', 'is', null);

    if (reloadError) {
      throw new CloudServiceError(reloadError.message, reloadError.code, reloadError);
    }

    for (const row of uploaded) {
      if (row.client_id) {
        idMap.set(row.client_id, row.id);
      }
    }

    for (const localId of createdLocally) {
      if (idMap.has(localId)) {
        result.uploaded += 1;
      } else {
        result.failed.push({
          stage: 'categories',
          localId,
          reason: 'Category was not found after upload',
        });
      }
    }
  }

  return Object.fromEntries(idMap);
}

async function migratePaymentSources(
  userId: string,
  sources: readonly GuestPaymentSourceRecord[],
  chunkSize: number,
  result: MigrationStageResult,
  onProgress?: (progress: MigrationProgress) => void,
): Promise<Record<string, string>> {
  const idMap = new Map<string, string>();
  if (sources.length === 0) {
    return {};
  }

  // RLS limits this to the caller's own sources.
  const { data: existing, error } = await getSupabase()
    .from('payment_sources')
    .select('id, name, kind, client_id');

  if (error) {
    throw new CloudServiceError(error.message, error.code, error);
  }

  const byClientId = new Map<string, string>();
  const byNameKind = new Map<string, string>();
  for (const row of existing) {
    if (row.client_id) {
      byClientId.set(row.client_id, row.id);
    }
    byNameKind.set(`${row.name.trim().toLowerCase()}::${row.kind}`, row.id);
  }

  const toCreate: PaymentSourceInsert[] = [];
  const createdLocally = new Set<string>();

  for (const source of sources) {
    if (idMap.has(source.id)) {
      continue;
    }

    const name = source.name.trim();
    if (!name) {
      result.failed.push({
        stage: 'paymentSources',
        localId: source.id,
        reason: 'Payment source name is empty',
      });
      continue;
    }

    const kind = normalizePaymentKind(source.kind);
    const matched = byClientId.get(source.id) ?? byNameKind.get(`${name.toLowerCase()}::${kind}`);
    if (matched) {
      idMap.set(source.id, matched);
      result.skipped += 1;
      continue;
    }

    toCreate.push({
      user_id: userId,
      name,
      kind,
      last4: source.last4 ?? null,
      client_id: source.id,
    });
    createdLocally.add(source.id);
  }

  let processed = sources.length - toCreate.length;

  for (const chunk of chunkArray(toCreate, chunkSize)) {
    const { error: insertError } = await getSupabase()
      .from('payment_sources')
      .upsert(chunk, { onConflict: 'user_id,client_id' });

    if (insertError) {
      for (const row of chunk) {
        result.failed.push({
          stage: 'paymentSources',
          localId: row.client_id ?? '',
          reason: insertError.message,
        });
        createdLocally.delete(row.client_id ?? '');
      }
    }

    processed += chunk.length;
    onProgress?.({ stage: 'paymentSources', processed, total: sources.length });
  }

  if (createdLocally.size > 0) {
    const { data: uploaded, error: reloadError } = await getSupabase()
      .from('payment_sources')
      .select('id, client_id')
      .eq('user_id', userId)
      .not('client_id', 'is', null);

    if (reloadError) {
      throw new CloudServiceError(reloadError.message, reloadError.code, reloadError);
    }

    for (const row of uploaded) {
      if (row.client_id) {
        idMap.set(row.client_id, row.id);
      }
    }

    for (const localId of createdLocally) {
      if (idMap.has(localId)) {
        result.uploaded += 1;
      } else {
        result.failed.push({
          stage: 'paymentSources',
          localId,
          reason: 'Payment source was not found after upload',
        });
      }
    }
  }

  return Object.fromEntries(idMap);
}

async function migrateTransactions(
  userId: string,
  transactions: readonly GuestTransactionRecord[],
  categoryIdMap: Record<string, string>,
  paymentSourceIdMap: Record<string, string>,
  chunkSize: number,
  result: MigrationStageResult,
  onProgress?: (progress: MigrationProgress) => void,
): Promise<void> {
  if (transactions.length === 0) {
    return;
  }

  const seen = new Set<string>();
  const pending: TransactionSyncInput[] = [];

  for (const record of transactions) {
    if (seen.has(record.id)) {
      result.skipped += 1;
      continue;
    }
    seen.add(record.id);

    const amount = Number(record.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      result.failed.push({
        stage: 'transactions',
        localId: record.id,
        reason: 'Amount must be a positive number',
      });
      continue;
    }
    if (!record.date) {
      result.failed.push({ stage: 'transactions', localId: record.id, reason: 'Missing date' });
      continue;
    }

    pending.push({
      clientId: record.id,
      amount,
      type: record.type,
      categoryId: record.categoryId ? (categoryIdMap[record.categoryId] ?? null) : null,
      paymentSourceId: record.paymentSourceId
        ? (paymentSourceIdMap[record.paymentSourceId] ?? null)
        : null,
      paymentMethod: record.paymentMethod ? normalizePaymentKind(record.paymentMethod) : null,
      description: record.description ?? null,
      receiptUrl: record.receiptUri ?? null,
      isOcrParsed: record.isOcrParsed ?? false,
      rawOcrText: record.rawOcrText ?? null,
      date: record.date,
    });
  }

  let processed = transactions.length - pending.length;

  for (const chunk of chunkArray(pending, chunkSize)) {
    try {
      const inserted = await upsertTransactionsBatch(chunk, { chunkSize: chunk.length });
      result.uploaded += inserted;
      result.skipped += chunk.length - inserted;
    } catch (error) {
      const reason = describeError(error);
      for (const row of chunk) {
        result.failed.push({ stage: 'transactions', localId: row.clientId, reason });
      }
    }

    processed += chunk.length;
    onProgress?.({ stage: 'transactions', processed, total: transactions.length });
  }
}

async function migrateBudgets(
  userId: string,
  budgets: readonly GuestBudgetRecord[],
  categoryIdMap: Record<string, string>,
  chunkSize: number,
  result: MigrationStageResult,
  onProgress?: (progress: MigrationProgress) => void,
): Promise<void> {
  if (budgets.length === 0) {
    return;
  }

  const pending = new Map<string, BudgetInsert>();

  for (const record of budgets) {
    const remoteCategoryId = categoryIdMap[record.categoryId];
    if (!remoteCategoryId) {
      result.failed.push({
        stage: 'budgets',
        localId: record.categoryId,
        reason: 'Category for budget was not migrated',
      });
      continue;
    }

    const monthYear = normalizeMonthYear(record.monthYear);
    if (!monthYear) {
      result.failed.push({
        stage: 'budgets',
        localId: record.categoryId,
        reason: `Invalid month "${record.monthYear}"`,
      });
      continue;
    }

    const monthlyLimit = Number(record.monthlyLimit);
    if (!Number.isFinite(monthlyLimit) || monthlyLimit <= 0) {
      result.failed.push({
        stage: 'budgets',
        localId: record.categoryId,
        reason: 'Monthly limit must be a positive number',
      });
      continue;
    }

    pending.set(`${remoteCategoryId}::${monthYear}`, {
      id: record.id,
      user_id: userId,
      category_id: remoteCategoryId,
      monthly_limit: monthlyLimit,
      month_year: monthYear,
    });
  }

  const rows = [...pending.values()];
  let processed = budgets.length - rows.length;

  for (const chunk of chunkArray(rows, chunkSize)) {
    const { data, error } = await getSupabase()
      .from('budgets')
      .upsert(chunk, {
        onConflict: 'user_id,category_id,month_year',
      })
      .select('id');

    if (error) {
      for (const row of chunk) {
        result.failed.push({ stage: 'budgets', localId: row.category_id, reason: error.message });
      }
    } else {
      result.uploaded += data.length;
      result.skipped += chunk.length - data.length;
    }

    processed += chunk.length;
    onProgress?.({ stage: 'budgets', processed, total: budgets.length });
  }
}
