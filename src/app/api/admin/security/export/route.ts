import { NextResponse } from "next/server";
import { isAuthStorageConfigured, requireAdmin } from "@/features/auth/server";
import { hasPermission } from "@/features/security/authorization";
import { buildSecurityCsv, buildSecurityMarkdown } from "@/features/security/export";
import { loadAdminSecuritySnapshot, writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

function errorJson(body: unknown, status = 400) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  if (!isAuthStorageConfigured()) return errorJson({ error: "AUTH_STORAGE_NOT_CONFIGURED", request_id: requestId }, 503);
  const admin = await requireAdmin();
  if (!admin || !hasPermission(admin, "audit:view")) return errorJson({ error: "FORBIDDEN", request_id: requestId }, 403);

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "markdown";
  const snapshot = await loadAdminSecuritySnapshot();
  const generatedAt = new Date().toISOString();
  const body = format === "csv" ? buildSecurityCsv(snapshot) : buildSecurityMarkdown(snapshot, generatedAt);
  await writeOperationAudit({
    user: admin,
    action: "security_export",
    resourceType: "security_report",
    status: "succeeded",
    severity: "medium",
    summary: `导出企业安全运营报告：${format}`,
    detail: { format, audit_count: snapshot.auditLogs.length, grant_count: snapshot.projectAccess.length, request_count: snapshot.projectAccessRequests.length },
    requestId,
  });
  const extension = format === "csv" ? "csv" : "md";
  const contentType = format === "csv" ? "text/csv; charset=utf-8" : "text/markdown; charset=utf-8";
  return new Response(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="ai-pmo-security-report-${generatedAt.slice(0, 10)}.${extension}"`,
      "X-Request-Id": requestId,
    },
  });
}
