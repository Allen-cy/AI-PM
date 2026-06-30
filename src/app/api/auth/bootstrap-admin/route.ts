import { NextResponse } from 'next/server';
import { getAuthSupabase, isAuthStorageConfigured } from '@/features/auth/server';
import { hashPassword } from '@/features/auth/password';
import { isReasonablePhone, isValidEmail, isValidPassword, normalizeEmail, normalizePhone } from '@/features/auth/validation';

export async function POST() {
  if (!isAuthStorageConfigured()) {
    return NextResponse.json({ error: 'AUTH_STORAGE_NOT_CONFIGURED' }, { status: 503 });
  }

  const email = normalizeEmail(process.env.ADMIN_EMAIL || '');
  const phone = normalizePhone(process.env.ADMIN_PHONE || '');
  const password = process.env.ADMIN_PASSWORD || '';
  const name = process.env.ADMIN_NAME || '系统管理员';

  if (!isValidEmail(email) || !isReasonablePhone(phone) || !isValidPassword(password)) {
    return NextResponse.json({ error: 'ADMIN_ENV_INVALID' }, { status: 400 });
  }

  const supabase = getAuthSupabase();
  const { data: existingAdmin, error: existingError } = await supabase
    .from('app_users')
    .select('id')
    .eq('role', 'admin')
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (existingAdmin) {
    return NextResponse.json({ ok: true, status: 'admin_exists' });
  }

  const { error } = await supabase
    .from('app_users')
    .insert({
      email,
      phone,
      name,
      role: 'admin',
      status: 'active',
      password_hash: hashPassword(password),
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: 'admin_created' });
}
