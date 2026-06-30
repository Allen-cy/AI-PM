import { NextResponse } from 'next/server';
import { getAuthSupabase, isAuthStorageConfigured, requireAdmin } from '@/features/auth/server';
import { generateRegistrationCode, hashRegistrationCode } from '@/features/auth/password';
import { sendRegistrationCodeEmail } from '@/features/email/server';

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!isAuthStorageConfigured()) {
    return NextResponse.json({ error: 'AUTH_STORAGE_NOT_CONFIGURED' }, { status: 503 });
  }
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { id } = await context.params;
  const supabase = getAuthSupabase();
  const { data: registrationRequest, error: requestError } = await supabase
    .from('user_registration_requests')
    .select('id,email,phone,name,status')
    .eq('id', id)
    .maybeSingle();

  if (requestError) return NextResponse.json({ error: requestError.message }, { status: 500 });
  if (!registrationRequest) return NextResponse.json({ error: '申请不存在' }, { status: 404 });
  if (registrationRequest.status !== 'pending') {
    return NextResponse.json({ error: '该申请已处理，无需重复审批' }, { status: 400 });
  }

  const code = generateRegistrationCode();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const { error: codeError } = await supabase
    .from('user_registration_codes')
    .insert({
      request_id: registrationRequest.id,
      email: registrationRequest.email,
      phone: registrationRequest.phone,
      code_hash: hashRegistrationCode(code),
      expires_at: expiresAt.toISOString(),
      created_by: admin.id,
    });

  if (codeError) return NextResponse.json({ error: codeError.message }, { status: 500 });

  const delivery = await sendRegistrationCodeEmail({
    to: registrationRequest.email,
    code,
  });

  await supabase
    .from('user_registration_requests')
    .update({
      status: 'approved',
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      last_delivery_status: delivery.sent ? 'sent' : delivery.reason,
    })
    .eq('id', registrationRequest.id);

  return NextResponse.json({
    ok: true,
    emailSent: delivery.sent,
    deliveryStatus: delivery.sent ? 'sent' : delivery.reason,
    expiresAt: expiresAt.toISOString(),
  });
}
