import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { getSupabase, isCloudConfigured } from '@/lib/supabase';
import { getSession } from '@/services/authService';

export interface AuthState {
  isConfigured: boolean;
  isLoading: boolean;
  session: Session | null;
  email: string | null;
}

/** Live Supabase session, kept in sync with auth events (sign-in, refresh, sign-out). */
export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(isCloudConfigured);

  useEffect(() => {
    if (!isCloudConfigured) {
      return;
    }

    let active = true;
    const client = getSupabase();

    getSession()
      .then((current) => {
        if (active) {
          setSession(current);
        }
      })
      .catch(() => {
        // Offline or storage unavailable: stay signed out rather than blocking the UI.
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setIsLoading(false);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return {
    isConfigured: isCloudConfigured,
    isLoading,
    session,
    email: session?.user.email ?? null,
  };
}
