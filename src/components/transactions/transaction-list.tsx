import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { Text, View } from 'react-native';

import { MonthSectionHeader } from '@/components/transactions/month-section-header';
import { TransactionRow } from '@/components/transactions/transaction-row';
import { YearSectionHeader } from '@/components/transactions/year-section-header';
import {
  groupTransactionsByYearAndMonth,
} from '@/lib/dates';
import type { Category, PaymentSource, Transaction } from '@/types/models';

interface TransactionListProps {
  transactions: Transaction[];
  categories: Category[];
  paymentSources?: PaymentSource[];
  header?: ReactElement | null;
  emptyTitle?: string;
  emptyMessage?: string;
  bottomPadding?: number;
  /** When true, renders transactions grouped by year → month with collapsible sections. */
  grouped?: boolean;
  /** Tapping a row opens the edit sheet when provided. */
  onPressTransaction?: (transaction: Transaction) => void;
}

type ListItem =
  | { __type: 'year'; year: string }
  | { __type: 'month'; year: string; month: string }
  | { __type: 'transaction'; transaction: Transaction };

export function TransactionList({
  transactions,
  categories,
  paymentSources = [],
  header = null,
  emptyTitle = 'No transactions yet',
  emptyMessage = 'Tap “Add” to record your first income or expense.',
  bottomPadding = 120,
  grouped = false,
  onPressTransaction,
}: TransactionListProps) {
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const paymentSourceById = useMemo(
    () => new Map(paymentSources.map((source) => [source.id, source])),
    [paymentSources],
  );

  const [collapsedYears, setCollapsedYears] = useState<Set<string>>(new Set());
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());

  const yearGroups = useMemo(
    () => groupTransactionsByYearAndMonth(transactions),
    [transactions],
  );

  const toggleYear = useCallback((year: string) => {
    setCollapsedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }, []);

  const toggleMonth = useCallback((year: string, month: string) => {
    const key = `${year}-${month}`;
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const buildListItems = useCallback((): ListItem[] => {
    const items: ListItem[] = [];

    for (const yearGroup of yearGroups) {
      items.push({ __type: 'year', year: yearGroup.year });

      if (collapsedYears.has(yearGroup.year)) continue;

      for (const monthGroup of yearGroup.months) {
        items.push({ __type: 'month', year: yearGroup.year, month: monthGroup.month });

        if (collapsedMonths.has(`${yearGroup.year}-${monthGroup.month}`)) continue;

        for (const transaction of monthGroup.transactions) {
          items.push({ __type: 'transaction', transaction });
        }
      }
    }

    return items;
  }, [yearGroups, collapsedYears, collapsedMonths]);

  const listItems = useMemo((): ListItem[] => {
    if (!grouped) {
      return transactions.map((transaction) => ({
        __type: 'transaction' as const,
        transaction,
      }));
    }
    return buildListItems();
  }, [grouped, transactions, buildListItems]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ListItem>) => {
      switch (item.__type) {
        case 'year': {
          const yearGroup = yearGroups.find((yg) => yg.year === item.year);
          if (!yearGroup) return null;
          return (
            <YearSectionHeader
              year={yearGroup.year}
              isCollapsed={collapsedYears.has(yearGroup.year)}
              monthCount={yearGroup.monthCount}
              total={yearGroup.total}
              onPress={() => toggleYear(yearGroup.year)}
            />
          );
        }
        case 'month': {
          const yearGroup = yearGroups.find((yg) => yg.year === item.year);
          const monthGroup = yearGroup?.months.find((m) => m.month === item.month);
          if (!monthGroup) return null;
          return (
            <MonthSectionHeader
              month={monthGroup.month}
              label={monthGroup.label}
              total={monthGroup.total}
              transactionCount={monthGroup.transactions.length}
              isCollapsed={collapsedMonths.has(`${item.year}-${item.month}`)}
              onPress={() => toggleMonth(item.year, item.month)}
            />
          );
        }
        case 'transaction': {
          const transaction = item.transaction;
          return (
            <TransactionRow
              transaction={transaction}
              category={
                transaction.categoryId
                  ? (categoryById.get(transaction.categoryId) ?? null)
                  : null
              }
              paymentSource={
                transaction.paymentSourceId
                  ? (paymentSourceById.get(transaction.paymentSourceId) ?? null)
                  : null
              }
              onPress={onPressTransaction ? () => onPressTransaction(transaction) : undefined}
            />
          );
        }
      }
    },
    [
      yearGroups,
      collapsedYears,
      collapsedMonths,
      categoryById,
      paymentSourceById,
      onPressTransaction,
      toggleYear,
      toggleMonth,
    ],
  );

  const keyExtractor = useCallback((item: ListItem): string => {
    switch (item.__type) {
      case 'year':
        return `year::${item.year}`;
      case 'month':
        return `month::${item.year}-${item.month}`;
      case 'transaction':
        return `txn::${item.transaction.id}`;
    }
  }, []);

  const empty = (
    <View className="items-center rounded-2xl border border-dashed border-slate-800 px-6 py-10">
      <Text className="text-sm font-medium text-slate-300">{emptyTitle}</Text>
      <Text className="mt-1 text-center text-xs text-slate-500">{emptyMessage}</Text>
    </View>
  );

  return (
    <FlashList
      data={listItems}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ListHeaderComponent={header}
      ListEmptyComponent={transactions.length === 0 ? empty : null}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPadding }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    />
  );
}
