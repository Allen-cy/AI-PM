import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { AUTH_COOKIE, getAuthSupabase, isAuthStorageConfigured } from '@/features/auth/server';
import { hashSessionToken } from '@/features/auth/password';

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;

  if (token && isAuthStorageConfigured()) {
    const supabase = getAuthSupabase();
    await supabase
      .from('app_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', hashSessionToken(token));
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
