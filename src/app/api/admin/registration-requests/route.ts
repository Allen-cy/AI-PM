import { NextResponse } from 'next/server';
import { getAuthSupabase, isAuthStorageConfigured, requireAdmin } from '@/features/auth/server';

export async function GET() {
  if (!isAuthStorageConfigured()) {
    return NextResponse.json({ error: 'AUTH_STORAGE_NOT_CONFIGURED' }, { status: 503 });
  }
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const supabase = getAuthSupabase();
  const { data, error } = await supabase
    .from('user_registration_requests')
    .select('id,email,phone,name,reason,status,created_at,reviewed_at,registered_at,last_delivery_status')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data });
}
