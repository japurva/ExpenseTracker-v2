import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { CategoryIcon } from '@/components/categories/category-icon';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { DangerButton, PrimaryButton } from '@/components/ui/buttons';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/constants/category-options';
import { useExpenseStore } from '@/stores/expenseStore';
import type { Category, CategoryType } from '@/types/models';

interface CategoryFormModalProps {
  visible: boolean;
  onClose: () => void;
  /** Present when editing; the defaults are read-only. */
  category?: Category | null;
}

const TYPE_OPTIONS: ReadonlyArray<{ value: CategoryType; label: string }> = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

export function CategoryFormModal({ visible, onClose, category = null }: CategoryFormModalProps) {
  const addCategory = useExpenseStore((state) => state.addCategory);
  const updateCategory = useExpenseStore((state) => state.updateCategory);
  const deleteCategory = useExpenseStore((state) => state.deleteCategory);

  const [name, setName] = useState('');
  const [type, setType] = useState<CategoryType>('expense');
  const [color, setColor] = useState(CATEGORY_COLORS[0].value);
  const [icon, setIcon] = useState<string>(CATEGORY_ICONS[0].name);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isEditing = category !== null;
  const isReadOnly = category?.isDefault ?? false;

  useEffect(() => {
    if (!visible) {
      return;
    }
    setName(category?.name ?? '');
    setType(category?.type ?? 'expense');
    setColor(category?.color ?? CATEGORY_COLORS[0].value);
    setIcon(category?.icon ?? CATEGORY_ICONS[0].name);
    setError(null);
    setConfirmDelete(false);
  }, [visible, category]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the category a name.');
      return;
    }

    try {
      if (category) {
        updateCategory(category.id, { name: trimmed, type, color, icon });
      } else {
        addCategory({ name: trimmed, type, color, icon });
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the category.');
    }
  };

  const handleDelete = () => {
    if (!category) {
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      deleteCategory(category.id);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the category.');
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={isEditing ? 'Edit category' : 'New category'}
      subtitle={isReadOnly ? 'Default categories are shared and read-only.' : undefined}
      footer={
        isReadOnly ? (
          <PrimaryButton label="Close" onPress={onClose} />
        ) : (
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
              <PrimaryButton label={isEditing ? 'Save changes' : 'Create category'} onPress={handleSave} />
            </View>
          </View>
        )
      }
    >
      <View className="mb-2 flex-row items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
        <CategoryIcon icon={icon} color={color} size={40} />
        <View className="flex-1">
          <Text className="text-sm font-medium text-slate-100">{name.trim() || 'Category preview'}</Text>
          <Text className="text-[11px] text-slate-500">{type === 'income' ? 'Income' : 'Expense'}</Text>
        </View>
      </View>

      <Text className="mt-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Groceries"
        placeholderTextColor="#475569"
        editable={!isReadOnly}
        accessibilityLabel="Category name"
        className="mt-1.5 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100"
      />

      <Text className="mt-4 text-[11px] font-medium uppercase tracking-wide text-slate-500">Type</Text>
      <View className="mt-1.5 flex-row gap-2">
        {TYPE_OPTIONS.map((option) => {
          const selected = type === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => !isReadOnly && setType(option.value)}
              disabled={isReadOnly}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`flex-1 items-center rounded-xl border px-3 py-2 ${
                selected ? 'border-sky-400/60 bg-sky-500/15' : 'border-slate-800 bg-slate-950/40'
              }`}
            >
              <Text className={`text-xs font-semibold ${selected ? 'text-sky-200' : 'text-slate-400'}`}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text className="mt-4 text-[11px] font-medium uppercase tracking-wide text-slate-500">Colour</Text>
      <View className="mt-2 flex-row flex-wrap gap-2">
        {CATEGORY_COLORS.map((option) => {
          const selected = color === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => !isReadOnly && setColor(option.value)}
              disabled={isReadOnly}
              accessibilityRole="button"
              accessibilityLabel={option.name}
              accessibilityState={{ selected }}
              className={`h-8 w-8 items-center justify-center rounded-full border ${
                selected ? 'border-slate-200' : 'border-transparent'
              }`}
            >
              <View className="h-6 w-6 rounded-full" style={{ backgroundColor: option.value }} />
            </Pressable>
          );
        })}
      </View>

      <Text className="mt-4 text-[11px] font-medium uppercase tracking-wide text-slate-500">Icon</Text>
      <View className="mt-2 flex-row flex-wrap gap-2">
        {CATEGORY_ICONS.map((option) => {
          const selected = icon === option.name;
          return (
            <Pressable
              key={option.name}
              onPress={() => !isReadOnly && setIcon(option.name)}
              disabled={isReadOnly}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              className={`h-10 w-10 items-center justify-center rounded-xl border ${
                selected ? 'border-sky-400/60 bg-sky-500/15' : 'border-slate-800 bg-slate-950/40'
              }`}
            >
              <Text className="text-base">{option.glyph}</Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <Text className="mt-3 text-xs text-rose-400">{error}</Text> : null}
    </BottomSheet>
  );
}
