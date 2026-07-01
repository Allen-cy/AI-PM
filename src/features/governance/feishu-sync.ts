import { FeishuApiError, FeishuBaseClient } from "../feishu/client.ts";
import { getEffectiveFeishuConfig } from "../feishu/user-config.ts";
import type { GovernanceEventRecord, GovernanceInstanceRecord } from "./model.ts";

export type GovernanceFeishuSyncResult =
  | { status: "succeeded"; recordId: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string; code?: string };

export async function syncGovernanceEventToFeishu(input: {
  instance: GovernanceInstanceRecord;
  event?: GovernanceEventRecord;
  requestId: string;
}): Promise<GovernanceFeishuSyncResult> {
  const effective = await getEffectiveFeishuConfig();
  if (!effective.config) return { status: "skipped", reason: effective.setupHint || "飞书未配置。" };
  if (!effective.config.tables.syncLedger) return { status: "skipped", reason: "飞书同步账本表未配置。" };

  try {
    const client = new FeishuBaseClient(effective.config);
    const result = await client.createRecord("syncLedger", {
      trace_id: input.requestId,
      target_system: "ai-pmo-governance",
      producer: "ai-pmo-system",
      confidentiality: "internal",
      event_type: "governance.workflow.transition",
      subject_id: input.instance.id,
      subject_type: "governance_process_instance",
      source_revision: "5.2.9",
      idempotency_key: `governance:${input.event?.id || input.instance.id}:${input.instance.state}`,
      "事件ID": input.requestId,
      "处理状态": "succeeded",
      "尝试次数": 1,
      "错误信息": "",
      "流程名称": input.instance.workflowName,
      "项目名称": input.instance.projectName,
      "当前状态": input.instance.state,
      "责任人": input.instance.owner,
      "审批人": input.instance.approver,
      "动作类型": input.event?.eventType || "created",
    });
    return { status: "succeeded", recordId: result.recordId };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "治理动作回写飞书失败。",
      code: error instanceof FeishuApiError ? error.code : undefined,
    };
  }
}
