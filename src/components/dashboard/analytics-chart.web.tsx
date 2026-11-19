import { View } from 'react-native';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatCompactCurrency, formatCurrency } from '@/lib/format';
import type { MonthlyPoint } from '@/utils/analytics';

export interface AnalyticsChartProps {
  data: MonthlyPoint[];
  height?: number;
}

const INCOME_COLOR = '#34d399';
const EXPENSE_COLOR = '#fb923c';

/** Web chart: Recharts (DOM/SVG) with a hover tooltip. */
export function AnalyticsChart({ data, height = 200 }: AnalyticsChartProps) {
  return (
    <View style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 4, bottom: 0, left: -18 }} barGap={4}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={{ stroke: '#1e293b' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) => formatCompactCurrency(value)}
          />
          <Tooltip
            cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
            contentStyle={{
              backgroundColor: '#020617',
              border: '1px solid #1e293b',
              borderRadius: 12,
              fontSize: 12,
            }}
            labelStyle={{ color: '#e2e8f0' }}
            formatter={(value, name) => [
              formatCurrency(Number(value)),
              name === 'income' ? 'Income' : 'Expenses',
            ]}
          />
          <Bar dataKey="income" fill={INCOME_COLOR} radius={[6, 6, 0, 0]} maxBarSize={22} />
          <Bar dataKey="expense" fill={EXPENSE_COLOR} radius={[6, 6, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </View>
  );
}
