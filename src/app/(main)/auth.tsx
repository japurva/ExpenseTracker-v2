import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, SecondaryButton } from '@/components/ui/buttons';
import { isCloudConfigured } from '@/lib/supabase';
import { signInWithPassword, signUpWithPassword } from '@/services/authService';
import { syncLocalDataToCloud, type SyncOutcome } from '@/services/syncService';

type Mode = 'sign-in' | 'sign-up';
type Phase = 'form' | 'syncing' | 'done' | 'confirm-email';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

export default function AuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SyncOutcome | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const isBusy = phase === 'syncing';
  const canSubmit =
    isCloudConfigured && !isBusy && phase === 'form' && password.length >= MIN_PASSWORD_LENGTH;

  const leave = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/settings');
    }
  };

  const runMigration = async () => {
    setPhase('syncing');
    setSyncError(null);
    try {
      const outcome = await syncLocalDataToCloud();
      setSummary(outcome);
    } catch (cause) {
      setSyncError(cause instanceof Error ? cause.message : 'Local data could not be uploaded.');
    } finally {
      setPhase('done');
    }
  };

  const handleSubmit = async () => {
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for the password.`);
      return;
    }

    setError(null);
    try {
      if (mode === 'sign-in') {
        await signInWithPassword(email, password);
        // Signing in is the one-shot guest → cloud migration trigger.
        await runMigration();
      } else {
        const result = await signUpWithPassword(email, password);
        if (result.session) {
          await runMigration();
        } else {
          setPhase('confirm-email');
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication failed.');
    }
  };

  return (
    <View className="flex-1 bg-slate-950">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: insets.top + 8,
            paddingBottom: 40,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-row items-center">
            <Pressable
              onPress={leave}
              accessibilityRole="button"
              accessibilityLabel="Back"
              className="h-9 w-9 items-center justify-center rounded-full border border-slate-800 bg-slate-900"
            >
              <Text className="text-base text-slate-300">‹</Text>
            </Pressable>
            <Text className="ml-3 text-xl font-semibold text-slate-50">
              {mode === 'sign-in' ? 'Sign in' : 'Create account'}
            </Text>
          </View>

          {!isCloudConfigured ? (
            <View className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <Text className="text-sm font-medium text-amber-200">Supabase is not configured</Text>
              <Text className="mt-1 text-xs leading-5 text-amber-100/80">
                Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env, then restart the
                dev server. Guest mode keeps working without an account.
              </Text>
            </View>
          ) : null}

          {phase === 'confirm-email' ? (
            <View className="mt-6 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4">
              <Text className="text-sm font-medium text-sky-200">Confirm your email</Text>
              <Text className="mt-1 text-xs leading-5 text-sky-100/80">
                We sent a confirmation link to {email.trim()}. Open it, then come back and sign in.
              </Text>
              <View className="mt-4">
                <SecondaryButton
                  label="Back to sign in"
                  onPress={() => {
                    setPhase('form');
                    setMode('sign-in');
                  }}
                />
              </View>
            </View>
          ) : phase === 'syncing' ? (
            <View className="mt-8 items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <ActivityIndicator color="#38bdf8" />
              <Text className="text-sm font-medium text-slate-100">Uploading your local history…</Text>
              <Text className="text-xs text-slate-500">
                Categories, transactions and budgets are being copied to PostgreSQL.
              </Text>
            </View>
          ) : phase === 'done' ? (
            <View className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <Text className="text-sm font-medium text-slate-100">You're signed in</Text>

              {syncError ? (
                <Text className="mt-2 text-xs text-rose-400">{syncError}</Text>
              ) : summary ? (
                <Text className="mt-2 text-xs text-slate-400">
                  Uploaded {summary.uploaded} · pulled {summary.pulled.transactions} transactions ·
                  failed {summary.failed + summary.deleteFailures}.
                  {summary.failed + summary.deleteFailures > 0
                    ? ' Rows that failed stay on this device and will retry on the next sync.'
                    : ' This device and the cloud are in sync.'}
                </Text>
              ) : null}

              <View className="mt-4 gap-2">
                {syncError ? (
                  <PrimaryButton label="Retry upload" onPress={runMigration} disabled={isBusy} />
                ) : null}
                <SecondaryButton label="Continue" onPress={leave} />
              </View>
            </View>
          ) : (
            <>
              <Text className="mt-5 text-xs leading-5 text-slate-400">
                Signing in uploads the records you created as a guest. Nothing is deleted locally until
                you clear it.
              </Text>

              <View className="mt-5 flex-row gap-2">
                {(['sign-in', 'sign-up'] as const).map((option) => {
                  const selected = mode === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => {
                        setMode(option);
                        setError(null);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      className={`flex-1 items-center rounded-xl border px-3 py-2 ${
                        selected ? 'border-sky-400/60 bg-sky-500/15' : 'border-slate-800 bg-slate-950/40'
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${selected ? 'text-sky-200' : 'text-slate-400'}`}
                      >
                        {option === 'sign-in' ? 'Sign in' : 'Sign up'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text className="mt-4 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Email
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#475569"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                accessibilityLabel="Email"
                className="mt-1.5 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100"
              />

              <Text className="mt-4 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Password
              </Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                placeholderTextColor="#475569"
                secureTextEntry
                autoCapitalize="none"
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                accessibilityLabel="Password"
                className="mt-1.5 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100"
              />

              {error ? <Text className="mt-3 text-xs text-rose-400">{error}</Text> : null}

              <View className="mt-5">
                <PrimaryButton
                  label={mode === 'sign-in' ? 'Sign in' : 'Create account'}
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                />
              </View>

              <Text className="mt-4 text-center text-[11px] leading-5 text-slate-600">
                Your password is handled by Supabase Auth; this app never stores it.
              </Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
