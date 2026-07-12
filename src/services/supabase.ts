/**
 * Supabase client factory.
 *
 * Config is read from Vite env (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`)
 * with a fallback to the legacy `window.HELICYN_SUPABASE_*` globals so an
 * existing runtime-config script keeps working. The anon key is a PUBLIC value
 * protected by Row Level Security — it is never a service/secret key.
 *
 * "Save login on this device" is honoured through a storage adapter that routes
 * the session to localStorage (persist) or sessionStorage (per-tab), matching
 * the original behavior.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    HELICYN_SUPABASE_URL?: string;
    HELICYN_SUPABASE_ANON_KEY?: string;
  }
}

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ??
  (typeof window !== 'undefined' ? window.HELICYN_SUPABASE_URL : undefined) ??
  '';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  (typeof window !== 'undefined' ? window.HELICYN_SUPABASE_ANON_KEY : undefined) ??
  '';

function looksConfigured(url: string, key: string): boolean {
  return Boolean(
    url &&
      key &&
      !url.includes('YOUR-PROJECT') &&
      !key.includes('YOUR-PUBLIC') &&
      /^https:\/\/.+\.supabase\.co/.test(url),
  );
}

export const isSupabaseConfigured = looksConfigured(SUPABASE_URL, SUPABASE_ANON_KEY);

export const CONFIG_ERROR_MESSAGE =
  'Supabase is not configured for this deployment. Set VITE_SUPABASE_URL and ' +
  'VITE_SUPABASE_ANON_KEY (your project URL + public anon key — see docs/auth_setup.md). ' +
  'No account or application data can be created until this is set up.';

const REMEMBER_KEY = 'helicyn.rememberMe';

function rememberMe(): boolean {
  try {
    return window.localStorage.getItem(REMEMBER_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setRememberMe(remember: boolean): void {
  try {
    window.localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
  } catch {
    /* private browsing / storage disabled */
  }
}

const deviceStorage = {
  getItem(key: string): string | null {
    try {
      return (rememberMe() ? window.localStorage : window.sessionStorage).getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      const remember = rememberMe();
      (remember ? window.localStorage : window.sessionStorage).setItem(key, value);
      (remember ? window.sessionStorage : window.localStorage).removeItem(key);
    } catch {
      /* ignore */
    }
  },
  removeItem(key: string): void {
    try {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

let client: SupabaseClient | null = null;

/** Lazily create (or return) the singleton Supabase client, or null if unconfigured. */
export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: deviceStorage,
      },
    });
  }
  return client;
}

export function authCallbackUrl(): string {
  return window.location.origin + '/auth-callback';
}
