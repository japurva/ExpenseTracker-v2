import type { CategoryType, PaymentSourceKind, TransactionType } from '@/types/models';

/**
 * Cloud rows reduced to the fields the app cares about.
 *
 * Invariant: the client sends its local id as the row `id`, so `id` and
 * `clientId` normally match. `clientId` is still consulted first because rows
 * created before that rule existed only match by it.
 */
export interface CloudCategory {
  id: string;
  name: string;
  type: CategoryType;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  clientId: string | null;
}

export interface CloudTransaction {
  id: string;
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
}

export interface CloudPaymentSource {
  id: string;
  name: string;
  kind: PaymentSourceKind;
  last4: string | null;
  clientId: string | null;
}

export interface CloudBudget {
  id: string;
  categoryId: string;
  monthlyLimit: number;
  monthYear: string;
}

export interface CloudSnapshot {
  categories: CloudCategory[];
  paymentSources: CloudPaymentSource[];
  transactions: CloudTransaction[];
  budgets: CloudBudget[];
}
