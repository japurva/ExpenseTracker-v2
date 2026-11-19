import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

import { resolveDevApiUrl } from '@/lib/devApiUrl';
import type { Database } from '@/types/database.types';

const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabaseUrl = configuredUrl
  ? resolveDevApiUrl(configuredUrl, {
      platform: Platform.OS,
      metroHost: Constants.expoConfig?.hostUri,
    })
  : configuredUrl;

if (__DEV__ && configuredUrl && supabaseUrl !== configuredUrl) {
  console.log(`[supabase] ${configuredUrl} is device-local; using ${supabaseUrl} instead.`);
}

/**
 * Guest-first: the app must stay usable with no cloud project configured, so the
 * client is created lazily instead of throwing at import time.
 */
export const isCloudConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export class CloudNotConfiguredError extends Error {
  constructor() {
    super(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    );
    this.name = 'CloudNotConfiguredError';
  }
}

let client: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new CloudNotConfiguredError();
  }

  if (!client) {
    client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    });

    if (Platform.OS !== 'web') {
      // Timers are throttled while backgrounded, so refresh the token on foreground instead.
      AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          client?.auth.startAutoRefresh();
        } else {
          client?.auth.stopAutoRefresh();
        }
      });
    }
  }

  return client;
}

export class NotAuthenticatedError extends Error {
  constructor() {
    super('This operation requires a signed-in account.');
    this.name = 'NotAuthenticatedError';
  }
}

/**
 * Reads the cached session rather than calling `auth.getUser()`, so callers work
 * offline; RLS rejects anything the token is no longer allowed to touch.
 */
export async function requireUserId(): Promise<string> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) {
    throw error;
  }
  const userId = data.session?.user.id;
  if (!userId) {
    throw new NotAuthenticatedError();
  }
  return userId;
}
