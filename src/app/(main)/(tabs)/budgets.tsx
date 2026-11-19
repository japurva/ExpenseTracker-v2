import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';

import { BudgetProgressRow } from '@/components/budgets/budget-progress-row';
import { SetBudgetModal } from '@/components/budgets/set-budget-modal';
import { monthKey } from '@/lib/dates';
import { formatCurrency } from '@/lib/format';
import { useExpenseStoreHydrated } from '@/stores/expenseStore';
import { useBudgetUsage } from '@/stores/selectors';
import { monthTitle, shiftMonth } from '@/utils/analytics';

export default function BudgetsScreen() {
  const insets = useSafeAreaInsets();
  const hydrated = useExpenseStoreHydrated();
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  const usages = useBudgetUsage(month);

  const totals = useMemo(
    () =>
      usages.reduce(
        (accumulator, usage) => ({
          limit: accumulator.limit + usage.budget.monthlyLimit,
          spent: accumulator.spent + usage.spent,
        }),
        { limit: 0, spent: 0 },
      ),
    [usages],
  );

  const openFor = (categoryId: string | null) => {
    setEditingCategoryId(categoryId);
    setModalOpen(true);
  };

  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-950">
        <ActivityIndicator color="#38bdf8" />
      </View>
    );
  }

  const ratio = totals.limit > 0 ? totals.spent / totals.limit : 0;
  const barColor = ratio >= 1 ? '#f43f5e' : ratio >= 0.8 ? '#f59e0b' : '#38bdf8';

  const header = (
    <View style={{ paddingTop: insets.top + 12 }} className="gap-4 pb-4">
      <View className="flex-row items-start">
        <View className="flex-1">
          <Text className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Budgets
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

      <View className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <View className="flex-row items-baseline">
          <Text className="text-sm font-medium text-slate-300">Total budgeted</Text>
          <Text className="ml-auto text-sm font-semibold tabular-nums text-slate-100">
            {formatCurrency(totals.spent)}
            <Text className="text-xs font-normal text-slate-500"> / {formatCurrency(totals.limit)}</Text>
          </Text>
        </View>
        <View className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
          <View
            className="h-full rounded-full"
            style={{ width: `${Math.min(ratio, 1) * 100}%`, backgroundColor: barColor }}
          />
        </View>
        <Text className="mt-1.5 text-[11px] text-slate-500">
          {usages.length === 0
            ? 'No budgets set for this month.'
            : `${Math.round(ratio * 100)}% of the month's budget used`}
        </Text>
      </View>

      <View className="flex-row items-baseline">
        <Text className="text-sm font-semibold text-slate-100">By category</Text>
        <Text className="ml-auto text-[11px] text-slate-500">{usages.length} active</Text>
      </View>
    </View>
  );

  const empty = (
    <View className="items-center rounded-2xl border border-dashed border-slate-800 px-6 py-10">
      <Text className="text-sm font-medium text-slate-300">No budgets yet</Text>
      <Text className="mt-1 text-center text-xs text-slate-500">
        Set a monthly limit per category. Bars turn amber at 80% and red at 100%.
      </Text>
    </View>
  );

  return (
    <View className="flex-1 bg-slate-950">
      <FlashList
        data={usages}
        keyExtractor={(item) => item.budget.id}
        renderItem={({ item }) => (
          <View className="pb-3">
            <BudgetProgressRow usage={item} onPress={() => openFor(item.budget.categoryId)} />
          </View>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      />

      <Pressable
        onPress={() => openFor(null)}
        accessibilityRole="button"
        accessibilityLabel="Set budget"
        className="absolute bottom-6 right-5 flex-row items-center gap-2 rounded-full bg-sky-500 px-5 py-3 active:bg-sky-400"
      >
        <Text className="text-lg font-semibold text-slate-950">+</Text>
        <Text className="text-sm font-semibold text-slate-950">Set budget</Text>
      </Pressable>

      <SetBudgetModal
        visible={isModalOpen}
        onClose={() => setModalOpen(false)}
        month={month}
        initialCategoryId={editingCategoryId}
      />
    </View>
  );
}
