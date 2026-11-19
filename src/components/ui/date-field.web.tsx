import { View } from 'react-native';

export interface DateFieldProps {
  /** `YYYY-MM-DD` */
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

/**
 * Web date field: a real `<input type="date">`, so the browser's calendar
 * popup is used (the native picker has no web implementation).
 */
export function DateField({ value, onChange, label = 'Date' }: DateFieldProps) {
  return (
    <View className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5">
      <input
        type="date"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={{
          width: '100%',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: '#f1f5f9',
          fontSize: 14,
          fontFamily: 'inherit',
          colorScheme: 'dark',
        }}
      />
    </View>
  );
}
