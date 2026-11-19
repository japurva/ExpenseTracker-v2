import { CloudServiceError } from '@/lib/cloudError';
import { getSupabase, requireUserId } from '@/lib/supabase';
import type { Database, TransactionType } from '@/types/database.types';

type TransactionRow = Database['public']['Tables']['transactions']['Row'];
type TransactionInsert = Database['public']['Tables']['transactions']['Insert'];
type TransactionUpdate = Database['public']['Tables']['transactions']['Update'];

export interface Transaction {
  id: string;
  userId: string;
  categoryId: string | null;
  amount: number;
  type: TransactionType;
  paymentMethod: string | null;
  paymentSourceId: string | null;
  description: string | null;
  receiptUrl: string | null;
  isOcrParsed: boolean;
  rawOcrText: string | null;
  date: string;
  clientId: string | null;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
}

export interface TransactionInput {
  amount: number;
  type: TransactionType;
  categoryId?: string | null;
  paymentMethod?: string | null;
  paymentSourceId?: string | null;
  description?: string | null;
  receiptUrl?: string | null;
  isOcrParsed?: boolean;
  rawOcrText?: string | null;
  date?: string;
}

/** A locally created row being pushed to the cloud; `clientId` makes retries idempotent. */
export type TransactionSyncInput = TransactionInput & { clientId: string };

export type TransactionPatch = Partial<Omit<TransactionInput, 'date'>> & { date?: string };

export interface TransactionFilters {
  from?: string;
  to?: string;
  categoryId?: string;
  type?: TransactionType;
  paymentMethod?: string;
  paymentSourceId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export { CloudServiceError };

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 50;

export function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    userId: row.user_id,
    categoryId: row.category_id,
    // PostgREST serialises `numeric` as a string for exact precision.
    amount: Number(row.amount),
    type: row.type,
    paymentMethod: row.payment_method,
    paymentSourceId: row.payment_source_id,
    description: row.description,
    receiptUrl: row.receipt_url,
    isOcrParsed: row.is_ocr_parsed,
    rawOcrText: row.raw_ocr_text,
    date: row.date,
    clientId: row.client_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncedAt: row.synced_at,
  };
}

function assertPositiveAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new CloudServiceError('Amount must be a positive number.', 'invalid_amount');
  }
}

function toInsert(userId: string, input: TransactionInput): TransactionInsert {
  assertPositiveAmount(input.amount);
  return {
    user_id: userId,
    amount: input.amount,
    type: input.type,
    category_id: input.categoryId ?? null,
    payment_method: input.paymentMethod ?? null,
    payment_source_id: input.paymentSourceId ?? null,
    description: input.description ?? null,
    receipt_url: input.receiptUrl ?? null,
    is_ocr_parsed: input.isOcrParsed ?? false,
    raw_ocr_text: input.rawOcrText ?? null,
    ...(input.date ? { date: input.date } : {}),
  };
}

function toUpdate(patch: TransactionPatch): TransactionUpdate {
  const update: TransactionUpdate = {};
  if (patch.amount !== undefined) {
    assertPositiveAmount(patch.amount);
    update.amount = patch.amount;
  }
  if (patch.type !== undefined) update.type = patch.type;
  if (patch.categoryId !== undefined) update.category_id = patch.categoryId;
  if (patch.paymentMethod !== undefined) update.payment_method = patch.paymentMethod;
  if (patch.paymentSourceId !== undefined) update.payment_source_id = patch.paymentSourceId;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.receiptUrl !== undefined) update.receipt_url = patch.receiptUrl;
  if (patch.isOcrParsed !== undefined) update.is_ocr_parsed = patch.isOcrParsed;
  if (patch.rawOcrText !== undefined) update.raw_ocr_text = patch.rawOcrText;
  if (patch.date !== undefined) update.date = patch.date;
  return update;
}

