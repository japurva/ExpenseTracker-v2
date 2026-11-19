import { Text, View } from 'react-native';

import { formatCurrency } from '@/lib/format';
import type { MonthSummary } from '@/stores/selectors';

interface SummaryCardsProps {
  summary: MonthSummary;
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  const isPositive = summary.balance >= 0;

  return (
    <View className="gap-3">
      <View className="rounded-3xl border border-slate-800 bg-slate-900 px-5 py-5">
        <Text className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Balance this month
        </Text>
        <Text
          className={`mt-2 text-4xl font-semibold tracking-tight ${
            isPositive ? 'text-slate-50' : 'text-rose-400'
          }`}
        >
          {formatCurrency(summary.balance)}
        </Text>
        <Text className="mt-1 text-xs text-slate-500">
          {summary.count} {summary.count === 1 ? 'transaction' : 'transactions'} recorded
        </Text>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
          <Text className="text-[11px] font-medium uppercase tracking-wide text-emerald-300/80">
            Income
          </Text>
          <Text className="mt-1 text-xl font-semibold text-emerald-300">
            {formatCurrency(summary.income)}
          </Text>
        </View>

        <View className="flex-1 rounded-2xl border border-orange-500/20 bg-orange-500/10 px-4 py-3">
          <Text className="text-[11px] font-medium uppercase tracking-wide text-orange-300/80">
            Expenses
          </Text>
          <Text className="mt-1 text-xl font-semibold text-orange-300">
            {formatCurrency(summary.expense)}
          </Text>
        </View>
      </View>
    </View>
  );
}
