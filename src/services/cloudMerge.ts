import type { Budget, Category, PaymentSource, PendingDeletion, Transaction } from '@/types/models';
import { deletionKey } from '@/types/models';
import type { CloudSnapshot } from '@/types/sync';

/**
 * Merge rules
 * -----------
 * - A row the cloud deleted locally (pending tombstone) is never resurrected.
 * - A local row still marked `pending` wins over the cloud copy: it has edits
 *   that have not been uploaded yet, and the next push will send them.
 * - Otherwise the cloud row wins and is marked `synced`.
 * - Rows that only exist in the cloud are adopted locally, keyed by `clientId`
 *   (falling back to the remote id) so later pushes dedupe correctly.
 */
function tombstoneSet(deletions: readonly PendingDeletion[], entity: PendingDeletion['entity']) {
  return new Set(
    deletions
      .filter((deletion) => deletion.entity === entity)
      .map((deletion) => deletionKey(deletion)),
  );
}

function matchesCategory(deletion: Set<string>, id: string, clientId: string | null): boolean {
  return deletion.has(`category::${id}`) || (clientId ? deletion.has(`category::${clientId}`) : false);
}

function matchesLocalId(deletion: Set<string>, entity: string, id: string, clientId: string | null): boolean {
  return deletion.has(`${entity}::${id}`) || (clientId ? deletion.has(`${entity}::${clientId}`) : false);
}

export interface PaymentSourceMergeResult {
  sources: PaymentSource[];
  /** Local twin ids that were folded into a cloud row, for reference remapping. */
  replacedIds: Map<string, string>;
}

/**
 * A new device seeds its own "Cash"/"Credit Card" rows, while the account
 * already has those. The cloud row is adopted and the never-pushed local twin
 * is folded into it, so a fresh sign-in never duplicates the list.
 */
export function mergePaymentSources(
  local: readonly PaymentSource[],
  snapshot: CloudSnapshot,
  deletions: readonly PendingDeletion[],
): PaymentSourceMergeResult {
  const tombstones = tombstoneSet(deletions, 'paymentSource');
  const merged = new Map(local.map((source) => [source.id, source]));
  const replacedIds = new Map<string, string>();

  for (const remote of snapshot.paymentSources) {
    if (matchesLocalId(tombstones, 'paymentSource', remote.id, remote.clientId)) {
      continue;
    }

    const cloudId = remote.clientId ?? remote.id;
    const existing = merged.get(cloudId) ?? merged.get(remote.id);
    const twin = existing
      ? undefined
      : [...merged.values()].find(
          (source) => source.name.trim().toLowerCase() === remote.name.trim().toLowerCase(),
        );

    if (twin && twin.id !== cloudId) {
      merged.delete(twin.id);
      replacedIds.set(twin.id, cloudId);
    }

    merged.set(cloudId, {
      id: cloudId,
      name: remote.name,
      kind: remote.kind,
      last4: remote.last4,
      createdAt: existing?.createdAt ?? twin?.createdAt ?? new Date().toISOString(),
      updatedAt: existing?.updatedAt ?? twin?.updatedAt ?? new Date().toISOString(),
    });
  }

  return { sources: [...merged.values()], replacedIds };
}

export function mergeCategories(
  local: readonly Category[],
  snapshot: CloudSnapshot,
  deletions: readonly PendingDeletion[],
): Category[] {
  const tombstones = tombstoneSet(deletions, 'category');
  const merged = new Map(local.map((category) => [category.id, category]));

  for (const remote of snapshot.categories) {
    if (matchesCategory(tombstones, remote.id, remote.clientId)) {
      continue;
    }

    const localId = remote.clientId ?? remote.id;
    const existing = merged.get(localId) ?? merged.get(remote.id);

    const next: Category = {
      id: existing?.id ?? localId,
      name: remote.name,
      type: remote.type,
      icon: remote.icon,
      color: remote.color,
      isDefault: remote.isDefault,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: existing?.updatedAt ?? new Date().toISOString(),
    };

    merged.set(next.id, next);
  }

  return [...merged.values()];
}

