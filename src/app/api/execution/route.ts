import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { buildExecutionSummaryEvidence, withAuditResult } from "@/features/ai/evidence";
import { persistAiEvidence } from "@/features/ai/evidence-repository";
import { getAuthSupabase } from "@/features/auth/server";
import { FeishuBaseClient } from "@/features/feishu/client";
import { getEffectiveFeishuConfig } from "@/features/feishu/user-config";
import { parseProjectControlWriteContract } from "@/features/project-control/contracts";
import { loadProjectControlSnapshot } from "@/features/project-control/repository";
import { resolveProjectControlAccess } from "@/features/project-control/server";
import type { ProjectControlSnapshot } from "@/features/project-control/snapshot";
import { llmComplete } from "@/lib/llm";

export const runtime = "nodejs";

type Raw = Record<string, unknown>;

function json(body: unknown, status: number, requestId: string) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

function text(value: unknown): string { return String(value ?? "").trim(); }
function number(value: unknown): number { return Number.isFinite(Number(value)) ? Number(value) : 0; }
function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function taskStatus(value: unknown): "pending" | "in-progress" | "completed" | "blocked" {
  const status = text(value).toLowerCase();
  if (["completed", "done", "closed", "已完成"].includes(status)) return "completed";
  if (["blocked", "阻塞"].includes(status)) return "blocked";
  if (["in_progress", "in-progress", "doing", "进行中"].includes(status)) return "in-progress";
  return "pending";
}

function normalized(snapshot: ProjectControlSnapshot) {
  const tasks = snapshot.execution.tasks.map(row => ({
    id: text(row.id),
    name: text(row.name || row.title) || "未命名任务",
    assignee: text(row.assignee || row.owner) || "待分配",
    status: taskStatus(row.status),
    priority: (["high", "medium", "low"].includes(text(row.priority).toLowerCase()) ? text(row.priority).toLowerCase() : "medium") as "high" | "medium" | "low",
    dueDate: text(row.plan_end || row.end_date || row.due_date).slice(0, 10),
    progress: Math.max(0, Math.min(100, number(row.percent_complete || row.progress))),
    blockedReason: text(row.blocked_reason || row.blockedReason) || undefined,
    sourceRecordId: text(row.source_record_id) || null,
    version: number(row.version),
  }));
  const deliverables = snapshot.execution.milestones.map(row => ({
    id: text(row.id),
    name: text(row.milestone_name || row.name) || "未命名里程碑",
    status: (["approved", "accepted", "completed", "已完成"].includes(text(row.status).toLowerCase()) ? "accepted" : ["rejected", "驳回"].includes(text(row.status).toLowerCase()) ? "rejected" : number(row.progress) >= 100 ? "ready" : number(row.progress) > 0 ? "in-progress" : "pending") as "pending" | "in-progress" | "ready" | "accepted" | "rejected",
    sourceRecordId: text(row.source_record_id) || null,
    version: number(row.version),
  }));
  const changeRequests = snapshot.governance.changes.map(row => ({
    id: text(row.id),
    description: text(row.title || row.reason),
    impact: text(row.impact_scope) || "影响待评估",
    requestor: text(row.created_by_name || row.owner) || "待确认",
    status: (["approved", "rejected"].includes(text(row.status)) ? text(row.status) : "pending") as "pending" | "approved" | "rejected",
    approvedBy: text(row.approver) || undefined,
    createdAt: text(row.created_at),
    version: number(row.version),
  }));
  return { tasks, deliverables, changeRequests };
}

