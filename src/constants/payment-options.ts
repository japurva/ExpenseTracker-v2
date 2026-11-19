import type { PaymentSourceKind } from '@/types/models';

export interface PaymentKindOption {
  value: PaymentSourceKind;
  label: string;
  glyph: string;
}

export const PAYMENT_SOURCE_KINDS: readonly PaymentKindOption[] = [
  { value: 'cash', label: 'Cash', glyph: '💵' },
  { value: 'bank', label: 'Bank', glyph: '🏦' },
  { value: 'credit_card', label: 'Credit card', glyph: '💳' },
  { value: 'debit_card', label: 'Debit card', glyph: '💳' },
  { value: 'wallet', label: 'Wallet', glyph: '👛' },
  { value: 'upi', label: 'UPI', glyph: '📲' },
  { value: 'other', label: 'Other', glyph: '🔖' },
];

export const PAYMENT_SOURCE_COLORS: Record<PaymentSourceKind, string> = {
  cash: '#F59E0B',
  bank: '#3B82F6',
  credit_card: '#EF4444',
  debit_card: '#10B981',
  wallet: '#8B5CF6',
  upi: '#06B6D4',
  other: '#94A3B8',
};

const KIND_BY_VALUE = new Map(PAYMENT_SOURCE_KINDS.map((kind) => [kind.value, kind]));

export function paymentKindLabel(kind: PaymentSourceKind | null | undefined): string {
  return (kind && KIND_BY_VALUE.get(kind)?.label) || 'Not recorded';
}

export function paymentKindGlyph(kind: PaymentSourceKind | null | undefined): string {
  return (kind && KIND_BY_VALUE.get(kind)?.glyph) || '🔖';
}

/**
 * Starting point for a new device. These are ordinary user rows — rename them,
 * add a second bank or a third card, delete the ones that do not apply.
 */
export const DEFAULT_PAYMENT_SOURCES: ReadonlyArray<{
  name: string;
  kind: PaymentSourceKind;
}> = [
  { name: 'Cash', kind: 'cash' },
  { name: 'Bank Account', kind: 'bank' },
  { name: 'Credit Card', kind: 'credit_card' },
];
