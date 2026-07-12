/**
 * Authentication + application-data service.
 *
 * A TypeScript port of the original auth.js module: email/password + magic-link
 * auth, profile metadata, avatar upload, and the founding-partner / job
 * application table calls. All access is gated by Supabase Row Level Security.
 */

import type { Session } from '@supabase/supabase-js';
import {
  CONFIG_ERROR_MESSAGE,
  authCallbackUrl,
  getSupabaseClient,
  isSupabaseConfigured,
} from './supabase';

export { isSupabaseConfigured, CONFIG_ERROR_MESSAGE, setRememberMe } from './supabase';

export interface ProfileInput {
  full_name?: string;
  job_title?: string;
  newsletter_opt_in?: boolean;
  terms_accepted_at?: string;
}

class ConfigError extends Error {
  constructor() {
    super(CONFIG_ERROR_MESSAGE);
    this.name = 'ConfigError';
  }
}

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new ConfigError();
  return client;
}

export async function checkClientReady(): Promise<{ ready: boolean; message?: string }> {
  if (!isSupabaseConfigured) return { ready: false, message: CONFIG_ERROR_MESSAGE };
  return { ready: true };
}

export async function getSession(): Promise<Session | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function onAuthStateChange(callback: (session: Session | null) => void): { unsubscribe: () => void } {
  const client = getSupabaseClient();
  if (!client) return { unsubscribe() {} };
  const { data } = client.auth.onAuthStateChange((_event, session) => callback(session));
  return { unsubscribe: () => data.subscription.unsubscribe() };
}

function profileMetadata(profile?: ProfileInput): Record<string, unknown> | undefined {
  if (!profile) return undefined;
  const data: Record<string, unknown> = {};
  if (profile.full_name) data.full_name = profile.full_name;
  if (profile.job_title) data.job_title = profile.job_title;
  if (typeof profile.newsletter_opt_in === 'boolean') data.newsletter_opt_in = profile.newsletter_opt_in;
  if (profile.terms_accepted_at) data.terms_accepted_at = profile.terms_accepted_at;
  return Object.keys(data).length ? data : undefined;
}

export async function signUpWithPassword(email: string, password: string, profile?: ProfileInput) {
  const client = requireClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: authCallbackUrl(), data: profileMetadata(profile) },
  });
  if (error) throw error;
  return data;
}

export async function signInWithPassword(email: string, password: string) {
  const client = requireClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signInWithMagicLink(email: string) {
  const client = requireClient();
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: authCallbackUrl() },
  });
  if (error) throw error;
}

export async function resendSignupEmail(email: string) {
  const client = requireClient();
  const { error } = await client.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: authCallbackUrl() },
  });
  if (error) throw error;
}

export async function signOut() {
  const client = requireClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function requestPasswordReset(email: string) {
  const client = requireClient();
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: authCallbackUrl() });
  if (error) throw error;
}

export async function updatePassword(newPassword: string) {
  const client = requireClient();
  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export interface ProfileUpdate {
  full_name?: string;
  job_title?: string;
  linkedin_url?: string;
  newsletter_opt_in?: boolean;
}

export async function updateProfile(fields: ProfileUpdate) {
  const client = requireClient();
  const { data, error } = await client.auth.updateUser({ data: { ...fields } });
  if (error) throw error;
  return data;
}

const AVATAR_BUCKET = 'avatars';

export async function uploadAvatar(file: File) {
  const client = requireClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData.session;
  if (!session) throw new Error('You must be signed in to upload a profile picture.');

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${session.user.id}/avatar.${ext}`;

  const { error: uploadError } = await client.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
  if (uploadError) throw uploadError;

  const { data: urlData } = client.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const avatarUrl = `${urlData.publicUrl}?v=${Date.now()}`;

  const { data, error } = await client.auth.updateUser({ data: { avatar_url: avatarUrl } });
  if (error) throw error;
  return data;
}

const APPLICATIONS_TABLE = 'founding_partner_applications';

export async function submitFoundingPartnerApplication(fields: Record<string, unknown>) {
  const client = requireClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData.session;
  if (!session) throw new Error('You must be signed in to submit a founding partner application.');

  const { data, error } = await client
    .from(APPLICATIONS_TABLE)
    .insert({ ...fields, user_id: session.user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getMyFoundingPartnerApplication() {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData.session;
  if (!session) return null;

  const { data, error } = await client
    .from(APPLICATIONS_TABLE)
    .select('*')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

const JOB_APPLICATIONS_TABLE = 'job_applications';

export async function submitJobApplication(fields: Record<string, unknown>) {
  const client = requireClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData.session;
  if (!session) throw new Error('You must be signed in to submit an application.');

  const { data, error } = await client
    .from(JOB_APPLICATIONS_TABLE)
    .insert({ ...fields, user_id: session.user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getMyJobApplications() {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData.session;
  if (!session) return [];

  const { data, error } = await client
    .from(JOB_APPLICATIONS_TABLE)
    .select('*')
    .eq('user_id', session.user.id);
  if (error) throw error;
  return data ?? [];
}
