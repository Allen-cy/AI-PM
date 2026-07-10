import { FeishuActionClient } from "./actions.ts";
import type { FeishuConfig } from "./config.ts";

export type FeishuActionType = "message" | "task" | "calendar" | "document" | "base_record_update";
export type FeishuActionBody = Record<string, unknown>;

export interface ValidatedFeishuAction {
  actionType: FeishuActionType;
  idempotencyKey: string;
}

export interface FeishuActionPreview {
  actionType: FeishuActionType;
  targetType: "飞书消息" | "飞书任务" | "飞书日程" | "飞书文档" | "飞书多维表格记录";
  targetSummary: string;
  riskLevel: "low" | "medium" | "high";
  riskReasons: string[];
  fields: Array<{ label: string; value: string }>;
  confirmationRequired: true;
}

export class ActionValidationError extends Error {}

function text(body: FeishuActionBody, field: string, maximum = 3000): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximum) {
    throw new ActionValidationError(`${field} must be a non-empty string up to ${maximum} characters.`);
  }
  return value.trim();
}

function optionalText(body: FeishuActionBody, field: string, maximum = 5000): string | undefined {
  const value = body[field];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > maximum) {
    throw new ActionValidationError(`${field} must be a string up to ${maximum} characters.`);
  }
  return value.trim();
}

function stringArray(body: FeishuActionBody, field: string): string[] | undefined {
  const value = body[field];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > 50 || value.some(item => typeof item !== "string" || !item.trim())) {
    throw new ActionValidationError(`${field} must be an array of up to 50 IDs.`);
  }
  return value.map(item => item.trim());
}

const WRITABLE_BASE_TABLES = ["project", "milestone", "risk", "contract", "payment"] as const;
type WritableBaseTable = typeof WRITABLE_BASE_TABLES[number];

function baseTable(body: FeishuActionBody): WritableBaseTable {
  const value = text(body, "table_key", 32);
  if (!WRITABLE_BASE_TABLES.includes(value as WritableBaseTable)) {
    throw new ActionValidationError("table_key must be project, milestone, risk, contract, or payment.");
  }
  return value as WritableBaseTable;
}

function businessFieldPatch(body: FeishuActionBody, field: "fields" | "expected_fields"): Record<string, unknown> {
  const value = body[field];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ActionValidationError(`${field} must be a business field object.`);
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 20) {
    throw new ActionValidationError(`${field} must contain 1 to 20 fields.`);
  }
  for (const [name, cell] of entries) {
    if (!name.trim() || name.length > 80 || !/[\u3400-\u9fff]/u.test(name)) {
      throw new ActionValidationError(`${field} 中的业务字段必须使用中文名称。`);
    }
    if (cell === undefined) throw new ActionValidationError(`${field}.${name} cannot be undefined.`);
  }
  return Object.fromEntries(entries);
}

function validateBaseRecordUpdate(body: FeishuActionBody): void {
  baseTable(body);
  text(body, "record_id", 160);
  text(body, "business_update_draft_id", 80);
  text(body, "org_id", 80);
  text(body, "project_id", 80);
  const dataClass = text(body, "data_class", 32);
  if (!["production", "sample", "test", "diagnostic", "unclassified"].includes(dataClass)) {
    throw new ActionValidationError("data_class is invalid.");
  }
  const fields = businessFieldPatch(body, "fields");
  const expected = businessFieldPatch(body, "expected_fields");
  const nextKeys = Object.keys(fields).sort();
  const expectedKeys = Object.keys(expected).sort();
  if (JSON.stringify(nextKeys) !== JSON.stringify(expectedKeys)) {
    throw new ActionValidationError("fields and expected_fields must contain the same Chinese business fields.");
  }
}

function timestamp(body: FeishuActionBody, field: string): number | undefined {
  const value = body[field];
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new ActionValidationError(`${field} must be epoch milliseconds or ISO 8601.`);
  return parsed;
}

