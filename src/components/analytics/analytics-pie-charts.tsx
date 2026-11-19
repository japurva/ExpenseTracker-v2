import { Text, View, useWindowDimensions } from 'react-native';
import { useMemo, useState } from 'react';

import { DateRangeSelector } from './date-range-selector';
import { ExpenseCategoryPie } from './expense-category-pie';
import { ExpensePaymentSourcePie } from './expense-payment-source-pie';
import { monthKey } from '@/lib/dates';
import { useExpenseStore } from '@/stores/expenseStore';
import {
  DateRange,
  groupExpensesByCategory,
  groupExpensesByPaymentSource,
} from '@/utils/analytics';

const TWO_COLUMN_MIN_WIDTH = 640;

interface AnalyticsPieChartsProps {
  height?: number;
}

export function AnalyticsPieCharts({ height = 240 }: AnalyticsPieChartsProps) {
  const { width: screenWidth } = useWindowDimensions();
  const isTwoColumn = screenWidth >= TWO_COLUMN_MIN_WIDTH;

  const transactions = useExpenseStore((state) => state.transactions);
  const categories = useExpenseStore((state) => state.categories);
  const paymentSources = useExpenseStore((state) => state.paymentSources);

  // `monthKey` is local time, matching the dashboard header and the chart filters.
  const [range, setRange] = useState<DateRange>(() => ({
    kind: 'month',
    value: monthKey(new Date()),
  }));

  const categoryResult = useMemo(
    () => groupExpensesByCategory(transactions, categories, range),
    [transactions, categories, range],
  );

  const paymentSourceResult = useMemo(
    () => groupExpensesByPaymentSource(transactions, paymentSources, range),
    [transactions, paymentSources, range],
  );

  const isEmpty =
    categoryResult.slices.length === 0 && paymentSourceResult.slices.length === 0;

  return (
    <View className="gap-4">
      <DateRangeSelector range={range} onRangeChange={setRange} />

      {isEmpty ? (
        <View className="items-center rounded-2xl border border-dashed border-slate-800 px-4 py-8">
          <Text className="text-xs text-slate-500 text-center">
            No expense data available for the selected range.
          </Text>
        </View>
      ) : (
        <View
          style={{
            flexDirection: isTwoColumn ? 'row' : 'column',
            gap: 16,
          }}
        >
          <View style={isTwoColumn ? { flex: 1, minWidth: 0 } : undefined}>
            <ExpenseCategoryPie
              slices={categoryResult.slices}
              total={categoryResult.total}
              height={height}
            />
          </View>
          <View style={isTwoColumn ? { flex: 1, minWidth: 0 } : undefined}>
            <ExpensePaymentSourcePie
              slices={paymentSourceResult.slices}
              total={paymentSourceResult.total}
              height={height}
            />
          </View>
        </View>
      )}
    </View>
  );
}