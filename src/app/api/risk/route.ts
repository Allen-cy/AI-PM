import { NextRequest, NextResponse } from "next/server";
import {
  deleteRiskFromRepository,
  listRisks,
  saveRiskToRepository,
  saveRisksToRepository,
  transitionRisk,
  type RiskTransitionInput,
} from "@/lib/risk-repository";
import type { Risk } from "@/lib/risk";
import { authorizeRiskRequest, type RiskAccessFailure } from "@/features/risk/access";

function errorResponse(error: unknown, status = 500) {
  const errorCode = error && typeof error === "object" && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error);
  if (message === "PROJECT_OUTSIDE_CONTEXT") status = 403;
  if (message === "PROJECT_ID_REQUIRED") status = 400;
  if (/VERSION_CONFLICT|IDEMPOTENCY_KEY_REUSED|RISK_(?:ALREADY_)?ARCHIVED/.test(message)) status = 409;
  if (errorCode === "23505" || /duplicate key|unique constraint/i.test(message)) status = 409;
  if (/EXPECTED_VERSION_REQUIRED|IDEMPOTENCY_KEY_REQUIRED/.test(message)) status = 400;
  if (/RISK_NOT_FOUND_OR_OUTSIDE_SCOPE|风险不存在或已被删除/.test(message)) status = 404;
  if (message === "BATCH_LIMIT_EXCEEDED") status = 413;
  if (message === "BATCH_SINGLE_PROJECT_REQUIRED") status = 400;
  const migrationHint = /column|relation|schema|risk_workflow_events|priority_score|workflow_step|risk_operation_receipts|(?:upsert|transition|archive)_risk_v61|PGRST202/i.test(`${message} ${errorCode}`)
    ? "请执行 supabase/migrations/20260711140000_v61_security_gate.sql 与 20260711150000_v61_risk_scope_quarantine.sql 完成 V6.1 数据库升级。"
    : undefined;
  return NextResponse.json({ error: message, migrationHint }, { status });
}

function accessError(access: RiskAccessFailure) {
  return NextResponse.json({ error: access.error, detail: access.detail }, {
    status: access.status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  try {
    const access = await authorizeRiskRequest(request, "read");
    if (!access.ok) return accessError(access);
    const result = await listRisks(access.scope, { limit: request.nextUrl.searchParams.get("limit") });
    return NextResponse.json({ ...result, context: access.scope, data_class: access.scope.dataClass });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await authorizeRiskRequest(request, "create");
    if (!access.ok) return accessError(access);
    const body = await request.json() as {
      risk?: Risk;
      risks?: Risk[];
      expected_version?: number;
      idempotency_key?: string;
    };
    const control = {
      expectedVersion: typeof body.expected_version === "number" ? body.expected_version : Number.NaN,
      idempotencyKey: String(body.idempotency_key || ""),
    };
    if (Array.isArray(body.risks)) {
      const risks = await saveRisksToRepository(body.risks, access.scope, control);
      return NextResponse.json({ risks });
    }
    if (!body.risk) {
      return NextResponse.json({ error: "缺少risk参数" }, { status: 400 });
    }
    const risk = await saveRiskToRepository(body.risk, access.scope, control);
    return NextResponse.json({ risk });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await authorizeRiskRequest(request, "transition");
    if (!access.ok) return accessError(access);
    const body = await request.json() as Partial<RiskTransitionInput> & { expected_version?: number; idempotency_key?: string };
    if (!body.id || !body.toStatus || !Number.isInteger(body.expected_version) || !body.idempotency_key) {
      return NextResponse.json({ error: "缺少id、toStatus、expected_version或idempotency_key参数" }, { status: 400 });
    }
    const result = await transitionRisk({
      ...body,
      expectedVersion: Number(body.expected_version),
      idempotencyKey: body.idempotency_key,
    } as RiskTransitionInput, access.scope);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const access = await authorizeRiskRequest(request, "delete");
    if (!access.ok) return accessError(access);
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少id参数" }, { status: 400 });
    const rawExpectedVersion = request.nextUrl.searchParams.get("expected_version");
    const expectedVersion = rawExpectedVersion === null ? Number.NaN : Number(rawExpectedVersion);
    const idempotencyKey = request.nextUrl.searchParams.get("idempotency_key") || "";
    if (!Number.isInteger(expectedVersion) || !idempotencyKey) {
      return NextResponse.json({ error: "缺少expected_version或idempotency_key参数" }, { status: 400 });
    }
    const risk = await deleteRiskFromRepository({
      id,
      expectedVersion,
      idempotencyKey,
      reason: request.nextUrl.searchParams.get("reason") || undefined,
    }, access.scope);
    return NextResponse.json({ ok: true, risk });
  } catch (error) {
    return errorResponse(error);
  }
}
