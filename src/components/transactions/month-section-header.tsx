import { Pressable, Text, View } from 'react-native';

interface MonthSectionHeaderProps {
  month: string; // `YYYY-MM`
  label: string; // e.g. "October 2026"
  total: number;
  transactionCount: number;
  isCollapsed: boolean;
  onPress: () => void;
}

export function MonthSectionHeader({
  month,
  label,
  total,
  transactionCount,
  isCollapsed,
  onPress,
}: MonthSectionHeaderProps) {
  const chevron = isCollapsed ? '▶' : '▼';
  const amount = total >= 0 ? `+${total.toFixed(2)}` : total.toFixed(2);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Toggle ${label} (${transactionCount} transactions)`}
      className="flex-row items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800/40 active:bg-slate-900/50"
    >
      <View className="flex-row items-center gap-2">
        <Text className="text-sm font-medium text-slate-100">{label}</Text>
        <Text className="text-[10px] text-slate-600">{chevron}</Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        <Text className="text-[10px] font-medium text-slate-500">
          {transactionCount} {transactionCount === 1 ? 'txn' : 'txns'}
        </Text>
        <Text className="text-[11px] font-semibold text-slate-400">
          {amount}
        </Text>
      </View>
    </Pressable>
  );
}
