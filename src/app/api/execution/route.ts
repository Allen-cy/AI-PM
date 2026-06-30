import { NextRequest, NextResponse } from 'next/server';
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
  try {
    const { tasks = [], deliverables = [], projectId } = await req.json();

    const taskSummary = tasks
      .map((t: ExecutionTask) =>
        `- ${t.name} [${t.status}] @${t.assignee}`)
      .join('\n');

    const deliverableSummary = deliverables
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

    const result = await llmComplete("execution", SYSTEM_PROMPT, userMessage);

    let parsed;
    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] ?? result.content);
    } catch {
      parsed = {
        summary: result.content.slice(0, 200),
        risks: ['数据解析异常，请人工确认'],
        recommendations: ['建议人工复核任务状态'],
      };
    }

    return NextResponse.json({
      summary: typeof parsed.summary === 'string' ? parsed.summary : buildFallbackSummary(tasks, deliverables).summary,
      risks: Array.isArray(parsed.risks) ? parsed.risks : buildFallbackSummary(tasks, deliverables).risks,
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : buildFallbackSummary(tasks, deliverables).recommendations,
    });
  } catch (error) {
    console.error('[execution] AI summary fallback:', error);
    const fallback = buildFallbackSummary([], []);
    return NextResponse.json(fallback);
  }
}
