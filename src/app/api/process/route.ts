// Process Flow Generation API - AI-powered process design
import { NextRequest, NextResponse } from "next/server";
import { llmComplete } from "@/lib/llm";
import type { ProcessElement } from "@/lib/process";

interface GenerateRequest {
  description: string;
}

// Process generation system prompt
const PROCESS_GENERATION_PROMPT = `你是流程设计专家，擅长将自然语言描述转换为流程图元素。

根据用户描述，生成流程图元素JSON数组。

规则：
1. 使用标准流程图元素类型：start(开始), end(结束), task(任务/活动), gateway(决策网关), document(文档), data(数据)
2. 决策网关需要有"是/否"两个出口分支，用connections数组表示
3. 为每个元素分配唯一ID（格式：t+数字、s+数字、e+数字、g+数字等）
4. 位置使用{x, y}坐标，x居中(400)，y从上到下递增(每步约80px)
5. 每个任务必须连接到下一个元素

输出格式（严格JSON）：
{
  "flowDescription": "流程描述摘要",
  "elements": [
    {"id": "s1", "type": "start", "label": "开始", "position": {"x": 400, "y": 50}, "connections": ["t1"]},
    {"id": "t1", "type": "task", "label": "任务名称", "position": {"x": 400, "y": 130}, "connections": ["t2"]},
    {"id": "g1", "type": "gateway", "label": "是否通过?", "position": {"x": 400, "y": 210}, "connections": ["t2", "t3"]},
    ...
  ],
  "suggestions": ["优化建议1", "优化建议2"]
}`;

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const { description } = body;

    if (!description?.trim()) {
      return NextResponse.json(
        { error: "请提供流程描述" },
        { status: 400 }
      );
    }

    const response = await llmComplete(
      "general",
      PROCESS_GENERATION_PROMPT,
      `生成流程：${description}`,
      { temperature: 0.7 }
    );

    // Parse the response to extract JSON
    let result;
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      // Fallback: generate a basic flow from description
      result = {
        flowDescription: description,
        elements: generateBasicFlow(description),
        suggestions: [
          "建议添加决策节点处理分支逻辑",
          "建议在关键节点添加审核环节",
        ],
      };
    }

    // Validate and normalize elements
    if (!result.elements || !Array.isArray(result.elements)) {
      result.elements = generateBasicFlow(description);
    }

    // Ensure all elements have required fields
    result.elements = result.elements.map((el: Partial<ProcessElement>, idx: number) => ({
      id: el.id || `t${idx + 1}`,
      type: el.type || "task",
      label: el.label || `步骤${idx + 1}`,
      position: el.position || { x: 400, y: idx * 80 + 50 },
      connections: el.connections || [],
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("[process/generate] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "流程生成失败" },
      { status: 500 }
    );
  }
}

// Generate a basic flow as fallback
function generateBasicFlow(description: string): ProcessElement[] {
  const steps = description.split(/[→,，、和与]/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (steps.length === 0) {
    steps.push("开始", "执行", "结束");
  }

  const elements: ProcessElement[] = [];
  let y = 50;

  // Start
  elements.push({
    id: "s1",
    type: "start",
    label: steps[0] || "开始",
    position: { x: 400, y },
    connections: ["t1"],
  });

  y += 80;

  // Tasks
  steps.slice(1, -1).forEach((step, idx) => {
    elements.push({
      id: `t${idx + 1}`,
      type: "task",
      label: step,
      position: { x: 400, y },
      connections: [`t${idx + 2}`],
    });
    y += 80;
  });

  // End
  elements.push({
    id: "e1",
    type: "end",
    label: steps[steps.length - 1] || "结束",
    position: { x: 400, y },
    connections: [],
  });

  return elements;
}