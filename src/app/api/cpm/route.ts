// CPM API Route - Uses DeepSeek AI for Critical Path Method calculations

import { NextRequest, NextResponse } from "next/server";
import { llmComplete } from "@/lib/llm";

interface Task {
  id: string;
  name: string;
  duration: number;
  predecessors: string[];
}

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

## 输出要求：
请以JSON格式返回，结构如下：
{
  "tasks": [每个任务的时间参数计算结果],
  "criticalPath": ["关键路径任务ID按顺序排列"],
  "projectDuration": 项目总工期,
  "reasoning": "详细的计算推理过程，说明前向/后向传递的每一步计算"
}

请对每个任务的ES、EF、LS、LF、TF进行计算，并说明哪些任务在关键路径上及原因。`;

export async function POST(request: NextRequest) {
  try {
    const body: CPMRequest = await request.json();
    const { tasks } = body;

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json(
        { error: "需要提供任务列表（tasks数组）" },
        { status: 400 }
      );
    }

    // Build user message with task data
    const taskListStr = tasks
      .map(t => `- ${t.id}: 任务名="${t.name}", 工期=${t.duration}天, 前置任务=[${t.predecessors.join(", ") || "无"}]`)
      .join("\n");

    const userMessage = `请计算以下任务的CPM：

${taskListStr}

请进行完整的前向传递和后向传递计算，返回JSON结果。`;

    // Call llmComplete with scene="cpm" to use DeepSeek
    const response = await llmComplete(
      "cpm",
      CPM_SYSTEM_PROMPT,
      userMessage,
      { temperature: 0.1 }
    );

    // Parse the JSON response from LLM
    let cpmResult: CPMResponse;
    try {
      // Try to extract JSON from the response
      const content = response.content.trim();
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cpmResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("无法解析LLM返回的JSON结果");
      }
    } catch (parseError) {
      console.error("[CPM API] Parse error:", parseError);
      return NextResponse.json(
        {
          error: "LLM返回格式错误",
          rawResponse: response.content,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(cpmResult);
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