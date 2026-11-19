import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TransactionFormModal } from '@/components/transactions/transaction-form-modal';
import { TransactionList } from '@/components/transactions/transaction-list';
import { useExpenseStore, useExpenseStoreHydrated } from '@/stores/expenseStore';
import { sortByDateDesc } from '@/stores/selectors';
import type { Transaction } from '@/types/models';

export default function TransactionsScreen() {
  const insets = useSafeAreaInsets();
  const hydrated = useExpenseStoreHydrated();
  const transactions = useExpenseStore((state) => state.transactions);
  const categories = useExpenseStore((state) => state.categories);
  const paymentSources = useExpenseStore((state) => state.paymentSources);

  const [isFormOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const sorted = useMemo(() => sortByDateDesc(transactions), [transactions]);
  const openEdit = useCallback((transaction: Transaction) => {
    setEditing(transaction);
    setFormOpen(true);
  }, []);

  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-950">
        <ActivityIndicator color="#38bdf8" />
      </View>
    );
  }

  const header = (
    <View style={{ paddingTop: insets.top + 12 }} className="gap-1 pb-4">
      <Text className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        All activity
      </Text>
      <Text className="text-2xl font-semibold text-slate-50">
        {sorted.length} {sorted.length === 1 ? 'transaction' : 'transactions'}
      </Text>
      <Text className="text-xs text-slate-500">Stored on this device until you sign in.</Text>
    </View>
  );

  return (
    <View className="flex-1 bg-slate-950">
      <TransactionList
        transactions={sorted}
        categories={categories}
        paymentSources={paymentSources}
        header={header}
        emptyTitle="No transactions yet"
        emptyMessage="Everything you record stays on this device while you use guest mode."
        bottomPadding={40}
        grouped
        onPressTransaction={openEdit}
      />

      <TransactionFormModal
        visible={isFormOpen}
        onClose={() => setFormOpen(false)}
        transaction={editing}
      />
    </View>
  );
}
