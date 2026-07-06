import { FeishuActionClient } from "./actions.ts";
import type { FeishuConfig } from "./config.ts";

export type FeishuActionType = "message" | "task" | "calendar" | "document";
export type FeishuActionBody = Record<string, unknown>;

export interface ValidatedFeishuAction {
  actionType: FeishuActionType;
  idempotencyKey: string;
}

export interface FeishuActionPreview {
  actionType: FeishuActionType;
  targetType: "飞书消息" | "飞书任务" | "飞书日程" | "飞书文档";
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
    default:
      throw new ActionValidationError("type must be message, task, calendar, or document.");
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
    default:
      throw new ActionValidationError("type must be message, task, calendar, or document.");
  }
}
