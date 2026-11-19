import { Pressable, Text, TextInput, View } from 'react-native';
import { useCallback, useMemo, useState } from 'react';

import { monthKey, yearKey } from '@/lib/dates';
import { isValidDayKey, monthTitle, shiftMonth } from '@/utils/analytics';
import type { DateRange } from '@/utils/analytics';

type Mode = DateRange['kind'];

const MODES: readonly { value: Mode; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'custom', label: 'Custom' },
];

interface DateRangeSelectorProps {
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
}

export function DateRangeSelector({ range, onRangeChange }: DateRangeSelectorProps) {
  const [mode, setMode] = useState<Mode>(range.kind);
  const [fromValue, setFromValue] = useState(range.kind === 'custom' ? range.from : '');
  const [toValue, setToValue] = useState(range.kind === 'custom' ? range.to : '');

  const canApplyCustom =
    isValidDayKey(fromValue) && isValidDayKey(toValue) && fromValue.trim() <= toValue.trim();

  const commitCustom = useCallback(() => {
    if (canApplyCustom) {
      onRangeChange({ kind: 'custom', from: fromValue.trim(), to: toValue.trim() });
    }
  }, [canApplyCustom, fromValue, toValue, onRangeChange]);

  const monthLabel = useMemo(
    () => (range.kind === 'month' ? monthTitle(range.value) : ''),
    [range],
  );

  const yearLabel = useMemo(() => (range.kind === 'year' ? range.value : ''), [range]);

  const shift = useCallback((delta: number) => {
    if (range.kind === 'month') {
      onRangeChange({ kind: 'month', value: shiftMonth(range.value, delta) });
    } else if (range.kind === 'year') {
      onRangeChange({ kind: 'year', value: String(Number(range.value) + delta) });
    }
  }, [range, onRangeChange]);

  const selectMode = useCallback((nextMode: Mode) => {
    setMode(nextMode);
    if (nextMode === 'month' && range.kind !== 'month') {
      onRangeChange({ kind: 'month', value: monthKey(new Date()) });
    } else if (nextMode === 'year' && range.kind !== 'year') {
      onRangeChange({ kind: 'year', value: yearKey(new Date()) });
    } else if (nextMode === 'custom' && range.kind !== 'custom' && canApplyCustom) {
      onRangeChange({ kind: 'custom', from: fromValue.trim(), to: toValue.trim() });
    }
  }, [range.kind, canApplyCustom, fromValue, toValue, onRangeChange]);

  return (
    <View className="gap-3">
      <View className="flex-row gap-1">
        {MODES.map((item) => {
          const isActive = mode === item.value;
          return (
            <Pressable
              key={item.value}
              onPress={() => selectMode(item.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              className={`flex-1 items-center justify-center rounded-lg border py-2 ${
                isActive ? 'border-sky-500 bg-sky-500' : 'border-slate-800/60 bg-slate-950/50'
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  isActive ? 'text-slate-950' : 'text-slate-400'
                }`}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Month/Year picker */}
      {(mode === 'month' || mode === 'year') && (
        <View className="flex-row items-center justify-between px-2">
          <Pressable
            onPress={() => shift(-1)}
            accessibilityRole="button"
            accessibilityLabel="Previous"
            className="h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900"
          >
            <Text className="text-base text-slate-300">‹</Text>
          </Pressable>
          <Text className="text-sm font-medium text-slate-100">
            {mode === 'month' ? monthLabel : yearLabel}
          </Text>
          <Pressable
            onPress={() => shift(1)}
            accessibilityRole="button"
            accessibilityLabel="Next"
            className="h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900"
          >
            <Text className="text-base text-slate-300">›</Text>
          </Pressable>
        </View>
      )}

      {/* Custom range inputs */}
      {mode === 'custom' && (
        <View className="gap-2 px-2">
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1">
              <Text className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                From
              </Text>
              <TextInput
                value={fromValue}
                onChangeText={setFromValue}
                onEndEditing={commitCustom}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                autoCorrect={false}
                className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </View>
            <View className="flex-1 gap-1">
              <Text className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                To
              </Text>
              <TextInput
                value={toValue}
                onChangeText={setToValue}
                onEndEditing={commitCustom}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                autoCorrect={false}
                className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
            </View>
            <Pressable
              onPress={commitCustom}
              disabled={!canApplyCustom}
              accessibilityRole="button"
              accessibilityLabel="Apply range"
              accessibilityState={{ disabled: !canApplyCustom }}
              className={`h-10 w-10 items-center justify-center self-end rounded-lg ${
                canApplyCustom ? 'bg-sky-500' : 'bg-slate-800'
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  canApplyCustom ? 'text-slate-950' : 'text-slate-500'
                }`}
              >
                ▶
              </Text>
            </Pressable>
          </View>
          <Text className="text-[10px] text-slate-500">
            Use YYYY-MM-DD. “From” must be on or before “To”.
          </Text>
        </View>
      )}
    </View>
  );
}