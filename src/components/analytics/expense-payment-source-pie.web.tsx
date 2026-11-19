import { Text, View } from 'react-native';
import { useMemo } from 'react';
import { Cell, Pie, PieChart } from 'recharts';

import { formatCurrency } from '@/lib/format';
import type { ExpenseSlice } from '@/utils/analytics';

interface ExpensePaymentSourcePieProps {
  slices: ExpenseSlice[];
  total: number;
  height?: number;
  onPressSlice?: (slice: ExpenseSlice) => void;
}

export function ExpensePaymentSourcePie({
  slices,
  total,
  height = 200,
}: ExpensePaymentSourcePieProps) {
  const chartData = useMemo(() => slices.map((s) => ({ ...s })), [slices]);

  const chartSize = Math.max(140, Math.min(height, 260));

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
        Expenses by Payment Source
      </Text>
      <PieChart width={chartSize} height={chartSize}>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius="52%"
          outerRadius="88%"
          stroke="#020617"
          strokeWidth={2}
          isAnimationActive={false}
        >
          {/* Recharts ignores `color` on the datum: each slice needs its own fill. */}
          {chartData.map((slice) => (
            <Cell key={slice.id} fill={slice.color} />
          ))}
        </Pie>
      </PieChart>
      <View className="mt-2 flex-row flex-wrap justify-center gap-3 px-2">
        {chartData.map((slice) => (
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