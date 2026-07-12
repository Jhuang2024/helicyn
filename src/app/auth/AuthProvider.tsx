import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSession, onAuthStateChange } from '@/services/auth';
import { isSupabaseConfigured } from '@/services/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Tracks the Supabase auth session and exposes it to the app. Drives the
 * auth-dependent navigation (Login vs profile menu) and the auth gates on the
 * onboarding, careers, portal, and profile routes.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((s) => {
        if (!cancelled) setSession(s);
      })
      .catch(() => {
        /* unconfigured or offline — treat as signed out */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const sub = onAuthStateChange((s) => {
      if (!cancelled) setSession(s);
    });

    return () => {
      cancelled = true;
      sub.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, user: session?.user ?? null, loading, configured: isSupabaseConfigured }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
