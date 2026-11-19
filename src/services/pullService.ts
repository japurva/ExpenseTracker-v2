import { CloudServiceError } from '@/lib/cloudError';
import { getSupabase, requireUserId } from '@/lib/supabase';
import type { PaymentSourceKind } from '@/types/models';
import type {
  CloudBudget,
  CloudCategory,
  CloudPaymentSource,
  CloudSnapshot,
  CloudTransaction,
} from '@/types/sync';

const PAYMENT_KINDS: readonly PaymentSourceKind[] = [
  'cash',
  'bank',
  'credit_card',
  'debit_card',
  'wallet',
  'upi',
  'other',
];

function toPaymentKind(value: string | null): PaymentSourceKind {
  return PAYMENT_KINDS.find((kind) => kind === value) ?? 'other';
}

/**
 * `month_year` is a `date` column; PostgREST returns `YYYY-MM-DD`, but a
 * gateway that hands back a timestamp still has to land on the first of the
 * month in the caller's timezone.
 */
function toDateOnly(value: string): string {
  if (!value.includes('T')) {
    return value.slice(0, 10);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 10);
  }
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${parsed.getFullYear()}-${month}-${day}`;
}

/** A project that has not run the payment-sources migration yet should still sync. */
function isMissingRelation(message: string, code?: string): boolean {
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /relation .* does not exist|Could not find the table|schema cache/i.test(message)
  );
}

/**
 * Reads the signed-in user's cloud rows (RLS scopes them; categories also
 * include the shared defaults).
 */
export async function fetchCloudSnapshot(): Promise<CloudSnapshot> {
  await requireUserId();
  const supabase = getSupabase();

  const [categoriesResult, paymentSourcesResult, transactionsResult, budgetsResult] =
    await Promise.all([
      supabase.from('categories').select('id, name, type, icon, color, is_default, client_id'),
      supabase.from('payment_sources').select('id, name, kind, last4, client_id'),
      supabase
        .from('transactions')
        .select(
          'id, category_id, amount, type, payment_method, payment_source_id, description, receipt_url, is_ocr_parsed, raw_ocr_text, date, client_id, created_at, updated_at',
        ),
      supabase.from('budgets').select('id, category_id, monthly_limit, month_year'),
    ]);

  let paymentSources: CloudPaymentSource[] = [];

  if (paymentSourcesResult.error) {
    const { message, code } = paymentSourcesResult.error;
    if (!isMissingRelation(message, code)) {
      throw new CloudServiceError(message, code, paymentSourcesResult.error);
    }
    console.warn('[pull] payment_sources is not available in this project yet', message);
  } else {
    paymentSources = (paymentSourcesResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      kind: toPaymentKind(row.kind),
      last4: row.last4,
      clientId: row.client_id,
    }));
  }

  const failure = categoriesResult.error ?? transactionsResult.error ?? budgetsResult.error;
  if (failure) {
    throw new CloudServiceError(failure.message, failure.code, failure);
  }

  const categories: CloudCategory[] = (categoriesResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    icon: row.icon,
    color: row.color,
    isDefault: row.is_default,
    clientId: row.client_id,
  }));

  const transactions: CloudTransaction[] = (transactionsResult.data ?? []).map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    amount: Number(row.amount),
    type: row.type,
    paymentMethod: row.payment_method,
    paymentSourceId: row.payment_source_id ?? null,
    description: row.description,
    receiptUrl: row.receipt_url,
    isOcrParsed: row.is_ocr_parsed,
    rawOcrText: row.raw_ocr_text,
    date: row.date,
    clientId: row.client_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  const budgets: CloudBudget[] = (budgetsResult.data ?? []).map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    monthlyLimit: Number(row.monthly_limit),
    monthYear: toDateOnly(row.month_year),
  }));

  return { categories, paymentSources, transactions, budgets };
}
