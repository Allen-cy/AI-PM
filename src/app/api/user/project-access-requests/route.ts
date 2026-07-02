import { NextResponse } from "next/server";
import { getAuthSupabase, getCurrentUser, isAuthStorageConfigured } from "@/features/auth/server";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

class ProjectAccessRequestError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function text(value: unknown, field: string, max = 500): string {
  const output = String(value ?? "").trim();
  if (!output || output.length > max) throw new ProjectAccessRequestError(`${field}不能为空且长度不能超过${max}字符`);
  return output;
}

function optionalText(value: unknown, max = 500): string | null {
  if (value === undefined || value === null || value === "") return null;
  const output = String(value).trim();
  if (output.length > max) throw new ProjectAccessRequestError(`字段长度不能超过${max}字符`);
  return output;
}

function accessLevel(value: unknown): "viewer" | "editor" | "owner" {
  if (value === "viewer" || value === "editor" || value === "owner") return value;
  return "viewer";
}

export async function GET() {
  if (!isAuthStorageConfigured()) return json({ error: "AUTH_STORAGE_NOT_CONFIGURED" }, 503);
  const user = await getCurrentUser();
  if (!user) return json({ error: "请先登录" }, 401);

  const supabase = getAuthSupabase();
  const { data, error } = await supabase
    .from("project_access_requests")
    .select("id,project_name,project_code,access_level,reason,status,reviewer_name,review_comment,related_grant_id,created_at,reviewed_at")
    .eq("requester_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return json({
      error: error.message.includes("project_access_requests") || error.message.includes("does not exist") || error.message.includes("relation")
        ? "P10 SQL 尚未执行，请先执行 supabase-v536-security-ops.sql"
        : error.message,
    }, 500);
  }
  return json({ requests: data ?? [] });
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  if (!isAuthStorageConfigured()) return json({ error: "AUTH_STORAGE_NOT_CONFIGURED", request_id: requestId }, 503);
  const user = await getCurrentUser();
  if (!user) return json({ error: "请先登录", request_id: requestId }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: "请求JSON格式错误", request_id: requestId }, 400);
  }

  try {
    const projectName = optionalText(body.projectName, 200);
    const projectCode = optionalText(body.projectCode, 100);
    if (!projectName && !projectCode) throw new ProjectAccessRequestError("项目名称和项目编号至少填写一项");
    const level = accessLevel(body.accessLevel);
    const reason = text(body.reason, "申请原因", 1000);
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("project_access_requests")
      .insert({
        requester_id: user.id,
        requester_name: user.name || user.email || user.phone,
        requester_email: user.email,
        project_name: projectName,
        project_code: projectCode,
        access_level: level,
        reason,
        status: "pending",
        updated_at: new Date().toISOString(),
      })
      .select("id,project_name,project_code,access_level,reason,status,created_at")
      .single();
    if (error) {
      throw new ProjectAccessRequestError(error.message.includes("project_access_requests") || error.message.includes("does not exist") || error.message.includes("relation")
        ? "P10 SQL 尚未执行，请先执行 supabase-v536-security-ops.sql"
        : error.message, 500);
    }
    const audit = await writeOperationAudit({
      user,
      action: "project_access_request_create",
      resourceType: "project_access_request",
      resourceId: data.id,
      status: "succeeded",
      severity: "low",
      summary: `提交项目访问申请：${projectName || projectCode} / ${level}`,
      detail: { projectName, projectCode, accessLevel: level },
      requestId,
    });
    return json({ ok: true, request: data, audit, request_id: requestId }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "提交申请失败";
    await writeOperationAudit({
      user,
      action: "project_access_request_create",
      resourceType: "project_access_request",
      status: error instanceof ProjectAccessRequestError && error.status < 500 ? "rejected" : "failed",
      severity: "medium",
      summary: message,
      requestId,
    });
    return json({ error: message, request_id: requestId }, error instanceof ProjectAccessRequestError ? error.status : 500);
  }
}
