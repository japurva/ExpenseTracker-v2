import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { PAYMENT_SOURCE_KINDS, paymentKindGlyph } from '@/constants/payment-options';
import { useExpenseStore } from '@/stores/expenseStore';
import type { PaymentSourceKind } from '@/types/models';

interface PaymentSourcePickerProps {
  value: string | null;
  onChange: (paymentSourceId: string | null) => void;
}

/**
 * Chip list of the user's banks, cards and wallets, plus an inline "new source"
 * form so a second card can be added without leaving the transaction.
 */
export function PaymentSourcePicker({ value, onChange }: PaymentSourcePickerProps) {
  const paymentSources = useExpenseStore((state) => state.paymentSources);
  const addPaymentSource = useExpenseStore((state) => state.addPaymentSource);

  const [isAdding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PaymentSourceKind>('bank');
  const [last4, setLast4] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setAdding(false);
    setName('');
    setLast4('');
    setKind('bank');
    setError(null);
  };

  const handleCreate = () => {
    try {
      const source = addPaymentSource({ name, kind, last4 });
      onChange(source.id);
      reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the payment source.');
    }
  };

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          {paymentSources.map((source) => {
            const selected = value === source.id;
            return (
              <Pressable
                key={source.id}
                onPress={() => onChange(selected ? null : source.id)}
                accessibilityRole="button"
                accessibilityLabel={`Pay with ${source.name}`}
                accessibilityState={{ selected }}
                className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${
                  selected ? 'border-slate-500 bg-slate-800' : 'border-slate-800 bg-slate-950/40'
                }`}
              >
                <Text className="text-[11px]">{paymentKindGlyph(source.kind)}</Text>
                <Text
                  className={`text-xs ${selected ? 'font-semibold text-slate-100' : 'text-slate-400'}`}
                >
                  {source.name}
                  {source.last4 ? ` ••${source.last4}` : ''}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            onPress={() => {
              setAdding((current) => !current);
              setError(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Add a payment source"
            className="flex-row items-center gap-1 rounded-full border border-dashed border-slate-700 px-3 py-1.5"
          >
            <Text className="text-xs font-medium text-sky-300">{isAdding ? 'Cancel' : '+ New'}</Text>
          </Pressable>
        </View>
      </ScrollView>

      {isAdding ? (
        <View className="mt-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="HDFC Bank, ICICI Card…"
            placeholderTextColor="#475569"
            accessibilityLabel="Payment source name"
            autoFocus
            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />

          <View className="mt-2 flex-row flex-wrap gap-1.5">
            {PAYMENT_SOURCE_KINDS.map((option) => {
              const selected = kind === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setKind(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`flex-row items-center gap-1 rounded-full border px-2.5 py-1 ${
                    selected ? 'border-sky-400/60 bg-sky-500/15' : 'border-slate-800'
                  }`}
                >
                  <Text className="text-[10px]">{option.glyph}</Text>
                  <Text className={`text-[11px] ${selected ? 'text-sky-200' : 'text-slate-400'}`}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-2 flex-row items-center gap-2">
            <TextInput
              value={last4}
              onChangeText={(text) => setLast4(text.replace(/\D/g, '').slice(0, 4))}
              placeholder="1234"
              placeholderTextColor="#475569"
              keyboardType="number-pad"
              inputMode="numeric"
              accessibilityLabel="Last 4 digits"
              className="w-20 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
            <Pressable
              onPress={handleCreate}
              disabled={!name.trim()}
              accessibilityRole="button"
              accessibilityLabel="Save payment source"
              className={`ml-auto rounded-lg px-4 py-2 ${
                name.trim() ? 'bg-sky-500 active:bg-sky-400' : 'bg-slate-800'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  name.trim() ? 'text-slate-950' : 'text-slate-500'
                }`}
              >
                Save source
              </Text>
            </Pressable>
          </View>

          {error ? <Text className="mt-2 text-[11px] text-rose-400">{error}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}
