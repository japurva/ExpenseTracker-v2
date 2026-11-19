import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_PAYMENT_SOURCES } from '@/constants/payment-options';
import { toMonthStart } from '@/lib/dates';
import { createId } from '@/lib/ids';
import { storage } from '@/lib/storage';
import {
  mergeBudgets,
  mergeCategories,
  mergePaymentSources,
  mergeTransactions,
} from '@/services/cloudMerge';
import type { GuestDataSnapshot } from '@/services/guestMigrationService';
import type {
  Budget,
  BudgetDraft,
  Category,
  CategoryDraft,
  PaymentSource,
  PaymentSourceDraft,
  PendingDeletion,
  Transaction,
  TransactionDraft,
} from '@/types/models';
import { deletionKey } from '@/types/models';
import type { CloudSnapshot } from '@/types/sync';

const STORE_NAME = 'expense-tracker';
const STORE_VERSION = 1;

/**
 * Mirrors the server-side default categories (same ids), so a guest category is
 * matched to the shared cloud default during migration instead of duplicated.
 */
const DEFAULT_CATEGORY_SEEDS = [
  { id: '00000000-0000-4000-8000-000000000001', name: 'Food', type: 'expense', icon: 'utensils', color: '#F97316' },
  { id: '00000000-0000-4000-8000-000000000002', name: 'Rent', type: 'expense', icon: 'home', color: '#6366F1' },
  { id: '00000000-0000-4000-8000-000000000003', name: 'Bills', type: 'expense', icon: 'receipt', color: '#F59E0B' },
  { id: '00000000-0000-4000-8000-000000000004', name: 'Shopping', type: 'expense', icon: 'shopping-bag', color: '#EC4899' },
  { id: '00000000-0000-4000-8000-000000000005', name: 'Transport', type: 'expense', icon: 'car', color: '#3B82F6' },
  { id: '00000000-0000-4000-8000-000000000006', name: 'Salary', type: 'income', icon: 'wallet', color: '#10B981' },
] as const;

export function createDefaultCategories(now = new Date().toISOString()): Category[] {
  return DEFAULT_CATEGORY_SEEDS.map((seed) => ({
    ...seed,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  }));
}

export function createDefaultPaymentSources(now = new Date().toISOString()): PaymentSource[] {
  return DEFAULT_PAYMENT_SOURCES.map((seed) => ({
    id: createId(),
    name: seed.name,
    kind: seed.kind,
    last4: null,
    createdAt: now,
    updatedAt: now,
  }));
}

export interface ExpenseState {
  transactions: Transaction[];
  categories: Category[];
  /** Banks, cards, wallets and cash the user pays from. */
  paymentSources: PaymentSource[];
  budgets: Budget[];
  /** Deletes waiting to be replayed to the cloud. */
  deletions: PendingDeletion[];

  addTransaction: (draft: TransactionDraft) => Transaction;
  updateTransaction: (id: string, patch: Partial<TransactionDraft>) => Transaction | null;
  deleteTransaction: (id: string) => boolean;

  addCategory: (draft: CategoryDraft) => Category;
  updateCategory: (id: string, patch: Partial<CategoryDraft>) => Category | null;
  deleteCategory: (id: string) => boolean;

  addPaymentSource: (draft: PaymentSourceDraft) => PaymentSource;
  updatePaymentSource: (id: string, patch: Partial<PaymentSourceDraft>) => PaymentSource | null;
  deletePaymentSource: (id: string) => boolean;

  setBudget: (draft: BudgetDraft) => Budget;
  deleteBudget: (id: string) => boolean;

