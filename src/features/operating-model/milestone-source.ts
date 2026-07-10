import { getAuthSupabase, isAuthStorageConfigured } from "../auth/server.ts";
import { FeishuBaseClient } from "../feishu/client.ts";
import { readFeishuConfig } from "../feishu/config.ts";
import type { ParsedMilestoneSignalRequest } from "./signals.ts";
import { parseVerifiedFeishuMilestone } from "./milestone-source-parser.ts";

export interface VerifiedMilestoneSourceResult {
  status: "succeeded" | "not_configured" | "not_found" | "conflict" | "failed";
  data?: ParsedMilestoneSignalRequest;
  warning?: string;
}

export async function loadVerifiedMilestoneSignalSource(input: {
  projectId: string;
  sourceRecordId: string;
}): Promise<VerifiedMilestoneSourceResult> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const config = readFeishuConfig();
  if (!config?.tables.milestone) return { status: "not_configured", warning: "飞书里程碑表尚未配置。" };
  const { data: project, error } = await getAuthSupabase().from("projects")
    .select("id,org_id,oa_no,data_class,source_system")
    .eq("id", input.projectId)
    .maybeSingle();
  if (error) return { status: "failed", warning: error.message };
  if (!project) return { status: "not_found", warning: "项目不存在。" };
  if (project.source_system !== "feishu") return { status: "conflict", warning: "S1只接受已完成稳定身份映射的飞书项目。" };
  try {
    const record = await new FeishuBaseClient(config).getRecord("milestone", input.sourceRecordId);
    return {
      status: "succeeded",
      data: parseVerifiedFeishuMilestone({
        record,
        project: {
          id: project.id,
          orgId: project.org_id,
          code: project.oa_no,
          dataClass: String(project.data_class || "unclassified") as ParsedMilestoneSignalRequest["dataClass"],
        },
      }),
    };
  } catch (error) {
    return { status: "conflict", warning: error instanceof Error ? error.message : "飞书里程碑事实校验失败。" };
  }
}