function short(value: string | undefined, maximum = 120): string {
  if (!value) return "未填写";
  return value.length > maximum ? `${value.slice(0, maximum)}...` : value;
}

function dateLabel(value: number | undefined): string {
  if (!value) return "未设置";
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

export function validateFeishuActionBody(body: FeishuActionBody): ValidatedFeishuAction {
  const idempotencyKey = text(body, "idempotency_key", 128);
  const actionType = text(body, "type", 32) as FeishuActionType;
  switch (actionType) {
    case "message":
      if (body.receive_id_type !== "chat_id" && body.receive_id_type !== "open_id") {
        throw new ActionValidationError("receive_id_type must be chat_id or open_id.");
      }
      text(body, "receive_id", 128);
      text(body, "text", 30_000);
      break;
    case "task":
      text(body, "summary");
      optionalText(body, "description");
      stringArray(body, "assignee_ids");
      timestamp(body, "due_at");
      break;
    case "calendar": {
      text(body, "summary");
      optionalText(body, "description");
      stringArray(body, "attendee_ids");
      optionalText(body, "timezone", 64);
      const startAt = timestamp(body, "start_at");
      const endAt = timestamp(body, "end_at");
      if (startAt === undefined || endAt === undefined || endAt <= startAt) {
        throw new ActionValidationError("start_at and end_at must define a valid time block.");
      }
      break;
    }
    case "document":
      text(body, "title");
      text(body, "summary", 5000);
      stringArray(body, "bullets");
      optionalText(body, "parent_token", 256);
      break;
    case "base_record_update":
      validateBaseRecordUpdate(body);
      break;
    default:
      throw new ActionValidationError("type must be message, task, calendar, document, or base_record_update.");
  }
  return { actionType, idempotencyKey };
}

export function buildFeishuActionPreview(body: FeishuActionBody): FeishuActionPreview {
  const { actionType } = validateFeishuActionBody(body);
  switch (actionType) {
    case "message": {
      const receiveIdType = body.receive_id_type === "open_id" ? "open_id" : "chat_id";
      const textContent = text(body, "text", 30_000);
      return {
        actionType,
        targetType: "飞书消息",
        targetSummary: `向 ${receiveIdType === "chat_id" ? "群聊" : "用户"} ${short(text(body, "receive_id", 128), 32)} 发送消息`,
        riskLevel: receiveIdType === "chat_id" ? "medium" : "low",
        riskReasons: receiveIdType === "chat_id" ? ["消息会发送到群聊，影响多人可见。"] : ["消息会发送给指定用户。"],
        fields: [
          { label: "接收对象类型", value: receiveIdType },
          { label: "接收对象", value: short(text(body, "receive_id", 128), 48) },
          { label: "消息摘要", value: short(textContent, 160) },
        ],
        confirmationRequired: true,
      };
    }
    case "task":
      return {
        actionType,
        targetType: "飞书任务",
        targetSummary: `创建任务：${short(text(body, "summary"), 80)}`,
        riskLevel: "medium",
        riskReasons: ["任务会进入飞书协同空间，可能影响责任人待办。"],
        fields: [
          { label: "任务标题", value: short(text(body, "summary"), 120) },
          { label: "任务说明", value: short(optionalText(body, "description"), 160) },
          { label: "责任人数量", value: String(stringArray(body, "assignee_ids")?.length ?? 0) },
          { label: "截止时间", value: dateLabel(timestamp(body, "due_at")) },
        ],
        confirmationRequired: true,
      };
    case "calendar": {
      const attendeeCount = stringArray(body, "attendee_ids")?.length ?? 0;
      return {
        actionType,
        targetType: "飞书日程",
        targetSummary: `创建日程：${short(text(body, "summary"), 80)}`,
        riskLevel: attendeeCount > 0 ? "medium" : "low",
        riskReasons: attendeeCount > 0 ? ["日程会邀请参与人并可能触发通知。"] : ["日程仅创建在应用主日历。"],
        fields: [
          { label: "日程标题", value: short(text(body, "summary"), 120) },
          { label: "开始时间", value: dateLabel(timestamp(body, "start_at")) },
          { label: "结束时间", value: dateLabel(timestamp(body, "end_at")) },
          { label: "参与人数", value: String(attendeeCount) },
        ],
        confirmationRequired: true,
      };
    }
    case "document":
      return {
        actionType,
        targetType: "飞书文档",
        targetSummary: `创建文档：${short(text(body, "title"), 80)}`,
        riskLevel: "medium",
        riskReasons: ["文档会在飞书中创建新协作资产，可能涉及权限授权。"],
        fields: [
          { label: "文档标题", value: short(text(body, "title"), 120) },
          { label: "文档摘要", value: short(text(body, "summary", 5000), 160) },
          { label: "要点数量", value: String(stringArray(body, "bullets")?.length ?? 0) },
          { label: "父目录", value: short(optionalText(body, "parent_token", 256), 48) },
        ],
        confirmationRequired: true,
      };
    case "base_record_update": {
      const tableKey = baseTable(body);
      const recordId = text(body, "record_id", 160);
      const fields = businessFieldPatch(body, "fields");
      const expected = businessFieldPatch(body, "expected_fields");
      return {
        actionType,
        targetType: "飞书多维表格记录",
        targetSummary: `更新 ${tableKey} 表记录 ${short(recordId, 48)}`,
        riskLevel: "high",
        riskReasons: ["将改写现有飞书业务主数据。", "执行前必须重新核对当前事实与数据空间。"],
        fields: [
          { label: "数据表", value: tableKey },
          { label: "记录ID", value: short(recordId, 80) },
          ...Object.entries(fields).map(([name, value]) => ({
            label: name,
            value: `${short(JSON.stringify(expected[name]) ?? String(expected[name]), 80)} → ${short(JSON.stringify(value) ?? String(value), 80)}`,
          })),
        ],
        confirmationRequired: true,
      };
    }
  }
}

export async function executeFeishuAction(config: FeishuConfig, body: FeishuActionBody): Promise<unknown> {
  const client = new FeishuActionClient(config);
  switch (body.type) {
    case "message": {
      const receiveIdType = body.receive_id_type;
      if (receiveIdType !== "chat_id" && receiveIdType !== "open_id") {
        throw new ActionValidationError("receive_id_type must be chat_id or open_id.");
      }
      return client.sendTextMessage({
        receiveId: text(body, "receive_id", 128),
        receiveIdType,
        text: text(body, "text", 30_000),
        idempotencyKey: text(body, "idempotency_key", 128),
      });
    }
    case "task":
      return client.createTask({
        summary: text(body, "summary"),
        description: optionalText(body, "description"),
        assigneeIds: stringArray(body, "assignee_ids"),
        dueAt: timestamp(body, "due_at"),
        isAllDay: body.is_all_day === true,
        idempotencyKey: text(body, "idempotency_key", 128),
      });
    case "calendar": {
      const startAt = timestamp(body, "start_at");
      const endAt = timestamp(body, "end_at");
      if (startAt === undefined || endAt === undefined) throw new ActionValidationError("start_at and end_at are required.");
      return client.createCalendarEvent({
        summary: text(body, "summary"),
        description: optionalText(body, "description"),
        startAt,
        endAt,
        attendeeIds: stringArray(body, "attendee_ids"),
        timezone: optionalText(body, "timezone", 64) ?? "Asia/Shanghai",
      });
    }
    case "document":
      return client.createDocument({
        title: text(body, "title"),
        summary: text(body, "summary", 5000),
        bullets: stringArray(body, "bullets"),
        parentToken: optionalText(body, "parent_token", 256) ?? config.documentParentToken,
      });
    case "base_record_update": {
      throw new ActionValidationError("Base记录更新必须经过业务变化草稿、二次确认和同步流水的受控业务写回流程。");
    }
    default:
      throw new ActionValidationError("type must be message, task, calendar, document, or base_record_update.");
  }
}
