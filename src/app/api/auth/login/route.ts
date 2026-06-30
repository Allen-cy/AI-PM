import { NextResponse } from 'next/server';
import { AUTH_COOKIE, getAuthSupabase, isAuthStorageConfigured } from '@/features/auth/server';
import { createSessionToken, hashSessionToken, verifyPassword } from '@/features/auth/password';
import { normalizeEmail, normalizePhone } from '@/features/auth/validation';

export async function POST(request: Request) {
  if (!isAuthStorageConfigured()) {
    return NextResponse.json({ error: 'AUTH_STORAGE_NOT_CONFIGURED' }, { status: 503 });
  }

  const body = await request.json();
  const accountRaw = String(body.account || '').trim();
  const password = String(body.password || '');
  if (!accountRaw || !password) {
    return NextResponse.json({ error: '请输入账号和密码' }, { status: 400 });
  }

  const account = accountRaw.includes('@') ? normalizeEmail(accountRaw) : normalizePhone(accountRaw);
  const supabase = getAuthSupabase();
  const { data: user, error } = await supabase
    .from('app_users')
    .select('id,email,phone,name,role,status,password_hash')
    .or(`email.eq.${account},phone.eq.${account}`)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!user || user.status !== 'active' || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: '账号或密码错误' }, { status: 401 });
  }

  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await supabase.from('app_sessions').insert({
    user_id: user.id,
    token_hash: hashSessionToken(token),
    expires_at: expiresAt.toISOString(),
  });

  const response = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      role: user.role,
      status: user.status,
    },
  });
  response.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });

  return response;
}
