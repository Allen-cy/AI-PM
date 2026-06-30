import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/features/auth/server';
import { getEffectiveAiModelSummary } from '@/features/ai/settings';

export async function GET() {
  const user = await getCurrentUser();
  const aiModel = await getEffectiveAiModelSummary(user?.id);
  return NextResponse.json({ user, runtime: { aiModel } });
}
