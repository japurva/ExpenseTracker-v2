export type TransactionType = 'income' | 'expense' | 'transfer';
export type CategoryType = 'income' | 'expense';

/**
 * What kind of thing a payment came from. The user keeps as many sources as they
 * like — two banks, three cards, a wallet — each with its own name.
 */
export type PaymentSourceKind =
  | 'cash'
  | 'bank'
  | 'credit_card'
  | 'debit_card'
  | 'wallet'
  | 'upi'
  | 'other';

export interface PaymentSource {
  id: string;
  name: string;
  kind: PaymentSourceKind;
  /** Last 4 digits of the card/account, to tell two cards of the same bank apart. */
  last4: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentSourceDraft {
  name: string;
  kind: PaymentSourceKind;
  last4?: string | null;
}

/** Local rows are `pending` until a cloud migration marks them `synced`. */
export type SyncStatus = 'pending' | 'synced';

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  amount: number;
  type: TransactionType;
  categoryId: string | null;
  /** ISO timestamp. */
  date: string;
  description: string | null;
  /** Which bank/card/wallet the money came from; null when not recorded. */
  paymentSourceId: string | null;
  /** Denormalised kind of `paymentSourceId`, so legacy rows keep their mode. */
  paymentMethod: PaymentSourceKind | null;
  receiptUri: string | null;
  isOcrParsed: boolean;
  rawOcrText: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface Budget {
  id: string;
  categoryId: string;
  monthlyLimit: number;
  /** First day of the budgeted month, `YYYY-MM-01`. */
  monthYear: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface CategoryDraft {
  name: string;
  type: CategoryType;
  icon?: string | null;
  color?: string | null;
}

export interface TransactionDraft {
  amount: number;
  type: TransactionType;
  categoryId?: string | null;
  date?: string;
  description?: string | null;
  paymentSourceId?: string | null;
  paymentMethod?: PaymentSourceKind | null;
  receiptUri?: string | null;
  isOcrParsed?: boolean;
  rawOcrText?: string | null;
}

export interface BudgetDraft {
  categoryId: string;
  monthlyLimit: number;
  /** `YYYY-MM` or `YYYY-MM-DD`; normalised to the first of the month. */
  monthYear: string;
}

/**
 * A local delete that still has to be replayed to the cloud. The store keeps
 * these because Postgres rows outlive the local copy until the delete lands.
 */
export type PendingDeletion =
  | { entity: 'transaction'; localId: string; deletedAt: string }
  | { entity: 'category'; localId: string; deletedAt: string }
  | { entity: 'paymentSource'; localId: string; deletedAt: string }
  | { entity: 'budget'; categoryId: string; monthYear: string; deletedAt: string };

export function deletionKey(deletion: PendingDeletion): string {
  return deletion.entity === 'budget'
    ? `budget::${deletion.categoryId}::${deletion.monthYear}`
    : `${deletion.entity}::${deletion.localId}`;
}
