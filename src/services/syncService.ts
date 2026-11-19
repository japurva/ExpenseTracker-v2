import { CloudNotConfiguredError, getSupabase, isCloudConfigured, requireUserId } from '@/lib/supabase';
import {
  migrateGuestData,
  type MigrationProgress,
  type MigrationReport,
} from '@/services/guestMigrationService';
import { fetchCloudSnapshot } from '@/services/pullService';
import { useExpenseStore } from '@/stores/expenseStore';
import type { PendingDeletion } from '@/types/models';
import type { CloudSnapshot } from '@/types/sync';

export interface SyncOutcome {
  report: MigrationReport;
  uploaded: number;
  skipped: number;
  failed: number;
  deleted: number;
  deleteFailures: number;
  pulled: {
    categories: number;
    paymentSources: number;
    transactions: number;
    budgets: number;
  };
}

export interface SyncOptions {
  onProgress?: (progress: MigrationProgress) => void;
}

function sumStages(report: MigrationReport) {
  const stages = [report.categories, report.paymentSources, report.transactions, report.budgets];
  return {
    uploaded: stages.reduce((total, stage) => total + stage.uploaded, 0),
    skipped: stages.reduce((total, stage) => total + stage.skipped, 0),
    failed: stages.reduce((total, stage) => total + stage.failed.length, 0),
  };
}

/**
 * Replays local deletes. Rows are addressed by `client_id` (which equals the
 * local id), and budgets by their natural key since they have no client id.
 * Failures keep their tombstone so the next sync retries them.
 */
async function pushDeletions(
  deletions: readonly PendingDeletion[],
): Promise<{ applied: PendingDeletion[]; failures: number }> {
  const supabase = getSupabase();
  const applied: PendingDeletion[] = [];
  let failures = 0;

  for (const deletion of deletions) {
    const result =
      deletion.entity === 'transaction'
        ? await supabase.from('transactions').delete().eq('client_id', deletion.localId)
        : deletion.entity === 'category'
          ? await supabase.from('categories').delete().eq('client_id', deletion.localId)
          : deletion.entity === 'paymentSource'
            ? await supabase.from('payment_sources').delete().eq('client_id', deletion.localId)
            : await supabase
                .from('budgets')
                .delete()
                .eq('category_id', deletion.categoryId)
                .eq('month_year', deletion.monthYear);

    if (result.error) {
      failures += 1;
      console.warn('[sync] delete failed', deletion, result.error.message);
    } else {
      applied.push(deletion);
    }
  }

  return { applied, failures };
}

/**
 * Rows written outside this app — imports, other clients, the SQL editor — have
 * no `client_id`, so pushing them again would insert a duplicate instead of
 * updating. Stamp the id we adopt locally onto the cloud row first; every later
 * push then matches on `(user_id, client_id)`.
 */
async function adoptCloudRows(snapshot: CloudSnapshot): Promise<number> {
  const supabase = getSupabase();
  let adopted = 0;

  const stamp = async (
    table: 'transactions' | 'categories' | 'payment_sources',
    id: string,
  ): Promise<void> => {
    const { error } = await supabase.from(table).update({ client_id: id }).eq('id', id);
    if (error) {
      console.warn('[sync] could not adopt cloud row', table, id, error.message);
      return;
    }
    adopted += 1;
  };

  for (const transaction of snapshot.transactions) {
    if (!transaction.clientId) {
      await stamp('transactions', transaction.id);
    }
  }

  for (const category of snapshot.categories) {
    // Default categories are shared between all users and are already keyed by
    // their fixed ids locally.
    if (!category.clientId && !category.isDefault) {
      await stamp('categories', category.id);
    }
  }

  for (const source of snapshot.paymentSources) {
    if (!source.clientId) {
      await stamp('payment_sources', source.id);
    }
  }

  return adopted;
}

/**
 * Full two-way sync for the signed-in user:
 *
 *  1. adopt cloud rows that were created outside this app
 *  2. replay local deletes (tombstones)
 *  3. pull the cloud snapshot and merge it (last write wins, locally pending rows kept)
 *  4. push the rows that are still dirty — upserts so edits propagate
 *  5. mark the rows that landed as synced
 *
 * Pulling before pushing matters: a device that just signed in already has its
 * own seeded categories and payment sources, and merging first lets the push
 * recognise them as existing rows instead of creating duplicates.
 *
 * Safe to run repeatedly: every step is idempotent and the merge never
 * resurrects a row that has a pending tombstone.
 */
export async function syncLocalDataToCloud(options: SyncOptions = {}): Promise<SyncOutcome> {
  if (!isCloudConfigured) {
    throw new CloudNotConfiguredError();
  }
  await requireUserId();

  const before = await fetchCloudSnapshot();
  await adoptCloudRows(before);

  const { applied, failures: deleteFailures } = await pushDeletions(
    useExpenseStore.getState().deletions,
  );
  if (applied.length > 0) {
    useExpenseStore.getState().clearDeletions(applied);
  }

  // Re-read after the deletes so the merge cannot resurrect them.
  const cloud = await fetchCloudSnapshot();
  useExpenseStore.getState().mergeCloudSnapshot(cloud);

  // Only rows that changed since the last sync need to travel; anything the
  // merge marked `synced` is already identical in the cloud.
  const snapshot = useExpenseStore.getState().getGuestSnapshot({ pendingOnly: true });
  const report = await migrateGuestData(snapshot, { onProgress: options.onProgress });

  const failedTransactionIds = new Set(report.transactions.failed.map((failure) => failure.localId));
  const syncedTransactionIds = snapshot.transactions
    .map((transaction) => transaction.id)
    .filter((id) => !failedTransactionIds.has(id));

  // Budget failures are keyed by category, so only mark them when the stage is clean.
  const syncedBudgetIds =
    report.budgets.failed.length === 0 ? snapshot.budgets.map((budget) => budget.id) : [];

  const failedSourceIds = new Set(report.paymentSources.failed.map((failure) => failure.localId));
  const syncedSourceIds = snapshot.paymentSources
    .map((source) => source.id)
    .filter((id) => !failedSourceIds.has(id));

  useExpenseStore.getState().markSynced({
    transactions: syncedTransactionIds,
    paymentSources: syncedSourceIds,
    budgets: syncedBudgetIds,
  });

  return {
    report,
    ...sumStages(report),
    deleted: applied.length,
    deleteFailures,
    pulled: {
      categories: cloud.categories.length,
      paymentSources: cloud.paymentSources.length,
      transactions: cloud.transactions.length,
      budgets: cloud.budgets.length,
    },
  };
}
