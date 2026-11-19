import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PaymentSourceFormModal } from '@/components/payments/payment-source-form-modal';
import { PAYMENT_SOURCE_KINDS, paymentKindGlyph, paymentKindLabel } from '@/constants/payment-options';
import { useExpenseStore } from '@/stores/expenseStore';
import type { PaymentSource } from '@/types/models';

interface SourceRowProps {
  source: PaymentSource;
  usageCount: number;
  onPress: (source: PaymentSource) => void;
}

function SourceRow({ source, usageCount, onPress }: SourceRowProps) {
  return (
    <Pressable
      onPress={() => onPress(source)}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${source.name}`}
      className="flex-row items-center gap-3 border-b border-slate-800/60 py-3 active:opacity-80"
    >
      <View className="h-9 w-9 items-center justify-center rounded-full bg-slate-800">
        <Text className="text-sm">{paymentKindGlyph(source.kind)}</Text>
      </View>

      <View className="flex-1">
        <Text className="text-sm font-medium text-slate-100">
          {source.name}
          {source.last4 ? ` ••${source.last4}` : ''}
        </Text>
        <Text className="text-[11px] text-slate-500">
          {paymentKindLabel(source.kind)} · {usageCount}{' '}
          {usageCount === 1 ? 'transaction' : 'transactions'}
        </Text>
      </View>

      <Text className="text-xs text-slate-600">›</Text>
    </Pressable>
  );
}

export default function PaymentSourcesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const paymentSources = useExpenseStore((state) => state.paymentSources);
  const transactions = useExpenseStore((state) => state.transactions);

  const [isModalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentSource | null>(null);

  const usageById = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.paymentSourceId) {
      usageById.set(
        transaction.paymentSourceId,
        (usageById.get(transaction.paymentSourceId) ?? 0) + 1,
      );
    }
  }

  const openForm = (source: PaymentSource | null) => {
    setEditing(source);
    setModalOpen(true);
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/settings');
    }
  };

  return (
    <View className="flex-1 bg-slate-950" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center px-5 py-3">
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="h-9 w-9 items-center justify-center rounded-full border border-slate-800 bg-slate-900"
        >
          <Text className="text-base text-slate-300">‹</Text>
        </Pressable>

        <Text className="ml-3 text-xl font-semibold text-slate-50">Payment sources</Text>

        <Pressable
          onPress={() => openForm(null)}
          accessibilityRole="button"
          accessibilityLabel="New payment source"
          className="ml-auto rounded-full bg-sky-500 px-4 py-2 active:bg-sky-400"
        >
          <Text className="text-xs font-semibold text-slate-950">New</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mt-2">
          {paymentSources.length === 0 ? (
            <Text className="py-3 text-xs text-slate-600">
              No payment sources yet. Add the banks, cards and wallets you pay with.
            </Text>
          ) : (
            paymentSources.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                usageCount={usageById.get(source.id) ?? 0}
                onPress={openForm}
              />
            ))
          )}
        </View>

        <Text className="mt-6 text-[11px] leading-5 text-slate-500">
          Keep one entry per account, so “HDFC Savings” and “HDFC Credit Card” stay separate. Deleting a
          source keeps its transactions and their payment mode. Sources travel with your account once you
          sync.
        </Text>

        <View className="mt-4 flex-row flex-wrap gap-1.5">
          {PAYMENT_SOURCE_KINDS.map((option) => (
            <View
              key={option.value}
              className="flex-row items-center gap-1 rounded-full border border-slate-800 px-2.5 py-1"
            >
              <Text className="text-[10px]">{option.glyph}</Text>
              <Text className="text-[11px] text-slate-500">{option.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <PaymentSourceFormModal
        visible={isModalOpen}
        onClose={() => setModalOpen(false)}
        source={editing}
      />
    </View>
  );
}
