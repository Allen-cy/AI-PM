import { cookies } from 'next/headers';
import { validateSessionToken } from './session-validation';
export { getAuthSupabase, isAuthStorageConfigured, type AppUser } from './storage';
import type { AppUser } from './storage';

export const AUTH_COOKIE = 'ai_pmo_session';

export async function getCurrentUser(): Promise<AppUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  return validateSessionToken(token);
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    return null;
  }
  return user;
}

export async function requireAuthenticatedApiUser(): Promise<AppUser | null> {
  return getCurrentUser();
}
