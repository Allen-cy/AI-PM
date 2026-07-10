import { FeishuBaseClient, type FeishuRecordItem } from "../feishu/client.ts";
import type { FeishuConfig, FeishuTableKey } from "../feishu/config.ts";
import type { PersistenceResult } from "../operating-model/persistence.ts";
import type { AssistantChangeDraftInput } from "./change-draft.ts";
import { loadAssistantActionFacts } from "./repository.ts";
import {
  matchFeishuRecordToProject,
  readAssistantEditableFacts,
  type AssistantProjectIdentity,
} from "./snapshot.ts";

const TABLE_BY_SOURCE: Partial<Record<AssistantChangeDraftInput["sourceType"], FeishuTableKey>> = {
  project: "project",
  milestone: "milestone",
  risk: "risk",
  contract: "contract",
  payment: "payment",
};

export async function loadAssistantCurrentFacts(input: {
  draft: AssistantChangeDraftInput;
  identities: AssistantProjectIdentity[];
  feishuConfig: FeishuConfig | null;
}): Promise<PersistenceResult<Record<string, unknown>>> {
  if (input.draft.sourceType === "action") {
    return loadAssistantActionFacts({ actionId: input.draft.sourceRecordId, projectId: input.draft.projectId });
  }
  const table = TABLE_BY_SOURCE[input.draft.sourceType];
  if (!table || !input.feishuConfig?.tables[table]) return { status: "not_configured", warning: "对应飞书业务表尚未配置。" };
  let record: FeishuRecordItem;
  try {
    record = await new FeishuBaseClient(input.feishuConfig).getRecord(table, input.draft.sourceRecordId);
  } catch {
    return { status: "failed", warning: "无法重新读取飞书当前事实，未创建或确认变更草稿。" };
  }
  const identity = matchFeishuRecordToProject(record, input.identities);
  if (!identity || identity.projectId !== input.draft.projectId) {
    return { status: "conflict", warning: "业务记录不能通过稳定标识关联到所选项目，系统拒绝按名称猜测。" };
  }
  return { status: "succeeded", data: readAssistantEditableFacts(input.draft.role, input.draft.sourceType, record.fields) };
}
