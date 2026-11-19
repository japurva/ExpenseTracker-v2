import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { PaymentSourcePicker } from '@/components/payments/payment-source-picker';
import { DangerButton, PrimaryButton, SecondaryButton } from '@/components/ui/buttons';
import { DateField } from '@/components/ui/date-field';
import { useReceiptOCR } from '@/hooks/useReceiptOCR';
import { dayKey } from '@/lib/dates';
import { useExpenseStore } from '@/stores/expenseStore';
import type { Transaction, TransactionDraft, TransactionType } from '@/types/models';
import type { ParsedReceipt } from '@/utils/receiptParser';

export interface TransactionFormModalProps {
  visible: boolean;
  onClose: () => void;
  /** When set the sheet edits an existing row; otherwise it creates one. */
  transaction?: Transaction | null;
  /** Pre-populate a new transaction (e.g. from a deep link). */
  initialValues?: Partial<TransactionDraft> | null;
  /** Result already produced elsewhere (e.g. a full-screen scanner). */
  ocrResult?: ParsedReceipt | null;
}

const TYPE_OPTIONS: ReadonlyArray<{ value: TransactionType; label: string }> = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];

function parseDateInput(value: string): string | null {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return null;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  if (Number.isNaN(date.getTime()) || dayKey(date) !== trimmed) {
    return null;
  }
  return date.toISOString();
}

function trimToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function TransactionFormModal({
  visible,
  onClose,
  transaction = null,
  initialValues = null,
  ocrResult = null,
}: TransactionFormModalProps) {
  const categories = useExpenseStore((state) => state.categories);
  const addTransaction = useExpenseStore((state) => state.addTransaction);
  const updateTransaction = useExpenseStore((state) => state.updateTransaction);
  const deleteTransaction = useExpenseStore((state) => state.deleteTransaction);

  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [paymentSourceId, setPaymentSourceId] = useState<string | null>(null);
  const [date, setDate] = useState(() => dayKey(new Date()));
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fromScan, setFromScan] = useState(false);
  const [scanWarnings, setScanWarnings] = useState<string[]>([]);
  const [rawOcrText, setRawOcrText] = useState<string | null>(null);
  const [originalOcr, setOriginalOcr] = useState<{ isOcrParsed: boolean; rawOcrText: string | null }>({
    isOcrParsed: false,
    rawOcrText: null,
  });

  const ocr = useReceiptOCR();

  const isEditing = transaction !== null;
  const availableCategories = useMemo(
    () => categories.filter((category) => category.type === type),
    [categories, type],
  );

  const applyParsedReceipt = useCallback(
    (parsed: ParsedReceipt) => {
      setFromScan(true);
      setScanWarnings(parsed.warnings);
      setRawOcrText(parsed.rawText);

      if (parsed.amount !== null) {
        setAmount(String(parsed.amount));
      }
      if (parsed.date) {
        setDate(parsed.date);
      }
      setDescription((current) => (current.trim() ? current : (parsed.merchant ?? '')));

      if (parsed.suggestedCategory) {
        const suggested = parsed.suggestedCategory.toLowerCase();
        const match = categories.find((category) => category.name.toLowerCase() === suggested);
        if (match) {
          // The suggestion wins over the toggle: "Salary" implies income.
          setType(match.type);
          setCategoryId(match.id);
        }
      }
    },
    [categories],
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    setType(transaction?.type ?? initialValues?.type ?? 'expense');
    setAmount(
      transaction
        ? String(transaction.amount)
        : initialValues?.amount != null
          ? String(initialValues.amount)
          : '',
    );
    setCategoryId(transaction?.categoryId ?? initialValues?.categoryId ?? null);
    setPaymentSourceId(transaction?.paymentSourceId ?? initialValues?.paymentSourceId ?? null);
    setDate(
      transaction
        ? dayKey(transaction.date)
        : initialValues?.date
          ? dayKey(initialValues.date)
          : dayKey(new Date()),
    );
    setDescription(transaction?.description ?? initialValues?.description ?? '');
    setOriginalOcr({
      isOcrParsed: transaction?.isOcrParsed ?? false,
      rawOcrText: transaction?.rawOcrText ?? null,
    });
    setError(null);
    setConfirmDelete(false);
    setFromScan(false);
    setScanWarnings([]);
    setRawOcrText(null);
    // Re-run only when the sheet opens or targets a different row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, transaction?.id, initialValues]);

  // A receipt that arrives while the sheet is open fills the empty-looking form.
  useEffect(() => {
    if (visible && ocrResult) {
      applyParsedReceipt(ocrResult);
    }
  }, [visible, ocrResult, applyParsedReceipt]);

  const handleTypeChange = (next: TransactionType) => {
    setType(next);
    if (categoryId) {
      const current = categories.find((category) => category.id === categoryId);
      if (current && current.type !== next) {
        setCategoryId(null);
      }
    }
  };

  const handleScan = async () => {
    setError(null);
    const parsed = await ocr.pickFromLibrary();
    if (parsed) {
      applyParsedReceipt(parsed);
    }
  };

  const handleSave = () => {
    const value = Number.parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }

    const isoDate = parseDateInput(date);
    if (!isoDate) {
      setError('Enter a valid date as YYYY-MM-DD.');
      return;
    }

    const draft: TransactionDraft = {
      amount: value,
      type,
      categoryId: type === 'transfer' ? null : categoryId,
      paymentSourceId,
      date: isoDate,
      description: trimToNull(description),
      isOcrParsed: fromScan ? true : originalOcr.isOcrParsed,
      rawOcrText: fromScan ? rawOcrText : originalOcr.rawOcrText,
    };

    try {
      if (transaction) {
        updateTransaction(transaction.id, draft);
      } else {
        addTransaction(draft);
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the transaction.');
    }
  };

  const handleDelete = () => {
    if (!transaction) {
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteTransaction(transaction.id);
    onClose();
  };

  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000));
  const canSave = amount.trim().length > 0 && !ocr.isBusy;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/60">
        <Pressable
          className="flex-1"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss transaction form"
        />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View className="max-h-[88%] rounded-t-3xl border-t border-slate-800 bg-slate-900">
            <View className="items-center pt-2">
              <View className="h-1 w-10 rounded-full bg-slate-700" />
            </View>

            <ScrollView
              className="px-5 pt-3"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              <View className="flex-row items-center">
                <Text className="text-lg font-semibold text-slate-50">
                  {isEditing ? 'Edit transaction' : 'New transaction'}
                </Text>
                <Pressable
                  onPress={handleScan}
                  disabled={ocr.isBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Scan a receipt"
                  className={`ml-auto flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${
                    ocr.isBusy ? 'border-slate-700 bg-slate-800' : 'border-sky-500/40 bg-sky-500/10'
                  }`}
                >
                  {ocr.isBusy ? (
                    <ActivityIndicator size="small" color="#7dd3fc" />
                  ) : (
                    <Text className="text-xs">📷</Text>
                  )}
                  <Text className="text-xs font-medium text-sky-300">
                    {ocr.isBusy ? 'Scanning' : 'Scan receipt'}
                  </Text>
                </Pressable>
              </View>

              {fromScan ? (
                <View className="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2">
                  <Text className="text-[11px] font-medium text-sky-200">
                    Filled from receipt — check the details before saving.
                  </Text>
                  {scanWarnings.length > 0 ? (
                    <Text className="mt-1 text-[11px] text-sky-200/70">{scanWarnings.join(' ')}</Text>
                  ) : null}
                </View>
              ) : null}

              {ocr.error ? <Text className="mt-2 text-xs text-rose-400">{ocr.error}</Text> : null}

              {/* Type */}
              <Text className="mt-4 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Type
              </Text>
              <View className="mt-1.5 flex-row gap-2">
                {TYPE_OPTIONS.map((option) => {
                  const selected = type === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => handleTypeChange(option.value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      className={`flex-1 items-center rounded-xl border px-3 py-2 ${
                        selected
                          ? 'border-sky-400/60 bg-sky-500/15'
                          : 'border-slate-800 bg-slate-950/40'
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          selected ? 'text-sky-200' : 'text-slate-400'
                        }`}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Amount */}
              <Text className="mt-4 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Amount
              </Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor="#475569"
                keyboardType="decimal-pad"
                inputMode="decimal"
                accessibilityLabel="Amount"
                className="mt-1.5 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-lg font-semibold text-slate-50"
              />

              {/* Category */}
              <Text className="mt-4 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Category
              </Text>
              {type === 'transfer' ? (
                <Text className="mt-1.5 text-xs text-slate-500">
                  Transfers move money between accounts, so they have no category.
                </Text>
              ) : (
                <View className="mt-1.5 flex-row flex-wrap gap-2">
                  {availableCategories.map((category) => {
                    const selected = categoryId === category.id;
                    return (
                      <Pressable
                        key={category.id}
                        onPress={() => setCategoryId(selected ? null : category.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${
                          selected
                            ? 'border-slate-500 bg-slate-800'
                            : 'border-slate-800 bg-slate-950/40'
                        }`}
                      >
                        <View
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: category.color ?? '#64748b' }}
                        />
                        <Text
                          className={`text-xs ${
                            selected ? 'font-semibold text-slate-100' : 'text-slate-400'
                          }`}
                        >
                          {category.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {/* Payment source */}
              <Text className="mt-4 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Paid with
              </Text>
              <View className="mt-1.5">
                <PaymentSourcePicker value={paymentSourceId} onChange={setPaymentSourceId} />
              </View>

              {/* Date */}
              <Text className="mt-4 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Date
              </Text>
              <View className="mt-1.5">
                <DateField value={date} onChange={setDate} />
                <View className="mt-2 flex-row gap-2">
                  <Pressable
                    onPress={() => setDate(today)}
                    accessibilityRole="button"
                    className="rounded-lg border border-slate-800 px-3 py-1.5"
                  >
                    <Text className="text-[11px] text-slate-300">Today</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setDate(yesterday)}
                    accessibilityRole="button"
                    className="rounded-lg border border-slate-800 px-3 py-1.5"
                  >
                    <Text className="text-[11px] text-slate-300">Yesterday</Text>
                  </Pressable>
                </View>
              </View>

              {/* Description */}
              <Text className="mt-4 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Description
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Coffee with the team"
                placeholderTextColor="#475569"
                multiline
                accessibilityLabel="Description"
                className="mt-1.5 min-h-[64px] rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100"
              />

              {error ? <Text className="mt-3 text-xs text-rose-400">{error}</Text> : null}

              {confirmDelete ? (
                <Text className="mt-3 text-[11px] text-rose-300/80">
                  Deleting removes this transaction from this device. It cannot be undone.
                </Text>
              ) : null}

              <View className="mt-5 flex-row gap-3">
                {isEditing ? (
                  <View className="flex-1">
                    <DangerButton
                      label={confirmDelete ? 'Tap again to delete' : 'Delete'}
                      onPress={handleDelete}
                      accessibilityLabel="Delete transaction"
                    />
                  </View>
                ) : (
                  <View className="flex-1">
                    <SecondaryButton label="Cancel" onPress={onClose} />
                  </View>
                )}

                <View className="flex-1">
                  <PrimaryButton
                    label={isEditing ? 'Save changes' : 'Save'}
                    onPress={handleSave}
                    disabled={!canSave}
                    accessibilityLabel="Save transaction"
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
