import type { Session } from '@supabase/supabase-js';

import { CloudServiceError } from '@/lib/cloudError';
import { getSupabase } from '@/lib/supabase';

export interface SignUpResult {
  session: Session | null;
  /** True when Supabase requires the user to confirm their email before signing in. */
  requiresEmailConfirmation: boolean;
}

export async function signInWithPassword(email: string, password: string): Promise<Session> {
  const { data, error } = await getSupabase().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) {
    throw new CloudServiceError(error.message, error.code, error);
  }
  if (!data.session) {
    throw new CloudServiceError('Sign in succeeded but no session was returned.', 'no_session');
  }
  return data.session;
}

export async function signUpWithPassword(email: string, password: string): Promise<SignUpResult> {
  const { data, error } = await getSupabase().auth.signUp({
    email: email.trim(),
    password,
  });
  if (error) {
    throw new CloudServiceError(error.message, error.code, error);
  }
  return {
    session: data.session,
    requiresEmailConfirmation: !data.session && Boolean(data.user),
  };
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut();
  if (error) {
    throw new CloudServiceError(error.message, error.code, error);
  }
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error) {
    throw new CloudServiceError(error.message, error.code, error);
  }
  return data.session;
}
