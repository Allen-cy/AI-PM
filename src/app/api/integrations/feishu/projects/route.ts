import { feishuTableUrl } from '../../../../../features/feishu/links.ts';
import { FeishuApiError, FeishuBaseClient, type FeishuProjectCreateInput } from '../../../../../features/feishu/client.ts';
import { readFeishuConfig } from '../../../../../features/feishu/config.ts';

export const runtime = 'nodejs';

type ProjectBody = Partial<Record<keyof FeishuProjectCreateInput, unknown>>;

class ProjectValidationError extends Error {}

function json(body: unknown, status: number, requestId: string): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Request-Id': requestId,
    },
  });
}

function text(body: ProjectBody, field: keyof FeishuProjectCreateInput, maximum = 2000): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximum) {
    throw new ProjectValidationError(`${field} must be a non-empty string up to ${maximum} characters.`);
  }
  return value.trim();
}

function optionalText(body: ProjectBody, field: keyof FeishuProjectCreateInput, maximum = 2000): string | undefined {
  const value = body[field];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > maximum) {
    throw new ProjectValidationError(`${field} must be a string up to ${maximum} characters.`);
  }
  return value.trim();
}

function option<T extends string>(value: string, allowed: readonly T[], field: string): T {
  if (!allowed.includes(value as T)) throw new ProjectValidationError(`${field} has an unsupported value.`);
  return value as T;
}

function validateProjectBody(body: unknown): FeishuProjectCreateInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ProjectValidationError('Project payload must be an object.');
  }
  const value = body as ProjectBody;
  const type = option(text(value, 'type', 20), ['信息化', '课程开发', '工程基建', '运营服务'] as const, 'type');
  const level = option(text(value, 'level', 2), ['S', 'A', 'B', 'C'] as const, 'level');
  return {
    name: text(value, 'name', 200),
    type,
    level,
    applyDate: text(value, 'applyDate', 20),
    expectedStart: optionalText(value, 'expectedStart', 20),
    sponsor: text(value, 'sponsor', 200),
    businessJustification: text(value, 'businessJustification', 5000),
  };
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const config = readFeishuConfig();
  if (!config || !config.tables.project) {
    return json({
      status: 'not_configured',
      code: 'FEISHU_PROJECT_NOT_CONFIGURED',
      request_id: requestId,
    }, 503, requestId);
  }

  let input: FeishuProjectCreateInput;
  try {
    input = validateProjectBody(await request.json());
  } catch {
    return json({
      status: 'rejected',
      code: 'FEISHU_PROJECT_INVALID',
      request_id: requestId,
    }, 422, requestId);
  }

  try {
    const client = new FeishuBaseClient(config);
    const created = await client.createProject(input);
    return json({
      status: 'succeeded',
      record_id: created.recordId,
      table_url: feishuTableUrl('project'),
      request_id: requestId,
    }, 201, requestId);
  } catch (error) {
    const code = error instanceof FeishuApiError ? error.code : 'FEISHU_PROJECT_UNKNOWN_ERROR';
    console.error(JSON.stringify({
      level: 'error',
      event: 'feishu.project.create.failed',
      request_id: requestId,
      code,
    }));
    return json({
      status: 'error',
      code,
      request_id: requestId,
    }, 503, requestId);
  }
}
