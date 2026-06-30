import { NextResponse } from 'next/server';
import { getAuthSupabase, getCurrentUser, isAuthStorageConfigured } from '@/features/auth/server';
import {
  isReasonablePhone,
  isValidDisplayName,
  isValidEmail,
  normalizeEmail,
  normalizePhone,
} from '@/features/auth/validation';

export async function PUT(request: Request) {
  if (!isAuthStorageConfigured()) {
    return NextResponse.json({ error: 'AUTH_STORAGE_NOT_CONFIGURED' }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

  const body = await request.json();
  const name = String(body.name || '').trim();
  const email = normalizeEmail(String(body.email || ''));
  const phone = normalizePhone(String(body.phone || ''));

  if (!isValidDisplayName(name)) {
    return NextResponse.json({ error: '用户名称必填，长度需为2-40个字符' }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 });
  }
  if (!isReasonablePhone(phone)) {
    return NextResponse.json({ error: '手机号码格式不合理' }, { status: 400 });
  }

  const supabase = getAuthSupabase();
  const { data: duplicate, error: duplicateError } = await supabase
    .from('app_users')
    .select('id')
    .or(`email.eq.${email},phone.eq.${phone}`)
    .neq('id', user.id)
    .maybeSingle();

  if (duplicateError) return NextResponse.json({ error: duplicateError.message }, { status: 500 });
  if (duplicate) return NextResponse.json({ error: '邮箱或手机号已被其他用户使用' }, { status: 409 });

  const { data, error } = await supabase
    .from('app_users')
    .update({
      name,
      email,
      phone,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)
    .select('id,email,phone,name,role,status')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data });
}
