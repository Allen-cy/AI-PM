import { NextResponse, type NextRequest } from 'next/server';
import { resolveRequestAccess } from './features/auth/api-access';
import { validateSessionToken } from './features/auth/session-validation';

export async function proxy(request: NextRequest) {
  if (process.env.AUTH_REQUIRED !== 'true') {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  let access = resolveRequestAccess({
    authRequired: true,
    pathname,
    hasSessionCookie: Boolean(request.cookies.get('ai_pmo_session')?.value),
  });
  if (access === 'next' && !pathname.startsWith('/_next') && pathname !== '/favicon.ico') {
    const publicRequest = resolveRequestAccess({ authRequired: true, pathname, hasSessionCookie: false }) === 'next';
    if (!publicRequest) {
      const user = await validateSessionToken(request.cookies.get('ai_pmo_session')?.value);
      if (!user) access = pathname.startsWith('/api/') ? 'unauthorized' : 'login';
    }
  }
  if (access === 'next') {
    return NextResponse.next();
  }
  if (access === 'unauthorized') {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const loginUrl = new URL('/auth/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!.*\\..*).*)'],
};
