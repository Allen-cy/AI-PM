import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/features/auth/server';
import { buildExecutionSummaryEvidence, withAuditResult } from '@/features/ai/evidence';
import { persistAiEvidence } from '@/features/ai/evidence-repository';
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
  const user = await getCurrentUser();
  try {
    const { tasks = [], deliverables = [], projectId } = await req.json();
    const typedTasks = tasks as ExecutionTask[];
    const typedDeliverables = deliverables as ExecutionDeliverable[];
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

    return NextResponse.json({
      request_id: requestId,
      summary: typeof parsed.summary === 'string' ? parsed.summary : buildFallbackSummary(typedTasks, typedDeliverables).summary,
      risks: Array.isArray(parsed.risks) ? parsed.risks : buildFallbackSummary(typedTasks, typedDeliverables).risks,
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : buildFallbackSummary(typedTasks, typedDeliverables).recommendations,
      evidence: withAuditResult(evidence, audit.status === "succeeded" ? { status: "succeeded", id: audit.id } : { status: audit.status, warning: audit.warning }),
    });
  } catch (error) {
    console.error('[execution] AI summary fallback:', error);
    const fallback = buildFallbackSummary([], []);
    const evidence = buildExecutionSummaryEvidence({
      taskCount: 0,
      blockedTaskCount: 0,
      deliverableCount: 0,
      pendingDeliverableCount: 0,
      model: "rule-based-fallback",
      status: "fallback",
    });
    const audit = await persistAiEvidence({ evidence, user, requestId, metadata: { route: "/api/execution", error: error instanceof Error ? error.message : String(error) } });
    return NextResponse.json({
      request_id: requestId,
      ...fallback,
      evidence: withAuditResult(evidence, audit.status === "succeeded" ? { status: "succeeded", id: audit.id } : { status: audit.status, warning: audit.warning }),
    });
  }
}
