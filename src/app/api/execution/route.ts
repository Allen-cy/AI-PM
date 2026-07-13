import { NextRequest, NextResponse } from 'next/server';
import { getAuthSupabase, requireAuthenticatedApiUser } from '@/features/auth/server';
import { buildExecutionSummaryEvidence, withAuditResult } from '@/features/ai/evidence';
import { persistAiEvidence } from '@/features/ai/evidence-repository';
import { FeishuApiError, FeishuBaseClient } from '@/features/feishu/client';
import { getEffectiveFeishuConfig } from '@/features/feishu/user-config';
import { listIssueChangeChain } from '@/features/issue-change/repository';
import { projectAccessHttpStatus, resolveProjectLifecycleAccess } from '@/features/lifecycle-loop/access';
import {
  normalizeExecutionChanges,
  normalizeExecutionDeliverables,
  normalizeExecutionTasks,
  type ExecutionProjectIdentity,
} from '@/features/execution/real-data';
import type { BusinessRole } from '@/features/operating-model/context';
import { llmComplete } from '@/lib/llm';

const SYSTEM_PROMPT = `你是AI PM系统执行与交付模块的智能助手。
分析项目执行数据，识别风险并提供建议。
输出JSON格式：{ summary: string, risks: string[], recommendations: string[] }`;

interface ExecutionTask {
  name: string;
  status: string;
  assignee: string;
  blockedReason?: string;
}

interface ExecutionDeliverable {
  name: string;
  status: string;
}

const DATA_CLASSES = new Set<ExecutionProjectIdentity['dataClass']>(['production', 'sample', 'test', 'diagnostic', 'unclassified']);
const EXECUTION_ROLES = new Set<BusinessRole>(['pm', 'operations', 'pmo']);

function json(body: unknown, status: number, requestId: string) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId },
  });
}

function requiredText(value: unknown, field: string, maximum = 200): string {
  const output = String(value ?? '').trim();
  if (!output || output.length > maximum) throw new Error(`${field}为必填项，且不得超过${maximum}字符。`);
  return output;
}

function optionalText(value: unknown, maximum = 200): string {
  const output = String(value ?? '').trim();
  if (output.length > maximum) throw new Error(`字段不得超过${maximum}字符。`);
  return output;
}

function toFeishuDate(value: string): number | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('日期必须为YYYY-MM-DD。');
  return new Date(`${value}T00:00:00+08:00`).getTime();
}

