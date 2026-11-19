import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Shared dark bottom sheet used by the management dialogs. */
export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: BottomSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/60">
        <Pressable
          className="flex-1"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`Dismiss ${title}`}
        />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View className="max-h-[88%] rounded-t-3xl border-t border-slate-800 bg-slate-900">
            <View className="items-center pt-2">
              <View className="h-1 w-10 rounded-full bg-slate-700" />
            </View>

            <View className="px-5 pt-3">
              <Text className="text-lg font-semibold text-slate-50">{title}</Text>
              {subtitle ? <Text className="mt-0.5 text-xs text-slate-500">{subtitle}</Text> : null}
            </View>

            <ScrollView
              className="px-5 pt-3"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              {children}
              {footer ? <View className="mt-5">{footer}</View> : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
