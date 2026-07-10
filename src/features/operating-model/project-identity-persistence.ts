import { createHash } from "node:crypto";
import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "../auth/server.ts";
import { FeishuBaseClient } from "../feishu/client.ts";
import { readFeishuConfig } from "../feishu/config.ts";
import { writeOperationAudit } from "../security/repository.ts";
import { parseFeishuAmount } from "./feishu-value.ts";
import { normalizeFeishuProjectIdentityCandidate, type FeishuProjectIdentityCandidate } from "./feishu-project.ts";
import {
  planProjectIdentityBackfill,
  type ExistingProjectIdentityMapping,
  type ProjectIdentityBackfillPlan,
} from "./project-identity-backfill.ts";

export interface ProjectIdentityBackfillPreview {
  orgId: string;
  sourceContainerId: string;
  plan: ProjectIdentityBackfillPlan;
  invalidRecords: Array<{ sourceRecordId: string; reason: string }>;
}

export function buildProjectIdentityBackfillEntries(preview: ProjectIdentityBackfillPreview) {
  return preview.plan.entries.map(entry => {
    const fields = entry.candidate.fields;
    const progressValue = Number(scalar(fields["当前进度"] ?? fields.progress) ?? 0);
    const progress = Math.max(0, Math.min(100, Math.round(progressValue > 1 ? progressValue : progressValue * 100)));
    return {
      action: entry.action,
      reason: entry.reason,
      project_id: entry.projectId,
      source_type: entry.candidate.sourceType,
      source_container_id: entry.candidate.sourceContainerId,
      source_record_id: entry.candidate.sourceRecordId,
      external_project_code: entry.action === "reuse" && entry.reason !== "外部记录已有稳定映射。" ? null : entry.candidate.projectCode,
      project_name: entry.candidate.projectName,
      data_class: entry.candidate.dataClass,
      project: {
        status: status(fields["项目状态"] ?? fields["当前状态"]), progress, project_level: level(fields["项目等级"]),
        is_key_project: /是|重点|true|yes|1/i.test(String(fields["重点项目标记"] ?? fields["重点项目"] ?? "")),
        contract_amount: parseFeishuAmount(scalar(fields["合同金额"])),
        collection_amount: parseFeishuAmount(scalar(fields["已回款金额"] ?? fields["回款额"])) ?? 0,
        receivable: parseFeishuAmount(scalar(fields["应收金额"] ?? fields["应催账款"])) ?? 0,
      },
    };
  });
}

function scalar(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const first = value[0];
  if (first && typeof first === "object" && "text" in first) return (first as { text: unknown }).text;
  if (first && typeof first === "object" && "name" in first) return (first as { name: unknown }).name;
  return first;
}

function status(value: unknown): "active" | "completed" | "suspended" | "cancelled" {
  const text = String(scalar(value) ?? "").toLowerCase();
  if (/完成|结项|closed|completed/.test(text)) return "completed";
  if (/暂停|suspend/.test(text)) return "suspended";
  if (/取消|终止|cancel/.test(text)) return "cancelled";
  return "active";
}

function level(value: unknown): "S" | "A" | "B" | "C" | null {
  const text = String(scalar(value) ?? "").trim().toUpperCase();
  return ["S", "A", "B", "C"].includes(text) ? text as "S" | "A" | "B" | "C" : null;
}

