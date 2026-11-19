import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { CategoryIcon } from '@/components/categories/category-icon';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { DangerButton, PrimaryButton } from '@/components/ui/buttons';
import { useExpenseStore } from '@/stores/expenseStore';
import { monthTitle } from '@/utils/analytics';

interface SetBudgetModalProps {
  visible: boolean;
  onClose: () => void;
  /** `YYYY-MM` */
  month: string;
  initialCategoryId?: string | null;
}

export function SetBudgetModal({
  visible,
  onClose,
  month,
  initialCategoryId = null,
}: SetBudgetModalProps) {
  const categories = useExpenseStore((state) => state.categories);
  const budgets = useExpenseStore((state) => state.budgets);
  const setBudget = useExpenseStore((state) => state.setBudget);
  const deleteBudget = useExpenseStore((state) => state.deleteBudget);

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.type === 'expense'),
    [categories],
  );

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const monthStart = `${month}-01`;
  const existing = useMemo(
    () => budgets.find((budget) => budget.categoryId === categoryId && budget.monthYear === monthStart) ?? null,
    [budgets, categoryId, monthStart],
  );

  useEffect(() => {
    if (!visible) {
      return;
    }
    const startId = initialCategoryId ?? expenseCategories[0]?.id ?? null;
    const budget = budgets.find((item) => item.categoryId === startId && item.monthYear === monthStart);
    setCategoryId(startId);
    setAmount(budget ? String(budget.monthlyLimit) : '');
    setError(null);
    // Apply once per open so a background budget update does not wipe typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialCategoryId]);

  const selectCategory = (id: string) => {
    setCategoryId(id);
    setError(null);
    const budget = budgets.find((item) => item.categoryId === id && item.monthYear === monthStart);
    setAmount(budget ? String(budget.monthlyLimit) : '');
  };

  const handleSave = () => {
    if (!categoryId) {
      setError('Pick a category first.');
      return;
    }
    const parsed = Number.parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a monthly limit greater than zero.');
      return;
    }

    try {
      setBudget({ categoryId, monthlyLimit: parsed, monthYear: month });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the budget.');
    }
  };

  const handleRemove = () => {
    if (!existing) {
      return;
    }
    deleteBudget(existing.id);
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Monthly budget"
      subtitle={monthTitle(month)}
      footer={
        <View className="flex-row gap-3">
          {existing ? (
            <View className="flex-1">
              <DangerButton label="Remove" onPress={handleRemove} />
            </View>
          ) : null}
          <View className="flex-1">
            <PrimaryButton label="Save budget" onPress={handleSave} />
          </View>
        </View>
      }
    >
      <Text className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Category
      </Text>
      {expenseCategories.length === 0 ? (
        <Text className="mt-1.5 text-xs text-slate-500">
          Create an expense category first — budgets attach to a category.
        </Text>
      ) : (
        <View className="mt-1.5 flex-row flex-wrap gap-2">
          {expenseCategories.map((category) => {
            const selected = categoryId === category.id;
            return (
              <Pressable
                key={category.id}
                onPress={() => selectCategory(category.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                className={`flex-row items-center gap-1.5 rounded-full border px-2.5 py-1.5 ${
                  selected ? 'border-slate-500 bg-slate-800' : 'border-slate-800 bg-slate-950/40'
                }`}
              >
                <CategoryIcon icon={category.icon} color={category.color} size={20} />
                <Text className={`text-xs ${selected ? 'font-semibold text-slate-100' : 'text-slate-400'}`}>
                  {category.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Text className="mt-4 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        Monthly limit
      </Text>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        placeholder="0.00"
        placeholderTextColor="#475569"
        keyboardType="decimal-pad"
        inputMode="decimal"
        accessibilityLabel="Monthly limit"
        className="mt-1.5 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-lg font-semibold text-slate-50"
      />

      {existing ? (
        <Text className="mt-2 text-[11px] text-slate-500">
          A budget already exists for this month — saving updates it.
        </Text>
      ) : null}

      {error ? <Text className="mt-3 text-xs text-rose-400">{error}</Text> : null}
    </BottomSheet>
  );
}
