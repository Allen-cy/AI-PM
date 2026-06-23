import type { FeishuConfig } from './config.ts';
import { FeishuApiError } from './client.ts';

interface FeishuEnvelope<T> {
  code: number;
  msg?: string;
  data?: T;
}

interface TenantTokenResponse {
  code: number;
  tenant_access_token?: string;
  expire?: number;
}

export interface SendTextMessageInput {
  receiveId: string;
  receiveIdType: 'chat_id' | 'open_id';
  text: string;
  idempotencyKey: string;
}

export interface CreateTaskInput {
  summary: string;
  description?: string;
  assigneeIds?: string[];
  dueAt?: number;
  isAllDay?: boolean;
  idempotencyKey: string;
}

export interface CreateCalendarEventInput {
  summary: string;
  description?: string;
  startAt: number;
  endAt: number;
  attendeeIds?: string[];
  timezone?: string;
}

export interface CreateDocumentInput {
  title: string;
  summary: string;
  bullets?: string[];
  parentToken?: string;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function attendee(id: string): { type: 'user' | 'group' | 'resource'; user_id: string } {
  if (id.startsWith('oc')) return { type: 'group', user_id: id };
  if (id.startsWith('omm')) return { type: 'resource', user_id: id };
  return { type: 'user', user_id: id };
}

export class FeishuActionClient {
  private tenantToken?: { value: string; expiresAt: number };

