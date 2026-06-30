import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { hashSessionToken } from './password';

export const AUTH_COOKIE = 'ai_pmo_session';

export interface AppUser {
  id: string;
  email: string;
  phone: string;
  name: string | null;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
}

export function isAuthStorageConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getAuthSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase auth storage is not configured');
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function getCurrentUser(): Promise<AppUser | null> {
  if (!isAuthStorageConfigured()) return null;
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  if (!token) return null;

  const supabase = getAuthSupabase();
  const tokenHash = hashSessionToken(token);
  const { data, error } = await supabase
    .from('app_sessions')
    .select('id, expires_at, revoked_at, app_users(id,email,phone,name,role,status)')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error || !data || data.revoked_at || new Date(data.expires_at).getTime() < Date.now()) {
    return null;
  }

  const user = Array.isArray(data.app_users) ? data.app_users[0] : data.app_users;
  if (!user || user.status !== 'active') return null;
  return user as AppUser;
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    return null;
  }
  return user;
}