async function loadExecutionProject(input: {
  projectId: string;
  businessRole: BusinessRole;
  dataClass: ExecutionProjectIdentity['dataClass'];
  user: NonNullable<Awaited<ReturnType<typeof requireAuthenticatedApiUser>>>;
}) {
  if (!EXECUTION_ROLES.has(input.businessRole)) return { error: 'EXECUTION_ROLE_FORBIDDEN', status: 403 } as const;
  const access = await resolveProjectLifecycleAccess({ user: input.user, projectId: input.projectId, businessRole: input.businessRole });
  if (access.status !== 'succeeded' || !access.scope) {
    return { error: access.status.toUpperCase(), detail: access.warning, status: projectAccessHttpStatus(access.status) } as const;
  }
  if (access.scope.dataClass !== input.dataClass) return { error: 'DATA_CLASS_MISMATCH', status: 409 } as const;
  const project = await getAuthSupabase()
    .from('projects')
    .select('id,name,oa_no,source_record_id,data_class')
    .eq('id', input.projectId)
    .maybeSingle();
  if (project.error) return { error: 'EXECUTION_PROJECT_LOAD_FAILED', detail: project.error.message, status: 500 } as const;
  if (!project.data) return { error: 'EXECUTION_PROJECT_NOT_FOUND', status: 404 } as const;
  return {
    project: {
      id: String(project.data.id),
      name: String(project.data.name),
      code: project.data.oa_no ? String(project.data.oa_no) : null,
      sourceRecordId: project.data.source_record_id ? String(project.data.source_record_id) : null,
      dataClass: String(project.data.data_class) as ExecutionProjectIdentity['dataClass'],
    } satisfies ExecutionProjectIdentity,
    access,
  } as const;
}

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const user = await requireAuthenticatedApiUser();
  if (!user) return json({ error: 'UNAUTHORIZED', request_id: requestId }, 401, requestId);
  const url = new URL(request.url);
  const projectId = String(url.searchParams.get('project_id') || '').trim();
  const businessRole = String(url.searchParams.get('business_role') || '') as BusinessRole;
  const dataClass = String(url.searchParams.get('data_class') || '') as ExecutionProjectIdentity['dataClass'];
  if (!projectId || !businessRole || !DATA_CLASSES.has(dataClass)) {
    return json({ error: 'EXECUTION_CONTEXT_REQUIRED', detail: '请先选择已授权的项目、业务角色和数据空间。', request_id: requestId }, 400, requestId);
  }
  const resolved = await loadExecutionProject({ projectId, businessRole, dataClass, user });
  if (!('project' in resolved) || !resolved.project) return json({ ...resolved, request_id: requestId }, resolved.status, requestId);
  const project = resolved.project;

  const effective = await getEffectiveFeishuConfig();
  if (!effective.config?.tables.task) {
    return json({
      error: 'FEISHU_TASK_TABLE_NOT_CONFIGURED',
      detail: effective.setupHint || '请在用户中心配置个人飞书和任务表ID。',
      lark_cli_hint: effective.larkCliHint,
      request_id: requestId,
      source: { type: 'feishu', fallback_used: false },
    }, 503, requestId);
  }

  try {
    const client = new FeishuBaseClient(effective.config);
    const [taskResult, deliverableResult, chain] = await Promise.all([
      client.listRecords('task', 500),
      effective.config.tables.milestone
        ? client.listRecords('milestone', 500).then(data => ({ data, error: null as string | null })).catch(error => ({ data: [], error: error instanceof Error ? error.message : String(error) }))
        : Promise.resolve({ data: [], error: '未配置飞书里程碑表，交付物数据不可用。' }),
      listIssueChangeChain({
        actorUserId: user.id,
        orgId: resolved.access.scope!.orgId,
        projectIds: [project.id],
        requestedProjectId: project.id,
        dataClass,
      }),
    ]);
    const tasks = normalizeExecutionTasks(taskResult, project);
    const deliverables = normalizeExecutionDeliverables(deliverableResult.data, project);
    const changeRequests = chain.status === 'succeeded' ? normalizeExecutionChanges(chain.changes, project.name) : [];
    return json({
      status: 'succeeded',
      project,
      tasks,
      deliverables,
      change_requests: changeRequests,
      source: {
        type: 'feishu+supabase',
        fallback_used: false,
        detail: `飞书任务${tasks.length}条，飞书交付物${deliverables.length}条，Supabase变更${changeRequests.length}条。`,
        warnings: [deliverableResult.error, chain.status === 'succeeded' ? null : chain.warning].filter(Boolean),
      },
      request_id: requestId,
    }, 200, requestId);
  } catch (error) {
    return json({
      error: error instanceof FeishuApiError ? error.code : 'EXECUTION_SOURCE_UNAVAILABLE',
      detail: error instanceof Error ? error.message : '执行数据源不可用。',
      source: { type: 'feishu+supabase', fallback_used: false },
      request_id: requestId,
    }, 503, requestId);
  }
}

