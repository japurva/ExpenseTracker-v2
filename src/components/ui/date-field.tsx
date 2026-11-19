import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { dayKey } from '@/lib/dates';
import { MONTHS_SHORT } from '@/lib/format';

export interface DateFieldProps {
  /** `YYYY-MM-DD` */
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

function toDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return new Date();
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

function formatLabel(value: string): string {
  const date = toDate(value);
  return `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/**
 * Native date field: tapping it opens the platform calendar (inline on iOS,
 * calendar dialog on Android).
 */
export function DateField({ value, onChange, label = 'Date' }: DateFieldProps) {
  const [isOpen, setOpen] = useState(false);

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== 'ios') {
      setOpen(false);
    }
    if (event.type === 'set' && selected) {
      onChange(dayKey(selected));
    }
  };

  return (
    <View>
      <Pressable
        onPress={() => setOpen((current) => !current)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: value }}
        className={`flex-row items-center justify-between rounded-xl border px-4 py-3 ${
          isOpen ? 'border-sky-500/50 bg-slate-900' : 'border-slate-800 bg-slate-950'
        }`}
      >
        <Text className="text-sm text-slate-100">{formatLabel(value)}</Text>
        <Text className="text-base">{isOpen ? '▴' : '📅'}</Text>
      </Pressable>

      {isOpen ? (
        <View className="mt-2 rounded-xl border border-slate-800 bg-slate-950 p-1">
          <DateTimePicker
            value={toDate(value)}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
            themeVariant="dark"
            onChange={handleChange}
          />
          {Platform.OS === 'ios' ? (
            <Pressable
              onPress={() => setOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close calendar"
              className="items-center rounded-lg border border-slate-800 py-2"
            >
              <Text className="text-xs font-medium text-slate-300">Done</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
