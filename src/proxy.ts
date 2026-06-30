import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/auth/login',
  '/auth/apply',
  '/auth/register',
];

export function proxy(request: NextRequest) {
  if (process.env.AUTH_REQUIRED !== 'true') {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some(path => pathname.startsWith(path));
  const isStaticAsset = pathname.startsWith('/_next') || pathname === '/favicon.ico';
  const isApiRoute = pathname.startsWith('/api/');

  if (isPublicPath || isStaticAsset || isApiRoute) {
    return NextResponse.next();
  }

  const hasSessionCookie = Boolean(request.cookies.get('ai_pmo_session')?.value);
  if (hasSessionCookie) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/auth/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!.*\\..*).*)'],
};
