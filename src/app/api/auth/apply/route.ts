import { NextResponse } from 'next/server';
import { getAuthSupabase, isAuthStorageConfigured } from '@/features/auth/server';
import { isReasonablePhone, isValidEmail, normalizeEmail, normalizePhone } from '@/features/auth/validation';

export async function POST(request: Request) {
  if (!isAuthStorageConfigured()) {
    return NextResponse.json({ error: 'AUTH_STORAGE_NOT_CONFIGURED' }, { status: 503 });
  }

  const body = await request.json();
  const email = normalizeEmail(String(body.email || ''));
  const phone = normalizePhone(String(body.phone || ''));
  const name = String(body.name || '').trim();
  const reason = String(body.reason || '').trim();

  if (!name) return NextResponse.json({ error: '请输入申请人姓名' }, { status: 400 });
  if (!isValidEmail(email)) return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 });
  if (!isReasonablePhone(phone)) return NextResponse.json({ error: '手机号码格式不合理' }, { status: 400 });

  const supabase = getAuthSupabase();
  const { data: existingUser } = await supabase
    .from('app_users')
    .select('id')
    .or(`email.eq.${email},phone.eq.${phone}`)
    .maybeSingle();
  if (existingUser) return NextResponse.json({ error: '该邮箱或手机号已注册' }, { status: 409 });

  const { data: existingRequest } = await supabase
    .from('user_registration_requests')
    .select('id,status')
    .or(`email.eq.${email},phone.eq.${phone}`)
    .in('status', ['pending', 'approved'])
    .maybeSingle();
  if (existingRequest) {
    return NextResponse.json({ error: '该邮箱或手机号已有待处理申请，请等待审核' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('user_registration_requests')
    .insert({
      email,
      phone,
      name,
      reason,
      status: 'pending',
    })
    .select('id,status,created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ request: data });
}
