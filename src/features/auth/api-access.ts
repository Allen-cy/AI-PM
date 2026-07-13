const PUBLIC_REQUEST_PATHS: readonly string[] = [
  "/auth/login",
  "/auth/apply",
  "/auth/register",
  "/api/auth/login",
  "/api/auth/apply",
  "/api/auth/register",
  "/api/auth/bootstrap-admin",
  "/api/auth/logout",
  "/api/integrations/feishu/events",
  "/api/cron/evidence-expiry",
  "/api/cron/operating-calendar",
  "/api/cron/feishu-reconcile",
  "/api/cron/decision-sla",
  "/api/internal/p17-p25-audit",
  "/api/rag/health",
  "/api/version",
];

export function isPublicRequestPath(pathname: string): boolean {
  return PUBLIC_REQUEST_PATHS.some(path => pathname === path || pathname.startsWith(`${path}/`));
}

export function resolveRequestAccess(_input: {
  authRequired: boolean;
  pathname: string;
  hasSessionCookie: boolean;
}): "next" | "login" | "unauthorized" {
  if (!_input.authRequired) return "next";
  if (isPublicRequestPath(_input.pathname)) return "next";
  if (_input.pathname.startsWith("/_next") || _input.pathname === "/favicon.ico") return "next";
  if (_input.hasSessionCookie) return "next";
  return _input.pathname.startsWith("/api/") ? "unauthorized" : "login";
}