/** Escapes PostgREST `ilike` wildcards so user input matches literally. */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export async function listTransactions(filters: TransactionFilters = {}): Promise<Transaction[]> {
  const userId = await requireUserId();
  const limit = Math.min(filters.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = Math.max(filters.offset ?? 0, 0);

  let query = getSupabase()
    .from('transactions')
    .select('*')
    .eq('user_id', userId);

  if (filters.from) query = query.gte('date', filters.from);
  if (filters.to) query = query.lte('date', filters.to);
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.type) query = query.eq('type', filters.type);
  if (filters.paymentMethod) query = query.eq('payment_method', filters.paymentMethod);
  if (filters.paymentSourceId) query = query.eq('payment_source_id', filters.paymentSourceId);
  if (filters.search) {
    query = query.ilike('description', `%${escapeLikePattern(filters.search)}%`);
  }

  const { data, error } = await query
    .order('date', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new CloudServiceError(error.message, error.code, error);
  }
  return data.map(toTransaction);
}

export async function getTransaction(id: string): Promise<Transaction | null> {
  const userId = await requireUserId();
  const { data, error } = await getSupabase()
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new CloudServiceError(error.message, error.code, error);
  }
  return data ? toTransaction(data) : null;
}

export async function createTransaction(input: TransactionInput): Promise<Transaction> {
  const userId = await requireUserId();
  const { data, error } = await getSupabase()
    .from('transactions')
    .insert(toInsert(userId, input))
    .select('*')
    .single();

  if (error) {
    throw new CloudServiceError(error.message, error.code, error);
  }
  return toTransaction(data);
}

export async function updateTransaction(id: string, patch: TransactionPatch): Promise<Transaction> {
  const userId = await requireUserId();
  const update = toUpdate(patch);

  if (Object.keys(update).length === 0) {
    const current = await getTransaction(id);
    if (!current) {
      throw new CloudServiceError('Transaction not found.', 'not_found');
    }
    return current;
  }

  const { data, error } = await getSupabase()
    .from('transactions')
    .update(update)
    .eq('user_id', userId)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new CloudServiceError(error.message, error.code, error);
  }
  if (!data) {
    throw new CloudServiceError('Transaction not found.', 'not_found');
  }
  return toTransaction(data);
}

export async function deleteTransaction(id: string): Promise<void> {
  const userId = await requireUserId();
  const { data, error } = await getSupabase()
    .from('transactions')
    .delete()
    .eq('user_id', userId)
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    throw new CloudServiceError(error.message, error.code, error);
  }
  if (!data) {
    throw new CloudServiceError('Transaction not found.', 'not_found');
  }
}

/**
 * Pushes locally created rows up in chunks. Rows whose `clientId` already exists
 * are skipped, so a retried migration never duplicates transactions.
 */
export async function upsertTransactionsBatch(
  rows: readonly TransactionSyncInput[],
  options: { chunkSize?: number; onChunk?: (uploaded: number, total: number) => void } = {},
): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }

  const userId = await requireUserId();
  const chunkSize = options.chunkSize ?? 200;
  const pending = new Map<string, TransactionSyncInput>();
  for (const row of rows) {
    assertPositiveAmount(row.amount);
    pending.set(row.clientId, row);
  }

  const values = [...pending.values()];
  let uploaded = 0;

  for (let index = 0; index < values.length; index += chunkSize) {
    const chunk = values.slice(index, index + chunkSize);
    const payload: TransactionInsert[] = chunk.map((row) => ({
      ...toInsert(userId, row),
      // `client_id` is the device-local id and the upsert arbiter, so edits and
      // deletes always find the same row. Sending `id` as well would make a
      // re-sync collide on the primary key instead of updating.
      client_id: row.clientId,
      synced_at: new Date().toISOString(),
    }));

    const { data, error } = await getSupabase()
      .from('transactions')
      .upsert(payload, { onConflict: 'user_id,client_id' })
      .select('id');

    if (error) {
      throw new CloudServiceError(error.message, error.code, error);
    }
    uploaded += data.length;
    options.onChunk?.(uploaded, values.length);
  }

  return uploaded;
}
