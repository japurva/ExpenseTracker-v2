import { Text, View } from 'react-native';
import { useMemo } from 'react';
import { Pie, PolarChart } from 'victory-native';

import { formatCurrency } from '@/lib/format';
import type { ExpenseSlice } from '@/utils/analytics';

interface ExpenseCategoryPieProps {
  slices: ExpenseSlice[];
  total: number;
  height?: number;
}

export function ExpenseCategoryPie({
  slices,
  total,
  height = 200,
}: ExpenseCategoryPieProps) {
  const chartData = useMemo(
    () => slices.map((s) => ({ label: s.label, value: s.value, color: s.color })),
    [slices],
  );

  // `PolarChart` measures its parent through `onLayout`, so that parent needs a
  // concrete size — a `flex-1` box inside the dashboard's list header measures 0.
  const chartSize = Math.max(140, Math.min(height, 240));
  const pieSize = chartSize - 16;

  if (slices.length === 0 || total <= 0) {
    return (
      <View className="items-center justify-center py-6">
        <Text className="text-xs text-slate-500 text-center">No expenses in this range</Text>
      </View>
    );
  }

  return (
    <View className="items-center">
      <Text className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-2">
        Expenses by Category
      </Text>
      <View style={{ width: chartSize, height: chartSize }}>
        <PolarChart
          data={chartData}
          labelKey="label"
          valueKey="value"
          colorKey="color"
          containerStyle={{ alignItems: 'center', justifyContent: 'center' }}
          canvasStyle={{ alignItems: 'center', justifyContent: 'center' }}
        >
          <Pie.Chart size={pieSize} innerRadius={Math.round(pieSize * 0.2)} />
        </PolarChart>
      </View>
      <View className="mt-2 flex-row flex-wrap justify-center gap-3 px-2">
        {slices.map((slice) => (
          <View key={slice.id} className="flex-row items-center gap-1.5">
            <View className="h-2 w-2 rounded-full" style={{ backgroundColor: slice.color }} />
            <Text className="text-[10px] font-medium text-slate-500">{slice.label}</Text>
            <Text className="text-[10px] font-medium text-slate-300">
              {formatCurrency(slice.value)} · {Math.round((slice.value / total) * 100)}%
            </Text>
          </View>
        ))}
      </View>
      <View className="mt-1">
        <Text className="text-[10px] font-semibold text-slate-400">
          Total: {formatCurrency(total)}
        </Text>
      </View>
    </View>
  );
}