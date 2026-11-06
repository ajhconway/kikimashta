import { createClient } from '@supabase/supabase-js';

export function cloudConfig(url?: string, key?: string) {
  if (!url && !key) return null;
  if (!url || !key) throw new Error('Configure both Supabase URL and publishable key.');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Use the HTTPS Supabase project URL.');
  let publicKey = key.startsWith('sb_publishable_');
  if (!publicKey) {
    try { publicKey = JSON.parse(atob(key.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; } catch { /* Not a public legacy key. */ }
  }
  if (!publicKey) throw new Error('Use a publishable key, never a secret or service-role key.');
  return { url: parsed.href.replace(/\/$/, ''), key };
}

export function createCloudClient() {
  const config = cloudConfig(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  return config ? createClient(config.url, config.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null;
}