  /** Flags uploaded rows so the UI can show "pending sync" accurately. */
  markSynced: (ids: {
    transactions?: string[];
    categories?: string[];
    paymentSources?: string[];
    budgets?: string[];
  }) => void;
  /** Drops tombstones that were successfully replayed to the cloud. */
  clearDeletions: (applied: PendingDeletion[]) => void;
  /** Folds cloud rows into the local store (see services/cloudMerge). */
  mergeCloudSnapshot: (snapshot: CloudSnapshot) => void;
  /** Payload for `migrateGuestData()`; see services/guestMigrationService. */
  getGuestSnapshot: (options?: { pendingOnly?: boolean }) => GuestDataSnapshot;
  resetAll: () => void;
}

type PersistedExpenseState = Pick<
  ExpenseState,
  'transactions' | 'categories' | 'paymentSources' | 'budgets' | 'deletions'
>;

function assertPositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive number.`);
  }
  return value;
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Keeps the denormalised `paymentMethod` in step with the chosen source. */
function paymentFromSource(
  sources: readonly PaymentSource[],
  paymentSourceId: string | null,
  fallback: Transaction['paymentMethod'] = null,
): { paymentSourceId: string | null; paymentMethod: Transaction['paymentMethod'] } {
  if (!paymentSourceId) {
    return { paymentSourceId: null, paymentMethod: fallback };
  }
  const source = sources.find((item) => item.id === paymentSourceId);
  if (!source) {
    throw new RangeError('That payment source no longer exists.');
  }
  return { paymentSourceId, paymentMethod: source.kind };
}

export const useExpenseStore = create<ExpenseState>()(
  persist(
    (set, get) => ({
      transactions: [],
      categories: createDefaultCategories(),
      paymentSources: createDefaultPaymentSources(),
      budgets: [],
      deletions: [],

      addTransaction: (draft) => {
        const now = new Date().toISOString();
        const payment = paymentFromSource(
          get().paymentSources,
          draft.paymentSourceId ?? null,
          draft.paymentMethod ?? null,
        );
        const transaction: Transaction = {
          id: createId(),
          amount: assertPositive(draft.amount, 'Amount'),
          type: draft.type,
          categoryId: draft.categoryId ?? null,
          date: draft.date ?? now,
          description: draft.description?.trim() || null,
          paymentSourceId: payment.paymentSourceId,
          paymentMethod: payment.paymentMethod,
          receiptUri: draft.receiptUri ?? null,
          isOcrParsed: draft.isOcrParsed ?? false,
          rawOcrText: draft.rawOcrText ?? null,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending',
        };

        set((state) => ({ transactions: [transaction, ...state.transactions] }));
        return transaction;
      },

      updateTransaction: (id, patch) => {
        const current = get().transactions.find((transaction) => transaction.id === id);
        if (!current) {
          return null;
        }

        // Touching the source re-derives the kind; leaving it alone keeps both.
        const payment =
          patch.paymentSourceId === undefined
            ? { paymentSourceId: current.paymentSourceId, paymentMethod: current.paymentMethod }
            : paymentFromSource(get().paymentSources, patch.paymentSourceId, patch.paymentMethod ?? null);

        const updated: Transaction = {
          ...current,
          ...patch,
          amount: patch.amount === undefined ? current.amount : assertPositive(patch.amount, 'Amount'),
          description:
            patch.description === undefined ? current.description : patch.description?.trim() || null,
          paymentSourceId: payment.paymentSourceId,
          paymentMethod: payment.paymentMethod,
          updatedAt: new Date().toISOString(),
          // A local edit makes the row dirty again.
          syncStatus: 'pending',
        };

        set((state) => ({
          transactions: state.transactions.map((transaction) =>
            transaction.id === id ? updated : transaction,
          ),
        }));
        return updated;
      },

      deleteTransaction: (id) => {
        const exists = get().transactions.some((transaction) => transaction.id === id);
        if (exists) {
          set((state) => ({
            transactions: state.transactions.filter((transaction) => transaction.id !== id),
            deletions: [
              ...state.deletions,
              { entity: 'transaction', localId: id, deletedAt: new Date().toISOString() },
            ],
          }));
        }
        return exists;
      },

      addCategory: (draft) => {
        const name = normalizeName(draft.name);
        if (!name) {
          throw new RangeError('Category name is required.');
        }

        const duplicate = get().categories.some(
          (category) =>
            category.type === draft.type && category.name.toLowerCase() === name.toLowerCase(),
        );
        if (duplicate) {
          throw new RangeError(`A ${draft.type} category named "${name}" already exists.`);
        }

        const now = new Date().toISOString();
        const category: Category = {
          id: createId(),
          name,
          type: draft.type,
          icon: draft.icon ?? null,
          color: draft.color ?? null,
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({ categories: [...state.categories, category] }));
        return category;
      },

      updateCategory: (id, patch) => {
        const current = get().categories.find((category) => category.id === id);
        if (!current) {
          return null;
        }

        const updated: Category = {
          ...current,
          ...patch,
          name: patch.name === undefined ? current.name : normalizeName(patch.name) || current.name,
          updatedAt: new Date().toISOString(),
        };

        set((state) => ({
          categories: state.categories.map((category) => (category.id === id ? updated : category)),
        }));
        return updated;
      },

      deleteCategory: (id) => {
        const current = get().categories.find((category) => category.id === id);
        if (!current) {
          return false;
        }
        if (current.isDefault) {
          throw new RangeError('Default categories cannot be deleted.');
        }

        set((state) => ({
          categories: state.categories.filter((category) => category.id !== id),
          // Keep the history, drop the dangling reference.
          transactions: state.transactions.map((transaction) =>
            transaction.categoryId === id
              ? {
                  ...transaction,
                  categoryId: null,
                  updatedAt: new Date().toISOString(),
                  syncStatus: 'pending',
                }
              : transaction,
          ),
          budgets: state.budgets.filter((budget) => budget.categoryId !== id),
          deletions: [
            ...state.deletions,
            { entity: 'category', localId: id, deletedAt: new Date().toISOString() },
          ],
        }));
        return true;
      },

      addPaymentSource: (draft) => {
        const name = normalizeName(draft.name);
        if (!name) {
          throw new RangeError('Payment source name is required.');
        }
        const duplicate = get().paymentSources.some(
          (source) => source.name.toLowerCase() === name.toLowerCase(),
        );
        if (duplicate) {
          throw new RangeError(`A payment source named "${name}" already exists.`);
        }

        const now = new Date().toISOString();
        const source: PaymentSource = {
          id: createId(),
          name,
          kind: draft.kind,
          last4: draft.last4?.trim() || null,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({ paymentSources: [...state.paymentSources, source] }));
        return source;
      },

      updatePaymentSource: (id, patch) => {
        const current = get().paymentSources.find((source) => source.id === id);
        if (!current) {
          return null;
        }

        const name = patch.name === undefined ? current.name : normalizeName(patch.name) || current.name;
        const duplicate = get().paymentSources.some(
          (source) => source.id !== id && source.name.toLowerCase() === name.toLowerCase(),
        );
        if (duplicate) {
          throw new RangeError(`A payment source named "${name}" already exists.`);
        }

        const kind = patch.kind ?? current.kind;
        const updated: PaymentSource = {
          ...current,
          name,
          kind,
          last4: patch.last4 === undefined ? current.last4 : (patch.last4?.trim() || null),
          updatedAt: new Date().toISOString(),
        };

        set((state) => ({
          paymentSources: state.paymentSources.map((source) => (source.id === id ? updated : source)),
          // History stays readable: the cached kind follows the rename.
          transactions: state.transactions.map((transaction) =>
            transaction.paymentSourceId === id && transaction.paymentMethod !== kind
              ? { ...transaction, paymentMethod: kind, updatedAt: updated.updatedAt, syncStatus: 'pending' }
              : transaction,
          ),
        }));
        return updated;
      },

      deletePaymentSource: (id) => {
        const current = get().paymentSources.find((source) => source.id === id);
        if (!current) {
          return false;
        }

        set((state) => ({
          paymentSources: state.paymentSources.filter((source) => source.id !== id),
          // Keep the spend, drop the dangling reference but keep the mode.
          transactions: state.transactions.map((transaction) =>
            transaction.paymentSourceId === id
              ? {
                  ...transaction,
                  paymentSourceId: null,
                  updatedAt: new Date().toISOString(),
                  syncStatus: 'pending',
                }
              : transaction,
          ),
          deletions: [
            ...state.deletions,
            { entity: 'paymentSource', localId: id, deletedAt: new Date().toISOString() },
          ],
        }));
        return true;
      },

      setBudget: (draft) => {
        const monthYear = toMonthStart(draft.monthYear);
        if (!monthYear) {
          throw new RangeError(`Invalid budget month "${draft.monthYear}".`);
        }
        const monthlyLimit = assertPositive(draft.monthlyLimit, 'Monthly limit');
        if (!get().categories.some((category) => category.id === draft.categoryId)) {
          throw new RangeError('Budget category does not exist.');
        }

        const now = new Date().toISOString();
        const existing = get().budgets.find(
          (budget) => budget.categoryId === draft.categoryId && budget.monthYear === monthYear,
        );

        const budget: Budget = existing
          ? { ...existing, monthlyLimit, updatedAt: now, syncStatus: 'pending' }
          : {
              id: createId(),
              categoryId: draft.categoryId,
              monthlyLimit,
              monthYear,
              createdAt: now,
              updatedAt: now,
              syncStatus: 'pending',
            };

        set((state) => ({
          budgets: existing
            ? state.budgets.map((item) => (item.id === existing.id ? budget : item))
            : [...state.budgets, budget],
        }));
        return budget;
      },

      deleteBudget: (id) => {
        const budget = get().budgets.find((item) => item.id === id);
        if (!budget) {
          return false;
        }
        set((state) => ({
          budgets: state.budgets.filter((item) => item.id !== id),
          deletions: [
            ...state.deletions,
            {
              entity: 'budget',
              categoryId: budget.categoryId,
              monthYear: budget.monthYear,
              deletedAt: new Date().toISOString(),
            },
          ],
        }));
        return true;
      },

      clearDeletions: (applied) => {
        const appliedKeys = new Set(applied.map(deletionKey));
        set((state) => ({
          deletions: state.deletions.filter((deletion) => !appliedKeys.has(deletionKey(deletion))),
        }));
      },

      mergeCloudSnapshot: (snapshot) => {
        set((state) => {
          const categories = mergeCategories(state.categories, snapshot, state.deletions);
          const { sources: paymentSources, replacedIds } = mergePaymentSources(
            state.paymentSources,
            snapshot,
            state.deletions,
          );

          // Remote ids can differ from local ones for rows created before ids were
          // kept in sync; remap references before merging.
          const categoryIdMap = new Map<string, string>();
          for (const remote of snapshot.categories) {
            const localId = remote.clientId ?? remote.id;
            const match =
              categories.find((category) => category.id === localId) ??
              categories.find((category) => category.id === remote.id);
            if (match) {
              categoryIdMap.set(remote.id, match.id);
            }
          }

          const paymentSourceIdMap = new Map<string, string>(replacedIds);
          for (const remote of snapshot.paymentSources) {
            const localId = remote.clientId ?? remote.id;
            const match =
              paymentSources.find((source) => source.id === localId) ??
              paymentSources.find((source) => source.id === remote.id);
            if (match) {
              paymentSourceIdMap.set(remote.id, match.id);
            }
          }

          return {
            categories,
            paymentSources,
            transactions: mergeTransactions(
              state.transactions,
              snapshot,
              state.deletions,
              categoryIdMap,
              paymentSourceIdMap,
            ),
            budgets: mergeBudgets(state.budgets, snapshot, state.deletions, categoryIdMap),
          };
        });
      },

      markSynced: (ids) => {
        const transactionIds = new Set(ids.transactions ?? []);
        const categoryIds = new Set(ids.categories ?? []);
        const paymentSourceIds = new Set(ids.paymentSources ?? []);
        const budgetIds = new Set(ids.budgets ?? []);

        set((state) => ({
          transactions: state.transactions.map((transaction) =>
            transactionIds.has(transaction.id)
              ? { ...transaction, syncStatus: 'synced' }
              : transaction,
          ),
          categories: state.categories.map((category) =>
            categoryIds.has(category.id) ? { ...category } : category,
          ),
          paymentSources: state.paymentSources.map((source) =>
            paymentSourceIds.has(source.id) ? { ...source } : source,
          ),
          budgets: state.budgets.map((budget) =>
            budgetIds.has(budget.id) ? { ...budget, syncStatus: 'synced' } : budget,
          ),
        }));
      },

      getGuestSnapshot: (options) => {
        const { transactions, categories, paymentSources, budgets } = get();
        const pendingOnly = options?.pendingOnly ?? false;
        return {
          categories: categories.map((category) => ({
            id: category.id,
            name: category.name,
            type: category.type,
            icon: category.icon,
            color: category.color,
          })),
          paymentSources: paymentSources.map((source) => ({
            id: source.id,
            name: source.name,
            kind: source.kind,
            last4: source.last4,
          })),
          transactions: transactions
            .filter((transaction) => !pendingOnly || transaction.syncStatus !== 'synced')
            .map((transaction) => ({
              id: transaction.id,
              categoryId: transaction.categoryId,
              amount: transaction.amount,
              type: transaction.type,
              paymentSourceId: transaction.paymentSourceId,
              paymentMethod: transaction.paymentMethod,
              description: transaction.description,
              receiptUri: transaction.receiptUri,
              isOcrParsed: transaction.isOcrParsed,
              rawOcrText: transaction.rawOcrText,
              date: transaction.date,
            })),
          budgets: budgets
            .filter((budget) => !pendingOnly || budget.syncStatus !== 'synced')
            .map((budget) => ({
              id: budget.id,
              categoryId: budget.categoryId,
              monthlyLimit: budget.monthlyLimit,
              monthYear: budget.monthYear,
            })),
        };
      },

      resetAll: () => {
        set({
          transactions: [],
          categories: createDefaultCategories(),
          paymentSources: createDefaultPaymentSources(),
          budgets: [],
          deletions: [],
        });
      },
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      storage: createJSONStorage(() => storage),
      partialize: (state): PersistedExpenseState => ({
        transactions: state.transactions,
        categories: state.categories,
        paymentSources: state.paymentSources,
        budgets: state.budgets,
        deletions: state.deletions,
      }),
      merge: (persisted, current) => {
        const restored = persisted as PersistedExpenseState | undefined;
        return {
          ...current,
          // Rows stored before payment sources existed have no id at all.
          transactions: (restored?.transactions ?? []).map((transaction) => ({
            ...transaction,
            paymentSourceId: transaction.paymentSourceId ?? null,
            paymentMethod: transaction.paymentMethod ?? null,
          })),
          // First launch (or a wiped store) gets the default categories back.
          categories: restored?.categories?.length
            ? restored.categories
            : createDefaultCategories(),
          paymentSources: restored?.paymentSources?.length
            ? restored.paymentSources
            : createDefaultPaymentSources(),
          budgets: restored?.budgets ?? [],
          deletions: restored?.deletions ?? [],
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.warn('[expenseStore] failed to restore local data', error);
        }
      },
    },
  ),
);

/**
 * Gate the UI until persisted data is in memory.
 *
 * `useSyncExternalStore` is what makes this safe under SSR: the server snapshot is
 * always `false`, so the markup matches, and the client swaps to the real value
 * after hydration without a mismatch warning.
 */
export function useExpenseStoreHydrated(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => useExpenseStore.persist.onFinishHydration(onStoreChange),
    () => useExpenseStore.persist.hasHydrated(),
    () => false,
  );
}
