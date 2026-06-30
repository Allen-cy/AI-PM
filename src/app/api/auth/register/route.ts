import { NextResponse } from 'next/server';
import { getAuthSupabase, isAuthStorageConfigured } from '@/features/auth/server';
import { hashPassword, hashRegistrationCode } from '@/features/auth/password';
import { normalizeEmail, normalizePhone, validateRegistrationInput } from '@/features/auth/validation';

export async function POST(request: Request) {
  if (!isAuthStorageConfigured()) {
    return NextResponse.json({ error: 'AUTH_STORAGE_NOT_CONFIGURED' }, { status: 503 });
  }

  const body = await request.json();
  const email = normalizeEmail(String(body.email || ''));
  const phone = normalizePhone(String(body.phone || ''));
  const password = String(body.password || '');
  const code = String(body.code || '').trim();
  const name = String(body.name || '').trim();

  const validationError = validateRegistrationInput({ email, phone, password, code });
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const supabase = getAuthSupabase();
  const codeHash = hashRegistrationCode(code);

  const { data: registrationCode, error: codeError } = await supabase
    .from('user_registration_codes')
    .select('id, request_id, expires_at, used_at')
    .eq('email', email)
    .eq('phone', phone)
    .eq('code_hash', codeHash)
    .maybeSingle();

  if (codeError) return NextResponse.json({ error: codeError.message }, { status: 500 });
  if (!registrationCode || registrationCode.used_at || new Date(registrationCode.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: '注册码无效、已使用或已过期' }, { status: 400 });
  }

  const { data: existingUser } = await supabase
    .from('app_users')
    .select('id')
    .or(`email.eq.${email},phone.eq.${phone}`)
    .maybeSingle();
  if (existingUser) return NextResponse.json({ error: '该邮箱或手机号已注册' }, { status: 409 });

  const { data: user, error: userError } = await supabase
    .from('app_users')
    .insert({
      email,
      phone,
      name: name || null,
      password_hash: hashPassword(password),
      role: 'user',
      status: 'active',
    })
    .select('id,email,phone,name,role,status')
    .single();

  if (userError) return NextResponse.json({ error: userError.message }, { status: 500 });

  await supabase
    .from('user_registration_codes')
    .update({ used_at: new Date().toISOString(), used_by: user.id })
    .eq('id', registrationCode.id);

  await supabase
    .from('user_registration_requests')
    .update({ status: 'registered', registered_at: new Date().toISOString() })
    .eq('id', registrationCode.request_id);

  return NextResponse.json({ user });
}