function deterministicSummary(snapshot: ProjectControlSnapshot) {
  const facts = normalized(snapshot);
  const blocked = facts.tasks.filter(item => item.status === "blocked");
  const pendingDeliverables = facts.deliverables.filter(item => !["accepted"].includes(item.status));
  return {
    summary: `当前项目共有${facts.tasks.length}项任务、${facts.deliverables.length}个里程碑；${blocked.length}项任务阻塞，${pendingDeliverables.length}个里程碑尚未完成验收。`,
    risks: snapshot.exceptions.slice(0, 5).map(item => `${item.title}（${item.status || "待处理"}）`),
    recommendations: snapshot.exceptions.slice(0, 5).map(item => `${item.owner || "项目经理"}在${item.deadline || "尽快"}前处理：${item.title}`),
  };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const access = await resolveProjectControlAccess(request);
  if (!access.ok) return json({ status: "failed", request_id: requestId, error: access.error, detail: access.detail }, access.status, requestId);
  try {
    const snapshot = await loadProjectControlSnapshot({ orgId: access.orgId, projectId: access.projectId, dataClass: access.dataClass });
    const facts = normalized(snapshot);
    return json({
      status: "succeeded",
      request_id: requestId,
      context: { org_id: access.orgId, project_id: access.projectId, business_role: access.businessRole },
      data_class: access.dataClass,
      project: snapshot.project,
      tasks: facts.tasks,
      deliverables: facts.deliverables,
      change_requests: facts.changeRequests,
      exceptions: snapshot.exceptions,
      source: { ...snapshot.source, detail: `飞书事实经Supabase镜像：任务${facts.tasks.length}条、里程碑${facts.deliverables.length}条；人工治理变更${facts.changeRequests.length}条。` },
      data: snapshot,
    }, 200, requestId);
  } catch (error) {
    return json({ status: "failed", request_id: requestId, error: "EXECUTION_SOURCE_UNAVAILABLE", detail: error instanceof Error ? error.message : "真实项目数据读取失败。", source: { type: "supabase_mirror", fallback_used: false } }, 503, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let body: Raw;
  try { body = await request.json() as Raw; }
  catch { return json({ status: "failed", request_id: requestId, error: "INVALID_JSON" }, 400, requestId); }

  let contract;
  try { contract = parseProjectControlWriteContract(body); }
  catch (error) { return json({ status: "failed", request_id: requestId, error: "PROJECT_CONTROL_CONTRACT_INVALID", detail: error instanceof Error ? error.message : "写入契约错误。" }, 400, requestId); }
  const access = await resolveProjectControlAccess(request, body);
  if (!access.ok) return json({ status: "failed", request_id: requestId, error: access.error, detail: access.detail }, access.status, requestId);
  if (contract.projectId !== access.projectId || contract.businessRole !== access.businessRole || contract.dataClass !== access.dataClass) {
    return json({ status: "failed", request_id: requestId, error: "PROJECT_CONTROL_SCOPE_MISMATCH" }, 409, requestId);
  }

  try {
    const snapshot = await loadProjectControlSnapshot({ orgId: access.orgId, projectId: access.projectId, dataClass: access.dataClass });
    const project = { ...snapshot.project, dataClass: snapshot.project.data_class };
    const dataClass = contract.dataClass;
    if (dataClass !== project.dataClass || !(dataClass === project.dataClass)) {
      return json({ status: "failed", request_id: requestId, error: "DATA_CLASS_MISMATCH" }, 409, requestId);
    }
    const operation = text(body.operation || "generate_summary");

    if (operation === "generate_summary") {
      const fallback = deterministicSummary(snapshot);
      let output = fallback;
      let model = "deterministic-project-snapshot";
      let evidenceStatus: "generated" | "fallback" = "fallback";
      try {
        const result = await llmComplete("execution", "你是项目执行分析助手。只能依据给定项目快照，返回JSON：{summary:string,risks:string[],recommendations:string[]}。", JSON.stringify({ project: snapshot.project, health: snapshot.health, execution: snapshot.execution, governance: snapshot.governance, quality: snapshot.quality, exceptions: snapshot.exceptions }));
        const match = result.content.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(match?.[0] ?? result.content) as typeof fallback;
        if (typeof parsed.summary === "string" && Array.isArray(parsed.risks) && Array.isArray(parsed.recommendations)) {
          output = parsed; model = result.model; evidenceStatus = "generated";
        }
      } catch { /* deterministic facts remain available */ }
      const facts = normalized(snapshot);
      const evidence = buildExecutionSummaryEvidence({
        projectId: project.id,
        taskCount: facts.tasks.length,
        blockedTaskCount: facts.tasks.filter(item => item.status === "blocked").length,
        deliverableCount: facts.deliverables.length,
        pendingDeliverableCount: facts.deliverables.filter(item => item.status !== "accepted").length,
        model,
        status: evidenceStatus,
      });
      const audit = await persistAiEvidence({ evidence, user: access.user, requestId, metadata: { route: "/api/execution", source: "governed_project_snapshot", project_id: project.id } });
      return json({ status: "succeeded", request_id: requestId, ...output, evidence: withAuditResult(evidence, audit.status === "succeeded" ? { status: "succeeded", id: audit.id } : { status: audit.status, warning: audit.warning }), source: snapshot.source }, 200, requestId);
    }

    if (!new Set(["create_task", "create_deliverable"]).has(operation)) return json({ status: "failed", request_id: requestId, error: "EXECUTION_OPERATION_INVALID" }, 400, requestId);
    if (contract.expectedVersion !== 0) return json({ status: "failed", request_id: requestId, error: "VERSION_CONFLICT" }, 409, requestId);
    const payloadHash = hash(body);
    const { data: begin, error: beginError } = await getAuthSupabase().rpc("begin_v633_project_control_operation", {
      p_org_id: access.orgId, p_project_id: project.id, p_data_class: dataClass, p_operation: operation,
      p_idempotency_key: contract.idempotencyKey, p_request_hash: payloadHash, p_actor_user_id: access.user.id, p_request_id: requestId,
    });
    if (beginError) throw new Error(beginError.message);
    const receipt = begin as { receipt_id?: string; status?: string; result?: Raw; replayed?: boolean };
    if (receipt.replayed && receipt.result) return json({ ...receipt.result, replayed: true, request_id: requestId }, 200, requestId);
    if (receipt.status !== "running" || !receipt.receipt_id) return json({ status: "failed", request_id: requestId, error: "OPERATION_ALREADY_RUNNING" }, 409, requestId);

    try {
      const effective = await getEffectiveFeishuConfig();
      const tableKey = operation === "create_task" ? "task" : "milestone";
      if (!effective.config?.tables[tableKey]) throw new Error(tableKey === "task" ? "FEISHU_TASK_TABLE_NOT_CONFIGURED" : "FEISHU_MILESTONE_TABLE_NOT_CONFIGURED");
      const name = text(body.name);
      if (!name) throw new Error("NAME_REQUIRED");
      const fields: Raw = {
        "关联项目UUID": project.id,
        "关联项目编号": project.code || undefined,
        "项目名称": project.name,
        "数据分类": project.dataClass,
        [operation === "create_task" ? "任务名称" : "里程碑名称"]: name,
        [operation === "create_task" ? "任务状态" : "里程碑状态"]: "未开始",
        "负责人": text(body.owner) || undefined,
      };
      const due = text(body.due_date);
      if (due) fields[operation === "create_task" ? "计划结束日期" : "预测日期"] = new Date(`${due}T00:00:00+08:00`).getTime();
      const record = await new FeishuBaseClient(effective.config).createRecord(tableKey, fields);
      const result = { status: "succeeded", record_id: record.recordId, source: { type: "feishu", mirrored_by: "next_reconcile" } };
      const { error: finishError } = await getAuthSupabase().rpc("finish_v633_project_control_operation", { p_receipt_id: receipt.receipt_id, p_status: "succeeded", p_result: result, p_error: null });
      if (finishError) throw new Error(finishError.message);
      return json({ ...result, request_id: requestId }, 201, requestId);
    } catch (error) {
      await getAuthSupabase().rpc("finish_v633_project_control_operation", { p_receipt_id: receipt.receipt_id, p_status: "failed", p_result: null, p_error: error instanceof Error ? error.message : "EXECUTION_WRITE_FAILED" });
      throw error;
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "执行与交付请求失败。";
    return json({ status: "failed", request_id: requestId, error: detail.includes("VERSION_CONFLICT") ? "VERSION_CONFLICT" : detail.includes("IDEMPOTENCY") ? "IDEMPOTENCY_CONFLICT" : "EXECUTION_REQUEST_FAILED", detail, source: { fallback_used: false } }, detail.includes("CONFLICT") ? 409 : 500, requestId);
  }
}
