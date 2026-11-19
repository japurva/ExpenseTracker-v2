import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryFormModal } from '@/components/categories/category-form-modal';
import { CategoryIcon } from '@/components/categories/category-icon';
import { useExpenseStore } from '@/stores/expenseStore';
import type { Category } from '@/types/models';

interface CategoryRowProps {
  category: Category;
  onPress: (category: Category) => void;
}

function CategoryRow({ category, onPress }: CategoryRowProps) {
  return (
    <Pressable
      onPress={() => onPress(category)}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${category.name}`}
      className="flex-row items-center gap-3 border-b border-slate-800/60 py-3 active:opacity-80"
    >
      <CategoryIcon icon={category.icon} color={category.color} size={36} />

      <View className="flex-1">
        <Text className="text-sm font-medium text-slate-100">{category.name}</Text>
        <Text className="text-[11px] text-slate-500">
          {category.type === 'income' ? 'Income' : 'Expense'}
        </Text>
      </View>

      {category.isDefault ? (
        <View className="rounded-full border border-slate-700 px-2 py-0.5">
          <Text className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Default</Text>
        </View>
      ) : (
        <Text className="text-xs text-slate-600">›</Text>
      )}
    </Pressable>
  );
}

interface SectionProps {
  title: string;
  categories: Category[];
  onPress: (category: Category) => void;
}

function Section({ title, categories, onPress }: SectionProps) {
  return (
    <View className="mt-6">
      <Text className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{title}</Text>
      <View className="mt-1">
        {categories.length === 0 ? (
          <Text className="py-3 text-xs text-slate-600">None yet.</Text>
        ) : (
          categories.map((category) => (
            <CategoryRow key={category.id} category={category} onPress={onPress} />
          ))
        )}
      </View>
    </View>
  );
}

export default function CategoriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const categories = useExpenseStore((state) => state.categories);

  const [isModalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.type === 'expense'),
    [categories],
  );
  const incomeCategories = useMemo(
    () => categories.filter((category) => category.type === 'income'),
    [categories],
  );

  const openForm = (category: Category | null) => {
    setEditing(category);
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

        <Text className="ml-3 text-xl font-semibold text-slate-50">Categories</Text>

        <Pressable
          onPress={() => openForm(null)}
          accessibilityRole="button"
          accessibilityLabel="New category"
          className="ml-auto rounded-full bg-sky-500 px-4 py-2 active:bg-sky-400"
        >
          <Text className="text-xs font-semibold text-slate-950">New</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Section title="Expense" categories={expenseCategories} onPress={openForm} />
        <Section title="Income" categories={incomeCategories} onPress={openForm} />

        <Text className="mt-6 text-[11px] leading-5 text-slate-500">
          Default categories are shared with the cloud and stay read-only. Custom categories and their
          colours travel with your account once you sync.
        </Text>
      </ScrollView>

      <CategoryFormModal
        visible={isModalOpen}
        onClose={() => setModalOpen(false)}
        category={editing}
      />
    </View>
  );
}
