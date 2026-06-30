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

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  const migrationHint = /column|relation|schema|constraint|risk_workflow_events|priority_score|workflow_step/i.test(message)
    ? "请先在Supabase SQL Editor执行 supabase-risk-v521.sql。"
    : undefined;
  return NextResponse.json({ error: message, migrationHint }, { status });
}

export async function GET() {
  try {
    const result = await listRisks();
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { risk?: Risk; risks?: Risk[] };
    if (Array.isArray(body.risks)) {
      const risks = await saveRisksToRepository(body.risks);
      return NextResponse.json({ risks });
    }
    if (!body.risk) {
      return NextResponse.json({ error: "缺少risk参数" }, { status: 400 });
    }
    const risk = await saveRiskToRepository(body.risk);
    return NextResponse.json({ risk });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as Partial<RiskTransitionInput>;
    if (!body.id || !body.toStatus) {
      return NextResponse.json({ error: "缺少id或toStatus参数" }, { status: 400 });
    }
    const result = await transitionRisk(body as RiskTransitionInput);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "缺少id参数" }, { status: 400 });
    await deleteRiskFromRepository(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
