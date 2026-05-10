import { NextRequest, NextResponse } from 'next/server';
import { llmComplete } from '@/lib/llm';

const SYSTEM_PROMPT = `你是AI PM系统执行与交付模块的智能助手。
分析项目执行数据，识别风险并提供建议。
输出JSON格式：{ summary: string, risks: string[], recommendations: string[] }`;

export async function POST(req: NextRequest) {
  try {
    const { tasks, deliverables, projectId } = await req.json();

    const taskSummary = tasks
      .map((t: { name: string; status: string; assignee: string }) =>
        `- ${t.name} [${t.status}] @${t.assignee}`)
      .join('\n');

    const deliverableSummary = deliverables
      .map((d: { name: string; status: string }) =>
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
      parsed = JSON.parse(result.content);
    } catch {
      parsed = {
        summary: result.content.slice(0, 200),
        risks: ['数据解析异常，请人工确认'],
        recommendations: ['建议人工复核任务状态'],
      };
    }

    return NextResponse.json(parsed);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate summary' },
      { status: 500 }
    );
  }
}