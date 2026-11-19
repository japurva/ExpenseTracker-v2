import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DangerButton, PrimaryButton, SecondaryButton } from '@/components/ui/buttons';
import { useAuth } from '@/hooks/useAuth';
import { isPersistentStorageAvailable } from '@/lib/storage';
import { exportTransactionsToCsv } from '@/services/export/exportTransactions';
import { signOut } from '@/services/authService';
import { syncLocalDataToCloud } from '@/services/syncService';
import { useExpenseStore, useExpenseStoreHydrated } from '@/stores/expenseStore';

type Busy = 'idle' | 'syncing' | 'exporting' | 'signing-out';

interface Message {
  tone: 'ok' | 'error' | 'info';
  text: string;
}

const TONE_CLASS: Record<Message['tone'], string> = {
  ok: 'text-emerald-300',
  error: 'text-rose-400',
  info: 'text-slate-400',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mt-6">
      <Text className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {title}
      </Text>
      <View className="rounded-2xl border border-slate-800 bg-slate-900 p-4">{children}</View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline py-1">
      <Text className="text-xs text-slate-400">{label}</Text>
      <Text className="ml-auto text-xs font-medium text-slate-200">{value}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const hydrated = useExpenseStoreHydrated();

  const transactions = useExpenseStore((state) => state.transactions);
  const budgets = useExpenseStore((state) => state.budgets);
  const categories = useExpenseStore((state) => state.categories);
  const paymentSources = useExpenseStore((state) => state.paymentSources);
  const resetAll = useExpenseStore((state) => state.resetAll);

  const [busy, setBusy] = useState<Busy>('idle');
  const [message, setMessage] = useState<Message | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const pendingCount = transactions.filter((transaction) => transaction.syncStatus === 'pending').length;
  const customCategories = categories.filter((category) => !category.isDefault).length;
  const isBusy = busy !== 'idle';

  const handleSync = async () => {
    setBusy('syncing');
    setMessage(null);
    try {
      const outcome = await syncLocalDataToCloud();
      const parts = [
        `Uploaded ${outcome.uploaded}`,
        `pulled ${outcome.pulled.transactions} transactions`,
      ];
      if (outcome.deleted > 0) {
        parts.push(`deleted ${outcome.deleted}`);
      }
      if (outcome.failed + outcome.deleteFailures > 0) {
        parts.push(`failed ${outcome.failed + outcome.deleteFailures}`);
      }
      setMessage({
        tone: outcome.failed + outcome.deleteFailures > 0 ? 'error' : 'ok',
        text: `${parts.join(' · ')}.`,
      });
    } catch (cause) {
      setMessage({
        tone: 'error',
        text: cause instanceof Error ? cause.message : 'Cloud sync failed.',
      });
    } finally {
      setBusy('idle');
    }
  };

  const handleExport = async () => {
    setBusy('exporting');
    setMessage(null);
    try {
      const result = await exportTransactionsToCsv(transactions, categories, paymentSources);
      setMessage({
        tone: 'ok',
        text: result.shared
          ? 'CSV export ready — choose where to save it.'
          : `CSV written to ${result.uri}`,
      });
    } catch (cause) {
      setMessage({
        tone: 'error',
        text: cause instanceof Error ? cause.message : 'CSV export failed.',
      });
    } finally {
      setBusy('idle');
    }
  };

  const handleSignOut = async () => {
    setBusy('signing-out');
    setMessage(null);
    try {
      await signOut();
      setMessage({ tone: 'ok', text: 'Signed out. Local data stays on this device.' });
    } catch (cause) {
      setMessage({
        tone: 'error',
        text: cause instanceof Error ? cause.message : 'Could not sign out.',
      });
    } finally {
      setBusy('idle');
    }
  };

  const handleClearLocalData = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    resetAll();
    setConfirmClear(false);
    setMessage({ tone: 'ok', text: 'Local data cleared. Default categories restored.' });
  };

  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-950">
        <ActivityIndicator color="#38bdf8" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-950">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Settings</Text>
        <Text className="mt-0.5 text-2xl font-semibold text-slate-50">Account & data</Text>

        {message ? (
          <Text className={`mt-3 text-xs ${TONE_CLASS[message.tone]}`}>{message.text}</Text>
        ) : null}

        <Section title="Account">
          {!auth.isConfigured ? (
            <View className="gap-1">
              <Text className="text-sm font-medium text-amber-200">Cloud sync is not configured</Text>
              <Text className="text-xs leading-5 text-slate-400">
                Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart the app.
                Everything keeps working locally in the meantime.
              </Text>
            </View>
          ) : auth.isLoading ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#38bdf8" />
              <Text className="text-xs text-slate-400">Checking session…</Text>
            </View>
          ) : auth.session ? (
            <View className="gap-3">
              <View>
                <Text className="text-sm font-medium text-slate-100">{auth.email}</Text>
                <Text className="text-[11px] text-emerald-300">Signed in · cloud sync enabled</Text>
              </View>
              <PrimaryButton
                label={busy === 'syncing' ? 'Syncing…' : 'Sync now'}
                onPress={handleSync}
                disabled={isBusy}
                accessibilityLabel="Sync local data to the cloud"
              />
              <SecondaryButton
                label={busy === 'signing-out' ? 'Signing out…' : 'Sign out'}
                onPress={handleSignOut}
                disabled={isBusy}
              />
            </View>
          ) : (
            <View className="gap-3">
              <View>
                <Text className="text-sm font-medium text-slate-100">Guest mode</Text>
                <Text className="text-[11px] text-slate-400">
                  {pendingCount} {pendingCount === 1 ? 'record is' : 'records are'} waiting to sync.
                </Text>
              </View>
              <PrimaryButton
                label="Sign in"
                onPress={() => router.push('/auth')}
                disabled={isBusy}
              />
              <SecondaryButton
                label="Create account"
                onPress={() => router.push('/auth')}
                disabled={isBusy}
              />
            </View>
          )}
        </Section>

        <Section title="Library">
          <Pressable
            onPress={() => router.push('/categories')}
            accessibilityRole="button"
            accessibilityLabel="Manage categories"
            className="flex-row items-center active:opacity-80"
          >
            <View className="flex-1">
              <Text className="text-sm font-medium text-slate-100">Categories</Text>
              <Text className="text-[11px] text-slate-500">
                {customCategories} custom · {categories.length} total
              </Text>
            </View>
            <Text className="text-xs text-slate-600">›</Text>
          </Pressable>

          <View className="my-3 h-px bg-slate-800" />

          <Pressable
            onPress={() => router.push('/payment-sources')}
            accessibilityRole="button"
            accessibilityLabel="Manage payment sources"
            className="flex-row items-center active:opacity-80"
          >
            <View className="flex-1">
              <Text className="text-sm font-medium text-slate-100">Payment sources</Text>
              <Text className="text-[11px] text-slate-500">
                {paymentSources.length} {paymentSources.length === 1 ? 'account' : 'accounts'} · banks,
                cards, cash
              </Text>
            </View>
            <Text className="text-xs text-slate-600">›</Text>
          </Pressable>
        </Section>

        <Section title="Data">
          <Stat label="Transactions" value={String(transactions.length)} />
          <Stat label="Pending sync" value={String(pendingCount)} />
          <Stat label="Budgets" value={String(budgets.length)} />
          <Stat label="Storage" value={isPersistentStorageAvailable ? 'On-device (persisted)' : 'Memory only'} />

          <View className="mt-3 gap-2">
            <SecondaryButton
              label={busy === 'exporting' ? 'Exporting…' : 'Export transactions (CSV)'}
              onPress={handleExport}
              disabled={isBusy || transactions.length === 0}
            />
            <DangerButton
              label={confirmClear ? 'Tap again to erase everything' : 'Clear local data'}
              onPress={handleClearLocalData}
              disabled={isBusy}
            />
            {confirmClear ? (
              <Text className="text-[11px] text-rose-300/80">
                This deletes {transactions.length} transactions, {budgets.length} budgets, every custom
                category and every payment source on this device. It cannot be undone.
              </Text>
            ) : null}
          </View>
        </Section>

        <Text className="mt-6 text-center text-[11px] text-slate-600">
          ExpenseTracker · offline-first guest mode
        </Text>
      </ScrollView>
    </View>
  );
}