export async function previewFeishuProjectIdentityBackfill(): Promise<{
  status: "succeeded" | "not_configured" | "failed";
  preview?: ProjectIdentityBackfillPreview;
  warning?: string;
}> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const config = readFeishuConfig();
  const tableId = config?.tables.project;
  if (!config || !tableId) return { status: "not_configured", warning: "全局飞书项目台账未配置。" };
  try {
    const supabase = getAuthSupabase();
    const { data: org, error: orgError } = await supabase.from("organizations").select("id").eq("org_code", "DEFAULT").maybeSingle();
    if (orgError || !org) return { status: "not_configured", warning: orgError?.message || "P17默认组织不存在。" };
    const sourceContainerId = createHash("sha256").update(`${config.baseToken}:${tableId}`).digest("hex");
    const records = await new FeishuBaseClient(config).listRecords("project", 1000);
    const candidates: FeishuProjectIdentityCandidate[] = [];
    const invalidRecords: Array<{ sourceRecordId: string; reason: string }> = [];
    for (const record of records) {
      try {
        candidates.push(normalizeFeishuProjectIdentityCandidate(record, sourceContainerId));
      } catch (error) {
        invalidRecords.push({ sourceRecordId: record.recordId, reason: error instanceof Error ? error.message : "记录格式错误" });
      }
    }
    const [mappingResult, projectResult] = await Promise.all([
      supabase.from("project_identity_mappings")
        .select("project_id,org_id,source_type,source_container_id,source_record_id,external_project_code")
        .eq("org_id", org.id),
      supabase.from("projects").select("id,org_id,oa_no,source_record_id").eq("org_id", org.id),
    ]);
    const { data: mappings, error: mappingError } = mappingResult;
    if (mappingError) return { status: "not_configured", warning: mappingError.message };
    if (projectResult.error) return { status: "not_configured", warning: projectResult.error.message };
    const existing: ExistingProjectIdentityMapping[] = (mappings ?? []).filter(row => row.project_id).map(row => ({
      projectId: row.project_id,
      orgId: row.org_id,
      sourceType: row.source_type,
      sourceContainerId: row.source_container_id,
      sourceRecordId: row.source_record_id,
      externalProjectCode: row.external_project_code,
    }));
    for (const project of projectResult.data ?? []) {
      if (!project.source_record_id && !project.oa_no) continue;
      existing.push({
        projectId: project.id,
        orgId: project.org_id,
        sourceType: "feishu",
        sourceContainerId,
        sourceRecordId: project.source_record_id || `legacy-project:${project.id}`,
        externalProjectCode: project.oa_no,
      });
    }
    return {
      status: "succeeded",
      preview: {
        orgId: org.id,
        sourceContainerId,
        plan: planProjectIdentityBackfill(candidates, existing),
        invalidRecords,
      },
    };
  } catch (error) {
    return { status: "failed", warning: error instanceof Error ? error.message : "项目身份盘点失败。" };
  }
}

export async function applyFeishuProjectIdentityBackfill(input: {
  actor: AppUser;
  requestId: string;
}): Promise<{
  status: "succeeded" | "not_configured" | "failed";
  summary?: ProjectIdentityBackfillPlan["summary"] & { invalid: number };
  warning?: string;
}> {
  const previewResult = await previewFeishuProjectIdentityBackfill();
  if (previewResult.status !== "succeeded" || !previewResult.preview) return previewResult;
  const { preview } = previewResult;
  const supabase = getAuthSupabase();
  try {
    const entries = buildProjectIdentityBackfillEntries(preview);
    const { error } = await supabase.rpc("apply_project_identity_backfill_tx", {
      p_org_id: preview.orgId,
      p_entries: entries,
      p_actor_user_id: input.actor.id,
    });
    if (error) throw error;
    await writeOperationAudit({
      user: input.actor,
      action: "project_identity_backfill",
      resourceType: "project_identity",
      status: "succeeded",
      severity: preview.plan.summary.conflict > 0 ? "medium" : "low",
      summary: `项目身份回填：创建${preview.plan.summary.create}，复用${preview.plan.summary.reuse}，冲突${preview.plan.summary.conflict}`,
      detail: { ...preview.plan.summary, invalid: preview.invalidRecords.length },
      requestId: input.requestId,
    });
    return { status: "succeeded", summary: { ...preview.plan.summary, invalid: preview.invalidRecords.length } };
  } catch (error) {
    return { status: "failed", warning: error instanceof Error ? error.message : "项目身份回填失败。" };
  }
}
