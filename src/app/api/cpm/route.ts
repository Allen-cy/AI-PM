// CPM API Route - deterministic CPM first, AI explanation second

import { NextRequest, NextResponse } from "next/server";
import { calculateCPM, type Task } from "@/lib/cpm";
import { llmComplete } from "@/lib/llm";

interface CPMRequest {
  tasks: Task[];
}

interface CPMResponse {
  tasks: Array<Task & {
    es: number;
    ef: number;
    ls: number;
    lf: number;
    totalFloat: number;
    isCritical: boolean;
  }>;
  criticalPath: string[];
  projectDuration: number;
  reasoning: string;
  aiStatus: "succeeded" | "fallback";
  aiWarning?: string;
}

function responseTasks(result: ReturnType<typeof calculateCPM>): CPMResponse["tasks"] {
  return result.tasks.map(task => ({
    ...task,
    es: task.es ?? 0,
    ef: task.ef ?? task.duration,
    ls: task.ls ?? 0,
    lf: task.lf ?? task.duration,
    totalFloat: task.totalFloat ?? 0,
    isCritical: task.isCritical ?? false,
  }));
}

const CPM_SYSTEM_PROMPT = `你是一位资深项目管理专家，精通关键路径法（CPM，Critical Path Method）。

请根据输入的任务列表，使用CPM算法计算关键路径。

## CPM计算规则：

### 前向传递（Forward Pass）：
- 最早开始时间（ES）= 所有紧前任务最早完成时间（EF）的最大值
- 最早完成时间（EF）= ES + 工期

### 后向传递（Backward Pass）：
- 最晚完成时间（LF）= 所有紧后任务最晚开始时间（LS）的最小值
- 最晚开始时间（LS）= LF - 工期
- 总浮动（TF）= LS - ES（或 LF - EF）

### 关键路径判定：
- 总浮动为0的任务即为关键任务
- 关键路径是所有关键任务按顺序排列形成的最长路径

请基于系统已经计算出的 CPM 结果，用中文解释：
1. 项目总工期；
2. 关键路径任务顺序；
3. 前向传递和后向传递的关键结论；
4. 哪些任务有浮动时间，以及这些浮动时间如何用于项目调度。

只返回解释文字，不要返回 JSON。`;

function normalizeTasks(rawTasks: Task[]): Task[] {
  return rawTasks.map((task, index) => ({
    id: String(task.id || `T${index + 1}`).trim(),
    name: String(task.name || task.id || `任务${index + 1}`).trim(),
    duration: Math.max(0, Number(task.duration) || 0),
    predecessors: Array.isArray(task.predecessors)
      ? task.predecessors.map(item => String(item).trim()).filter(Boolean)
      : [],
  }));
}

function validateTasks(tasks: Task[]): string | null {
  const ids = new Set<string>();
  for (const task of tasks) {
    if (!task.id) return "任务ID不能为空";
    if (ids.has(task.id)) return `任务ID重复：${task.id}`;
    ids.add(task.id);
    if (task.duration <= 0) return `任务 ${task.id} 的工期必须大于0`;
  }
  for (const task of tasks) {
    for (const predecessor of task.predecessors) {
      if (!ids.has(predecessor)) return `任务 ${task.id} 的前置任务不存在：${predecessor}`;
      if (predecessor === task.id) return `任务 ${task.id} 不能依赖自身`;
    }
  }

  const inDegree = new Map(tasks.map(task => [task.id, task.predecessors.length]));
  const successors = new Map(tasks.map(task => [task.id, [] as string[]]));
  for (const task of tasks) {
    for (const predecessor of task.predecessors) {
      successors.get(predecessor)?.push(task.id);
    }
  }
  const queue = tasks.filter(task => task.predecessors.length === 0).map(task => task.id);
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited += 1;
    for (const successor of successors.get(id) ?? []) {
      const nextDegree = (inDegree.get(successor) ?? 0) - 1;
      inDegree.set(successor, nextDegree);
      if (nextDegree === 0) queue.push(successor);
    }
  }
  return visited === tasks.length ? null : "任务依赖存在循环，无法计算关键路径";
}

function buildFallbackReasoning(result: ReturnType<typeof calculateCPM>): string {
  const criticalNames = result.criticalPath
    .map(id => result.tasks.find(task => task.id === id))
    .filter(Boolean)
    .map(task => `${task!.id} ${task!.name}`)
    .join(" → ");
  const floatTasks = result.tasks
    .filter(task => !task.isCritical)
    .map(task => `${task.id}(${task.totalFloat ?? 0}天)`)
    .join("、") || "无";
  return [
    `本次使用本地 CPM 算法完成计算，项目总工期为 ${result.projectDuration} 天。`,
    `关键路径为：${criticalNames || "未识别到关键路径"}。关键路径上的任务总浮动为 0，任何延期都会直接推迟项目总工期。`,
    `非关键任务浮动时间：${floatTasks}。这些任务可在不影响总工期的前提下做资源平衡，但不能超过对应总浮动。`,
  ].join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const body: CPMRequest = await request.json();
    const tasks = normalizeTasks(body.tasks ?? []);

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json(
        { error: "需要提供任务列表（tasks数组）" },
        { status: 400 }
      );
    }

    const validationError = validateTasks(tasks);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const deterministicResult = calculateCPM(tasks);
    let reasoning = buildFallbackReasoning(deterministicResult);
    let aiStatus: CPMResponse["aiStatus"] = "fallback";
    let aiWarning: string | undefined = "AI解释未生成，已使用本地CPM算法结果。";

    const taskListStr = deterministicResult.tasks
      .map(t => `- ${t.id}: ${t.name}，工期=${t.duration}天，前置任务=[${t.predecessors.join(", ") || "无"}]，ES=${t.es}，EF=${t.ef}，LS=${t.ls}，LF=${t.lf}，TF=${t.totalFloat}，关键任务=${t.isCritical ? "是" : "否"}`)
      .join("\n");

    const userMessage = `以下是系统已完成的 CPM 计算结果，请生成面向项目经理的解释：

${taskListStr}

关键路径：${deterministicResult.criticalPath.join(" → ")}
项目总工期：${deterministicResult.projectDuration}天`;

    try {
      const response = await llmComplete(
        "cpm",
        CPM_SYSTEM_PROMPT,
        userMessage,
        { temperature: 0.1 }
      );
      const content = response.content.trim();
      if (content) {
        reasoning = content;
        aiStatus = "succeeded";
        aiWarning = undefined;
      }
    } catch (aiError) {
      console.error("[CPM API] AI explanation failed:", aiError);
    }

    return NextResponse.json({
      tasks: responseTasks(deterministicResult),
      criticalPath: deterministicResult.criticalPath,
      projectDuration: deterministicResult.projectDuration,
      reasoning,
      aiStatus,
      aiWarning,
    } satisfies CPMResponse);
  } catch (error) {
    console.error("[CPM API] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "CPM计算失败",
      },
      { status: 500 }
    );
  }
}