export function mergeTransactions(
  local: readonly Transaction[],
  snapshot: CloudSnapshot,
  deletions: readonly PendingDeletion[],
  categoryIdMap: ReadonlyMap<string, string> = new Map(),
  paymentSourceIdMap: ReadonlyMap<string, string> = new Map(),
): Transaction[] {
  const tombstones = tombstoneSet(deletions, 'transaction');
  const merged = new Map(local.map((transaction) => [transaction.id, transaction]));

  for (const remote of snapshot.transactions) {
    const localId = remote.clientId ?? remote.id;
    if (tombstones.has(`transaction::${localId}`) || tombstones.has(`transaction::${remote.id}`)) {
      continue;
    }

    const existing = merged.get(localId) ?? merged.get(remote.id);
    if (existing?.syncStatus === 'pending') {
      continue;
    }

    merged.set(existing?.id ?? localId, {
      id: existing?.id ?? localId,
      amount: Number(remote.amount),
      type: remote.type,
      // Legacy rows can point at a server-side category id; remap to the local one.
      categoryId: remote.categoryId
        ? (categoryIdMap.get(remote.categoryId) ?? remote.categoryId)
        : null,
      date: remote.date,
      description: remote.description,
      paymentSourceId: remote.paymentSourceId
        ? (paymentSourceIdMap.get(remote.paymentSourceId) ?? remote.paymentSourceId)
        : null,
      paymentMethod: (remote.paymentMethod as Transaction['paymentMethod']) ?? null,
      receiptUri: remote.receiptUrl,
      isOcrParsed: remote.isOcrParsed,
      rawOcrText: remote.rawOcrText,
      createdAt: remote.createdAt,
      updatedAt: remote.updatedAt,
      syncStatus: 'synced',
    });
  }

  // A folded payment source (or a legacy category) can leave a local row — even
  // a pending one — pointing at an id that no longer exists.
  for (const [id, transaction] of merged) {
    const sourceId = transaction.paymentSourceId
      ? (paymentSourceIdMap.get(transaction.paymentSourceId) ?? transaction.paymentSourceId)
      : null;
    const category = transaction.categoryId
      ? (categoryIdMap.get(transaction.categoryId) ?? transaction.categoryId)
      : null;
    if (sourceId !== transaction.paymentSourceId || category !== transaction.categoryId) {
      merged.set(id, { ...transaction, paymentSourceId: sourceId, categoryId: category });
    }
  }

  return [...merged.values()];
}

export function mergeBudgets(
  local: readonly Budget[],
  snapshot: CloudSnapshot,
  deletions: readonly PendingDeletion[],
  categoryIdMap: ReadonlyMap<string, string> = new Map(),
): Budget[] {
  const tombstones = tombstoneSet(deletions, 'budget');
  const merged = new Map(local.map((budget) => [budget.id, budget]));
  const byNaturalKey = new Map(
    local.map((budget) => [`${budget.categoryId}::${budget.monthYear}`, budget]),
  );

  for (const remote of snapshot.budgets) {
    const categoryId = categoryIdMap.get(remote.categoryId) ?? remote.categoryId;
    const naturalKey = `${categoryId}::${remote.monthYear}`;
    if (tombstones.has(`budget::${naturalKey}`)) {
      continue;
    }

    const existing = merged.get(remote.id) ?? byNaturalKey.get(naturalKey);
    if (existing?.syncStatus === 'pending') {
      continue;
    }

    const next: Budget = {
      id: existing?.id ?? remote.id,
      categoryId,
      monthlyLimit: Number(remote.monthlyLimit),
      monthYear: remote.monthYear,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: existing?.updatedAt ?? new Date().toISOString(),
      syncStatus: 'synced',
    };

    merged.set(next.id, next);
    byNaturalKey.set(naturalKey, next);
  }

  return [...merged.values()];
}