function buildFallbackSummary(tasks: ExecutionTask[], deliverables: ExecutionDeliverable[]) {
  const blocked = tasks.filter(task => task.status === 'blocked');
  const inProgress = tasks.filter(task => task.status === 'in-progress');
  const pendingDeliverables = deliverables.filter(deliverable =>
    ['pending', 'in-progress', 'rejected'].includes(deliverable.status)
  );

  return {
    summary: `当前共有${tasks.length}项任务，${inProgress.length}项进行中，${blocked.length}项阻塞；交付物共${deliverables.length}项，其中${pendingDeliverables.length}项仍需推进或验收。`,
    risks: blocked.length > 0
      ? blocked.map(task => `${task.name}阻塞${task.blockedReason ? `：${task.blockedReason}` : ''}`)
      : ['未发现明确阻塞任务，需继续跟踪交付物验收状态。'],
    recommendations: [
      '优先解除高优先级阻塞任务，明确责任人和预计恢复时间。',
      '对待验收或被拒交付物补齐质量检查与客户确认记录。',
      '每周复核任务进度、交付物状态和变更请求，避免执行数据滞后。',
    ],
  };
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const user = await requireAuthenticatedApiUser();
  if (!user) return json({ error: 'UNAUTHORIZED', request_id: requestId }, 401, requestId);
  try {
    const body = await req.json() as Record<string, unknown>;
    const operation = String(body.operation || 'generate_summary');

    if (operation === 'create_task' || operation === 'create_deliverable') {
      const projectId = requiredText(body.project_id, 'project_id');
      const businessRole = requiredText(body.business_role, 'business_role', 40) as BusinessRole;
      const dataClass = requiredText(body.data_class, 'data_class', 40) as ExecutionProjectIdentity['dataClass'];
      if (!DATA_CLASSES.has(dataClass)) return json({ error: 'DATA_CLASS_INVALID', request_id: requestId }, 400, requestId);
      const resolved = await loadExecutionProject({ projectId, businessRole, dataClass, user });
      if (!('project' in resolved) || !resolved.project) return json({ ...resolved, request_id: requestId }, resolved.status, requestId);
      const project = resolved.project;
      const effective = await getEffectiveFeishuConfig();
      const tableKey = operation === 'create_task' ? 'task' : 'milestone';
      if (!effective.config?.tables[tableKey]) {
        return json({
          error: tableKey === 'task' ? 'FEISHU_TASK_TABLE_NOT_CONFIGURED' : 'FEISHU_MILESTONE_TABLE_NOT_CONFIGURED',
          detail: `请在用户中心配置个人飞书${tableKey === 'task' ? '任务' : '里程碑'}表ID。`,
          request_id: requestId,
          source: { type: 'feishu', fallback_used: false },
        }, 503, requestId);
      }
      const name = requiredText(body.name, operation === 'create_task' ? '任务名称' : '交付物名称');
      const owner = optionalText(body.owner);
      const dueDate = optionalText(body.due_date, 20);
      const commonFields: Record<string, unknown> = {
        '关联项目UUID': project.id,
        '关联项目编号': project.code || undefined,
        '项目名称': project.name,
        '数据分类': project.dataClass,
        '负责人': owner || undefined,
        '截止日期': toFeishuDate(dueDate),
      };
      const fields = operation === 'create_task'
        ? { ...commonFields, '任务名称': name, '任务状态': '待处理', '优先级': '中', '完成进度': 0 }
        : { ...commonFields, '交付物名称': name, '验收状态': '待提交' };
      const created = await new FeishuBaseClient(effective.config).createRecord(tableKey, fields);
      return json({
        status: 'succeeded',
        operation,
        record_id: created.recordId,
        source: { type: 'feishu', fallback_used: false },
        request_id: requestId,
      }, 201, requestId);
    }

    const tasks = Array.isArray(body.tasks) ? body.tasks : [];
    const deliverables = Array.isArray(body.deliverables) ? body.deliverables : [];
    const projectId = requiredText(body.projectId, 'projectId');
    const typedTasks = tasks as ExecutionTask[];
    const typedDeliverables = deliverables as ExecutionDeliverable[];
    if (typedTasks.length === 0 && typedDeliverables.length === 0) {
      return json({ error: 'EXECUTION_SOURCE_EMPTY', detail: '当前项目没有可供分析的真实任务或交付物。', request_id: requestId }, 422, requestId);
    }
    const blockedTaskCount = typedTasks.filter(task => task.status === 'blocked').length;
    const pendingDeliverableCount = typedDeliverables.filter(deliverable => ['pending', 'in-progress', 'rejected'].includes(deliverable.status)).length;

    const taskSummary = typedTasks
      .map((t: ExecutionTask) =>
        `- ${t.name} [${t.status}] @${t.assignee}`)
      .join('\n');

    const deliverableSummary = typedDeliverables
      .map((d: ExecutionDeliverable) =>
        `- ${d.name} [${d.status}]`)
      .join('\n');

    const userMessage = `项目ID: ${projectId}

## 任务列表
${taskSummary}

## 交付物列表
${deliverableSummary}

请按以下JSON格式返回（纯JSON，无其他内容）：
{
  "summary": "整体执行状态概述（2-3句话）",
  "risks": ["风险1", "风险2", "风险3"],
  "recommendations": ["建议1", "建议2", "建议3"]
}`;

    let resultModel = "configured-llm";
    let parsedStatus: "generated" | "fallback" = "generated";
    const result = await llmComplete("execution", SYSTEM_PROMPT, userMessage);
    resultModel = result.model;

    let parsed;
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] ?? result.content);
    } catch {
      parsedStatus = "fallback";
      parsed = {
        summary: result.content.slice(0, 200),
        risks: ['数据解析异常，请人工确认'],
        recommendations: ['建议人工复核任务状态'],
      };
    }

    const evidence = buildExecutionSummaryEvidence({
      projectId,
      taskCount: typedTasks.length,
      blockedTaskCount,
      deliverableCount: typedDeliverables.length,
      pendingDeliverableCount,
      model: parsedStatus === "generated" ? resultModel : `${resultModel}/parse-fallback`,
      status: parsedStatus,
    });
    const audit = await persistAiEvidence({ evidence, user, requestId, metadata: { route: "/api/execution" } });

    return json({
      request_id: requestId,
      summary: typeof parsed.summary === 'string' ? parsed.summary : buildFallbackSummary(typedTasks, typedDeliverables).summary,
      risks: Array.isArray(parsed.risks) ? parsed.risks : buildFallbackSummary(typedTasks, typedDeliverables).risks,
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : buildFallbackSummary(typedTasks, typedDeliverables).recommendations,
      evidence: withAuditResult(evidence, audit.status === "succeeded" ? { status: "succeeded", id: audit.id } : { status: audit.status, warning: audit.warning }),
    }, 200, requestId);
  } catch (error) {
    console.error('[execution] request failed:', error);
    return json({
      error: error instanceof FeishuApiError ? error.code : 'EXECUTION_REQUEST_FAILED',
      detail: error instanceof Error ? error.message : '执行与交付请求失败。',
      source: { fallback_used: false },
      request_id: requestId,
    }, error instanceof FeishuApiError ? 503 : 500, requestId);
  }
}
