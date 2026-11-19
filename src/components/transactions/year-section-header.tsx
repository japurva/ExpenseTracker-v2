import { Pressable, Text, View } from 'react-native';

interface YearSectionHeaderProps {
  year: string;
  isCollapsed: boolean;
  onPress: () => void;
  monthCount: number;
  total: number;
}

export function YearSectionHeader({
  year,
  isCollapsed,
  onPress,
  monthCount,
  total,
}: YearSectionHeaderProps) {
  const chevron = isCollapsed ? '▶' : '▼';
  const amount = total >= 0 ? `+${total.toFixed(2)}` : total.toFixed(2);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Toggle ${year} (${monthCount} months)`}
      className="flex-row items-center justify-between px-4 py-3 bg-slate-950/50 border-b border-slate-800/40 active:bg-slate-900"
    >
      <View className="flex-row items-center gap-2">
        <Text className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {year}
        </Text>
        <Text className="text-[10px] text-slate-600">{chevron}</Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        <Text className="text-[10px] font-medium text-slate-500">
          {monthCount} {monthCount === 1 ? 'month' : 'months'}
        </Text>
        <Text className="text-[11px] font-semibold text-slate-300">
          {amount}
        </Text>
      </View>
    </Pressable>
  );
}
