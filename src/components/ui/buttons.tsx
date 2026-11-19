import { Pressable, Text } from 'react-native';

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

export function PrimaryButton({ label, onPress, disabled = false, accessibilityLabel }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      className={`items-center rounded-xl py-3 ${
        disabled ? 'bg-slate-700' : 'bg-sky-500 active:bg-sky-400'
      }`}
    >
      <Text className={`text-sm font-semibold ${disabled ? 'text-slate-400' : 'text-slate-950'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

interface DangerButtonProps extends ButtonProps {
  tone?: 'danger' | 'neutral';
}

export function DangerButton({
  label,
  onPress,
  disabled = false,
  accessibilityLabel,
  tone = 'danger',
}: DangerButtonProps) {
  const palette =
    tone === 'danger'
      ? 'border-rose-500/40 bg-rose-500/10'
      : 'border-slate-800 bg-slate-950/40';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      className={`items-center rounded-xl border py-3 ${palette} ${disabled ? 'opacity-50' : ''}`}
    >
      <Text className={`text-sm font-medium ${tone === 'danger' ? 'text-rose-300' : 'text-slate-300'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled = false, accessibilityLabel }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      className={`flex-1 items-center rounded-xl border border-slate-800 py-3 ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      <Text className="text-sm font-medium text-slate-300">{label}</Text>
    </Pressable>
  );
}
