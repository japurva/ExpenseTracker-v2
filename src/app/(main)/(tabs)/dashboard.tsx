import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnalyticsPieCharts } from '@/components/analytics/analytics-pie-charts';
import { AnalyticsChart } from '@/components/dashboard/analytics-chart';
import { GuestModeBanner } from '@/components/dashboard/guest-mode-banner';
import { SummaryCards } from '@/components/dashboard/summary-cards';
import { TransactionFormModal } from '@/components/transactions/transaction-form-modal';
import { TransactionList } from '@/components/transactions/transaction-list';
import { monthKey } from '@/lib/dates';
import { useExpenseStore, useExpenseStoreHydrated } from '@/stores/expenseStore';
import { useMonthSummary, useTransactionsForMonth } from '@/stores/selectors';
import type { Transaction } from '@/types/models';
import { buildMonthlySeries, monthTitle, shiftMonth } from '@/utils/analytics';

const RECENT_LIMIT = 12;

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      <Text className="text-[11px] text-slate-400">{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [isFormOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const hydrated = useExpenseStoreHydrated();
  const allTransactions = useExpenseStore((state) => state.transactions);
  const categories = useExpenseStore((state) => state.categories);
  const paymentSources = useExpenseStore((state) => state.paymentSources);

  const summary = useMonthSummary(month);
  const monthTransactions = useTransactionsForMonth(month);
  const recent = useMemo(() => monthTransactions.slice(0, RECENT_LIMIT), [monthTransactions]);
  const series = useMemo(
    () => buildMonthlySeries(allTransactions, month, 6),
    [allTransactions, month],
  );

  const openCreate = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((transaction: Transaction) => {
    setEditing(transaction);
    setFormOpen(true);
  }, []);

  // Server-rendered web markup has no storage access; wait for the client to
  // rehydrate instead of flashing a zeroed dashboard.
  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-950">
        <ActivityIndicator color="#38bdf8" />
      </View>
    );
  }

  const header = (
    <View style={{ paddingTop: insets.top + 12 }} className="gap-5 pb-4">
      <View className="flex-row items-start">
        <View className="flex-1">
          <Text className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Overview
          </Text>
          <Text className="mt-0.5 text-2xl font-semibold text-slate-50">{monthTitle(month)}</Text>
        </View>

        <View className="flex-row gap-2">
          <Pressable
            onPress={() => setMonth((current) => shiftMonth(current, -1))}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            className="h-9 w-9 items-center justify-center rounded-full border border-slate-800 bg-slate-900"
          >
            <Text className="text-base text-slate-300">‹</Text>
          </Pressable>
          <Pressable
            onPress={() => setMonth((current) => shiftMonth(current, 1))}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            className="h-9 w-9 items-center justify-center rounded-full border border-slate-800 bg-slate-900"
          >
            <Text className="text-base text-slate-300">›</Text>
          </Pressable>
        </View>
      </View>

      <GuestModeBanner />

      <SummaryCards summary={summary} />

      <View className="rounded-3xl border border-slate-800 bg-slate-900 p-4">
        <View className="mb-2 flex-row items-center">
          <Text className="text-sm font-semibold text-slate-100">Income vs expenses</Text>
          <Text className="ml-auto text-[11px] text-slate-500">Last 6 months</Text>
        </View>

        <AnalyticsChart data={series} />

        <View className="mt-3 flex-row gap-4">
          <Legend color="#34d399" label="Income" />
          <Legend color="#fb923c" label="Expenses" />
        </View>
      </View>

      <AnalyticsPieCharts height={300} />

      <View className="flex-row items-baseline">
        <Text className="text-sm font-semibold text-slate-100">Recent activity</Text>
        <Text className="ml-auto text-[11px] text-slate-500">
          {monthTransactions.length} {monthTransactions.length === 1 ? 'entry' : 'entries'}
        </Text>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-slate-950">
      <TransactionList
        transactions={recent}
        categories={categories}
        paymentSources={paymentSources}
        header={header}
        emptyTitle="Nothing recorded this month"
        emptyMessage="Add an income or expense, or scan a receipt to fill the form automatically."
        onPressTransaction={openEdit}
      />

      <Pressable
        onPress={openCreate}
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
        className="absolute bottom-6 right-5 flex-row items-center gap-2 rounded-full bg-sky-500 px-5 py-3 active:bg-sky-400"
      >
        <Text className="text-lg font-semibold text-slate-950">+</Text>
        <Text className="text-sm font-semibold text-slate-950">Add</Text>
      </Pressable>

      <TransactionFormModal
        visible={isFormOpen}
        onClose={() => setFormOpen(false)}
        transaction={editing}
      />
    </View>
  );
}
