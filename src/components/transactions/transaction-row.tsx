import { Pressable, Text, View } from 'react-native';

import { CategoryIcon } from '@/components/categories/category-icon';
import { formatCurrency, formatDayLabel } from '@/lib/format';
import type { Category, PaymentSource, Transaction } from '@/types/models';

interface TransactionRowProps {
  transaction: Transaction;
  category: Category | null;
  paymentSource?: PaymentSource | null;
  onPress?: () => void;
}

const AMOUNT_STYLES: Record<Transaction['type'], { sign: string; className: string }> = {
  income: { sign: '+', className: 'text-emerald-400' },
  expense: { sign: '−', className: 'text-slate-100' },
  transfer: { sign: '', className: 'text-sky-300' },
};

export function TransactionRow({
  transaction,
  category,
  paymentSource = null,
  onPress,
}: TransactionRowProps) {
  const amountStyle = AMOUNT_STYLES[transaction.type];
  const title = transaction.description?.trim() || category?.name || 'Transaction';
  const meta = [
    category?.name ?? 'Uncategorised',
    formatDayLabel(transaction.date),
    paymentSource?.name,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `Edit ${title}` : undefined}
      className="flex-row items-center gap-3 border-b border-slate-800/60 py-3 active:opacity-70"
    >
      <CategoryIcon icon={category?.icon} color={category?.color} size={36} />

      <View className="flex-1">
        <Text numberOfLines={1} className="text-sm font-medium text-slate-100">
          {title}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-[11px] text-slate-500">
          {meta}
        </Text>
      </View>

      <Text className={`text-sm font-semibold tabular-nums ${amountStyle.className}`}>
        {amountStyle.sign}
        {formatCurrency(transaction.amount)}
      </Text>
    </Pressable>
  );
}
