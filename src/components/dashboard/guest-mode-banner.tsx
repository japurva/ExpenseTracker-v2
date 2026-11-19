import { Text, View } from 'react-native';

import { useAuth } from '@/hooks/useAuth';

export function GuestModeBanner() {
  const auth = useAuth();

  if (auth.session) {
    return (
      <View
        accessibilityRole="summary"
        className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3"
      >
        <View className="flex-row items-center gap-2">
          <View className="h-2 w-2 rounded-full bg-emerald-400" />
          <Text className="text-sm font-semibold text-emerald-200">Cloud sync on</Text>
          <Text
            numberOfLines={1}
            className="ml-auto max-w-[55%] text-right text-[11px] font-medium text-emerald-300/70"
          >
            {auth.email}
          </Text>
        </View>
        <Text className="mt-1.5 text-xs leading-5 text-emerald-100/80">
          Records still work offline here. Run Sync now in Settings to push edits and pull changes
          from your other devices.
        </Text>
      </View>
    );
  }

  return (
    <View
      accessibilityRole="summary"
      className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3"
    >
      <View className="flex-row items-center gap-2">
        <View className="h-2 w-2 rounded-full bg-amber-400" />
        <Text className="text-sm font-semibold text-amber-200">Guest mode</Text>
        <Text className="ml-auto text-[11px] font-medium uppercase tracking-wide text-amber-300/70">
          Local only
        </Text>
      </View>
      <Text className="mt-1.5 text-xs leading-5 text-amber-100/80">
        Everything works offline on this device. Create an account later to sync your history.
      </Text>
    </View>
  );
}
