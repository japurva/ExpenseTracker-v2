import { Pressable, Text, View } from 'react-native';

import { CategoryIcon } from '@/components/categories/category-icon';
import { formatCurrency } from '@/lib/format';
import type { BudgetUsage } from '@/stores/selectors';

const STATUS_STYLES = {
  ok: { bar: '#38bdf8', text: 'text-sky-300', label: 'On track' },
  warning: { bar: '#f59e0b', text: 'text-amber-300', label: 'Near limit' },
  danger: { bar: '#f43f5e', text: 'text-rose-300', label: 'Over budget' },
} as const;

interface BudgetProgressRowProps {
  usage: BudgetUsage;
  onPress: () => void;
}

export function BudgetProgressRow({ usage, onPress }: BudgetProgressRowProps) {
  const { budget, category, spent, remaining, ratio, status } = usage;
  const palette = STATUS_STYLES[status];
  const percent = Math.min(ratio, 1) * 100;
  const over = Math.max(spent - budget.monthlyLimit, 0);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit budget for ${category?.name ?? 'category'}`}
      className="rounded-2xl border border-slate-800 bg-slate-900 p-4 active:border-slate-700"
    >
      <View className="flex-row items-center gap-3">
        <CategoryIcon icon={category?.icon} color={category?.color} size={32} />

        <View className="flex-1">
          <Text className="text-sm font-medium text-slate-100">
            {category?.name ?? 'Unknown category'}
          </Text>
          <Text className={`text-[11px] ${palette.text}`}>
            {status === 'danger'
              ? `${palette.label} · ${formatCurrency(over)} over`
              : `${palette.label} · ${formatCurrency(remaining)} left`}
          </Text>
        </View>

        <Text className="text-sm font-semibold tabular-nums text-slate-200">
          {formatCurrency(spent)}
          <Text className="text-xs font-normal text-slate-500"> / {formatCurrency(budget.monthlyLimit)}</Text>
        </Text>
      </View>

      <View className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
        <View
          className="h-full rounded-full"
          style={{ width: `${percent}%`, backgroundColor: palette.bar }}
        />
        {/* Threshold markers: warning at 80%, danger at 100%. */}
        <View
          pointerEvents="none"
          className="absolute inset-y-0 w-px bg-slate-600/80"
          style={{ left: '80%' }}
        />
      </View>

      <View className="mt-1.5 flex-row justify-between">
        <Text className="text-[10px] text-slate-500">{Math.round(ratio * 100)}% used</Text>
        <Text className="text-[10px] text-slate-500">80% warn · 100% limit</Text>
      </View>
    </Pressable>
  );
}