  constructor(
    private readonly config: FeishuConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async getTenantToken(): Promise<string> {
    if (this.tenantToken && this.tenantToken.expiresAt > Date.now()) return this.tenantToken.value;
    const response = await this.fetcher(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: this.config.appId, app_secret: this.config.appSecret }),
      },
    );
    if (!response.ok) throw new FeishuApiError('Feishu authentication failed.', 'FEISHU_AUTH_HTTP_ERROR');
    const payload = await response.json() as TenantTokenResponse;
    if (payload.code !== 0 || !payload.tenant_access_token) {
      throw new FeishuApiError('Feishu application identity is not authorized.', `FEISHU_AUTH_${payload.code}`);
    }
    const ttl = Math.max(60, (payload.expire ?? 7200) - 60);
    this.tenantToken = {
      value: payload.tenant_access_token,
      expiresAt: Date.now() + ttl * 1000,
    };
    return payload.tenant_access_token;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getTenantToken();
    const response = await this.fetcher(`https://open.feishu.cn${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) throw new FeishuApiError('Feishu action request failed.', 'FEISHU_ACTION_HTTP_ERROR');
    const payload = await response.json() as FeishuEnvelope<T>;
    if (payload.code !== 0 || !payload.data) {
      throw new FeishuApiError('Feishu action was rejected.', `FEISHU_ACTION_${payload.code}`);
    }
    return payload.data;
  }

  async sendTextMessage(input: SendTextMessageInput): Promise<{ messageId: string; chatId?: string }> {
    const data = await this.request<{ message_id: string; chat_id?: string }>(
      `/open-apis/im/v1/messages?receive_id_type=${input.receiveIdType}`,
      {
        method: 'POST',
        body: JSON.stringify({
          receive_id: input.receiveId,
          msg_type: 'text',
          content: JSON.stringify({ text: input.text }),
          uuid: input.idempotencyKey,
        }),
      },
    );
    return { messageId: data.message_id, ...(data.chat_id ? { chatId: data.chat_id } : {}) };
  }

  async createTask(input: CreateTaskInput): Promise<{ taskGuid: string; url?: string }> {
    const data = await this.request<{ task: { guid: string; url?: string } }>(
      '/open-apis/task/v2/tasks?user_id_type=open_id',
      {
        method: 'POST',
        body: JSON.stringify({
          summary: input.summary,
          ...(input.description ? { description: input.description } : {}),
          ...(input.assigneeIds?.length ? {
            members: input.assigneeIds.map(id => ({
              id,
              role: 'assignee',
              type: id.startsWith('cli_') ? 'app' : 'user',
            })),
          } : {}),
          ...(input.dueAt ? {
            due: { timestamp: String(input.dueAt), is_all_day: input.isAllDay ?? false },
          } : {}),
          client_token: input.idempotencyKey,
        }),
      },
    );
    return { taskGuid: data.task.guid, ...(data.task.url ? { url: data.task.url } : {}) };
  }

  async createCalendarEvent(input: CreateCalendarEventInput): Promise<{ eventId: string; appLink?: string }> {
    if (input.endAt <= input.startAt) {
      throw new FeishuApiError('Calendar event end time must be after start time.', 'FEISHU_CALENDAR_TIME_INVALID');
    }
    const primary = await this.request<{
      calendars: Array<{ calendar: { calendar_id: string } }>;
    }>('/open-apis/calendar/v4/calendars/primary');
    const calendarId = primary.calendars[0]?.calendar.calendar_id;
    if (!calendarId) throw new FeishuApiError('Bot primary calendar is unavailable.', 'FEISHU_CALENDAR_PRIMARY_MISSING');
    const timezone = input.timezone ?? 'Asia/Shanghai';
    const created = await this.request<{ event: { event_id: string; app_link?: string } }>(
      `/open-apis/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        body: JSON.stringify({
          summary: input.summary,
          description: input.description ?? '',
          start_time: { timestamp: String(Math.floor(input.startAt / 1000)), timezone },
          end_time: { timestamp: String(Math.floor(input.endAt / 1000)), timezone },
          attendee_ability: 'can_modify_event',
          free_busy_status: 'busy',
          reminders: [{ minutes: 5 }],
          vchat: { vc_type: 'vc' },
        }),
      },
    );
    if (input.attendeeIds?.length) {
      try {
        await this.request(
          `/open-apis/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(created.event.event_id)}/attendees?user_id_type=open_id`,
          {
            method: 'POST',
            body: JSON.stringify({
              attendees: input.attendeeIds.map(attendee),
              need_notification: true,
            }),
          },
        );
      } catch (error) {
        try {
          await this.request(
            `/open-apis/calendar/v4/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(created.event.event_id)}?need_notification=false`,
            { method: 'DELETE' },
          );
        } catch {
          // Keep the attendee error as the primary failure; the ledger records it for recovery.
        }
        throw error;
      }
    }
    return {
      eventId: created.event.event_id,
      ...(created.event.app_link ? { appLink: created.event.app_link } : {}),
    };
  }

  async createDocument(input: CreateDocumentInput): Promise<{
    documentId: string;
    url?: string;
    permissionGrant?: 'granted' | 'failed';
  }> {
    const bullets = (input.bullets ?? []).map(item => `<li>${escapeXml(item)}</li>`).join('');
    const content = [
      `<title>${escapeXml(input.title)}</title>`,
      `<callout emoji="ℹ️" background-color="light-blue"><p>说明：${escapeXml(input.summary)}</p></callout>`,
      '<hr/>',
      '<h1>关键事项</h1>',
      bullets ? `<ul>${bullets}</ul>` : '<p>暂无补充事项。</p>',
    ].join('');
    const data = await this.request<{ document: { document_id: string; url?: string } }>(
      '/open-apis/docs_ai/v1/documents',
      {
        method: 'POST',
        body: JSON.stringify({
          content,
          format: 'xml',
          ...(input.parentToken ? { parent_token: input.parentToken } : {}),
        }),
      },
    );
    let permissionGrant: 'granted' | 'failed' | undefined;
    if (this.config.documentGrantOpenId) {
      try {
        await this.request(
          `/open-apis/drive/v1/permissions/${encodeURIComponent(data.document.document_id)}/members?type=docx&need_notification=false`,
          {
            method: 'POST',
            body: JSON.stringify({
              member_type: 'openid',
              member_id: this.config.documentGrantOpenId,
              perm: 'full_access',
            }),
          },
        );
        permissionGrant = 'granted';
      } catch {
        permissionGrant = 'failed';
      }
    }
    return {
      documentId: data.document.document_id,
      ...(data.document.url ? { url: data.document.url } : {}),
      ...(permissionGrant ? { permissionGrant } : {}),
    };
  }
}
