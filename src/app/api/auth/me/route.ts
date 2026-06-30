import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/features/auth/server';

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user });
}
