import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';
import { BarGroup, CartesianChart, useChartPressState } from 'victory-native';

import { formatCompactCurrency } from '@/lib/format';
import type { MonthlyPoint } from '@/utils/analytics';

export interface AnalyticsChartProps {
  data: MonthlyPoint[];
  height?: number;
}

const INCOME_COLOR = '#34d399';
const EXPENSE_COLOR = '#fb923c';

/**
 * Native chart: Victory Native XL on Skia. Press and drag across the bars to read
 * a month's values; the tooltip is rendered in RN so no Skia font is required.
 */
export function AnalyticsChart({ data, height = 200 }: AnalyticsChartProps) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const { state } = useChartPressState({ x: 0, y: { income: 0, expense: 0 } });

  const selectIndex = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  useAnimatedReaction(
    () => ({ active: state.isActive.value, index: state.matchedIndex.value }),
    (current, previous) => {
      if (current.active !== previous?.active || current.index !== previous?.index) {
        runOnJS(selectIndex)(current.active ? current.index : -1);
      }
    },
    [selectIndex],
  );

  const active = activeIndex >= 0 ? data[activeIndex] : undefined;

  return (
    <View className="gap-2">
      <View style={{ height }}>
        <CartesianChart
          data={data}
          xKey="index"
          yKeys={['income', 'expense']}
          domainPadding={{ left: 18, right: 18, top: 24 }}
          axisOptions={{
            font: null,
            lineColor: '#1e293b',
            tickCount: { x: 6, y: 4 },
          }}
          chartPressState={state}
        >
          {({ points, chartBounds }) => (
            <BarGroup
              chartBounds={chartBounds}
              betweenGroupPadding={0.34}
              withinGroupPadding={0.12}
              roundedCorners={{ topLeft: 6, topRight: 6 }}
            >
              <BarGroup.Bar points={points.income} color={INCOME_COLOR} />
              <BarGroup.Bar points={points.expense} color={EXPENSE_COLOR} />
            </BarGroup>
          )}
        </CartesianChart>

        {active ? (
          <View
            pointerEvents="none"
            className="absolute left-2 top-1 rounded-xl border border-slate-700 bg-slate-950/95 px-3 py-2"
          >
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {active.label}
            </Text>
            <Text className="mt-0.5 text-xs text-emerald-300">
              In {formatCompactCurrency(active.income)}
            </Text>
            <Text className="text-xs text-orange-300">
              Out {formatCompactCurrency(active.expense)}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="flex-row justify-between px-1">
        {data.map((point) => (
          <Text
            key={point.key}
            className={`text-[11px] ${
              active?.key === point.key ? 'font-semibold text-slate-200' : 'text-slate-500'
            }`}
          >
            {point.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
