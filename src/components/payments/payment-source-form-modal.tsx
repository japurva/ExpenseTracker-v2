import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { DangerButton, PrimaryButton } from '@/components/ui/buttons';
import { PAYMENT_SOURCE_KINDS, paymentKindGlyph } from '@/constants/payment-options';
import { useExpenseStore } from '@/stores/expenseStore';
import type { PaymentSource, PaymentSourceKind } from '@/types/models';

interface PaymentSourceFormModalProps {
  visible: boolean;
  onClose: () => void;
  /** Present when editing. */
  source?: PaymentSource | null;
}

export function PaymentSourceFormModal({
  visible,
  onClose,
  source = null,
}: PaymentSourceFormModalProps) {
  const addPaymentSource = useExpenseStore((state) => state.addPaymentSource);
  const updatePaymentSource = useExpenseStore((state) => state.updatePaymentSource);
  const deletePaymentSource = useExpenseStore((state) => state.deletePaymentSource);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<PaymentSourceKind>('bank');
  const [last4, setLast4] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isEditing = source !== null;

  useEffect(() => {
    if (!visible) {
      return;
    }
    setName(source?.name ?? '');
    setKind(source?.kind ?? 'bank');
    setLast4(source?.last4 ?? '');
    setError(null);
    setConfirmDelete(false);
  }, [visible, source]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the payment source a name.');
      return;
    }

    try {
      if (source) {
        updatePaymentSource(source.id, { name: trimmed, kind, last4 });
      } else {
        addPaymentSource({ name: trimmed, kind, last4 });
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the payment source.');
    }
  };

  const handleDelete = () => {
    if (!source) {
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      deletePaymentSource(source.id);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the payment source.');
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={isEditing ? 'Edit payment source' : 'New payment source'}
      subtitle="Add as many banks, cards and wallets as you use."
      footer={
        <View className="flex-row gap-3">
          {isEditing ? (
            <View className="flex-1">
              <DangerButton
                label={confirmDelete ? 'Tap again to delete' : 'Delete'}
                onPress={handleDelete}
              />
            </View>
          ) : null}
          <View className="flex-1">
            <PrimaryButton
              label={isEditing ? 'Save changes' : 'Create source'}
              onPress={handleSave}
              accessibilityLabel="Save payment source"
            />
          </View>
        </View>
      }
    >
      <View className="mb-2 flex-row items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-slate-800">
          <Text className="text-base">{paymentKindGlyph(kind)}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-sm font-medium text-slate-100">
            {name.trim() || 'Payment source preview'}
          </Text>
          <Text className="text-[11px] text-slate-500">
            {PAYMENT_SOURCE_KINDS.find((option) => option.value === kind)?.label}
            {last4 ? ` ••${last4}` : ''}
          </Text>
        </View>
      </View>

      <Text className="mt-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="HDFC Savings, Amex Platinum…"
        placeholderTextColor="#475569"
        accessibilityLabel="Payment source name"
        className="mt-1.5 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100"
      />

      <Text className="mt-4 text-[11px] font-medium uppercase tracking-wide text-slate-500">Kind</Text>
      <View className="mt-1.5 flex-row flex-wrap gap-2">
        {PAYMENT_SOURCE_KINDS.map((option) => {
          const selected = kind === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setKind(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${
                selected ? 'border-sky-400/60 bg-sky-500/15' : 'border-slate-800 bg-slate-950/40'
              }`}
            >
              <Text className="text-[11px]">{option.glyph}</Text>
              <Text className={`text-xs ${selected ? 'text-sky-200' : 'text-slate-400'}`}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text className="mt-4 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Last 4 digits (optional)
      </Text>
      <TextInput
        value={last4}
        onChangeText={(text) => setLast4(text.replace(/\D/g, '').slice(0, 4))}
        placeholder="1234"
        placeholderTextColor="#475569"
        keyboardType="number-pad"
        inputMode="numeric"
        accessibilityLabel="Last 4 digits"
        className="mt-1.5 w-24 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100"
      />

      {error ? <Text className="mt-3 text-xs text-rose-400">{error}</Text> : null}

      {confirmDelete ? (
        <Text className="mt-3 text-[11px] text-rose-300/80">
          Transactions keep their amount and payment mode; only the source link is removed.
        </Text>
      ) : null}
    </BottomSheet>
  );
}
