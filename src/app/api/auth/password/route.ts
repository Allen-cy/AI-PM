import { NextResponse } from 'next/server';
import { getAuthSupabase, getCurrentUser, isAuthStorageConfigured } from '@/features/auth/server';
import { hashPassword, verifyPassword } from '@/features/auth/password';
import { isValidPassword } from '@/features/auth/validation';

export async function PUT(request: Request) {
  if (!isAuthStorageConfigured()) {
    return NextResponse.json({ error: 'AUTH_STORAGE_NOT_CONFIGURED' }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

  const body = await request.json();
  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');

  if (!currentPassword) return NextResponse.json({ error: '请输入当前密码' }, { status: 400 });
  if (!isValidPassword(newPassword)) {
    return NextResponse.json({ error: '新密码至少6位，且必须同时包含英文字母和数字' }, { status: 400 });
  }

  const supabase = getAuthSupabase();
  const { data: account, error: accountError } = await supabase
    .from('app_users')
    .select('id,password_hash')
    .eq('id', user.id)
    .maybeSingle();

  if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 });
  if (!account || !verifyPassword(currentPassword, account.password_hash)) {
    return NextResponse.json({ error: '当前密码不正确' }, { status: 401 });
  }

  const { error } = await supabase
    .from('app_users')
    .update({
      password_hash: hashPassword(newPassword),
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
