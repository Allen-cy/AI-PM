import { NextRequest, NextResponse } from "next/server";
import { llmComplete, SYSTEM_PROMPTS } from "@/lib/llm";
import { calculateRiskScore, type Risk } from "@/lib/risk";

interface AnalyzeInput {
  projectDescription: string;
}

interface AIParsedRisk {
  description: string;
  probability: number;
  impact: number;
  mitigation: string;
}

export async function POST(request: NextRequest) {
  try {
    const { projectDescription }: AnalyzeInput = await request.json();

    if (!projectDescription?.trim()) {
      return NextResponse.json({ error: "项目描述不能为空" }, { status: 400 });
    }

    const result = await llmComplete(
      "risk",
      SYSTEM_PROMPTS.risk,
      `请分析以下项目描述，识别潜在风险并返回JSON数组格式：

项目描述：
${projectDescription}

要求：
1. 返回JSON数组，每项包含：description, probability(1-5), impact(1-5), mitigation
2. probability: 1=极低, 2=低, 3=中等, 4=高, 5=极高
3. impact: 1=轻微, 2=较小, 3=中等, 4=严重, 5=极严重
4. 识别5-8个主要风险
5. 只返回JSON数组，不要其他文字`
    );

    const content = result.content || "";

    // Parse JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "AI返回格式错误，无法解析风险数据" }, { status: 500 });
    }

    const parsed: AIParsedRisk[] = JSON.parse(jsonMatch[0]);

    const risks: Risk[] = parsed.map((item, index) => ({
      id: `AI-${Date.now()}-${index + 1}`,
      description: item.description || "",
      category: "技术" as const,
      probability: (Math.min(5, Math.max(1, item.probability || 3))) as Risk["probability"],
      impact: (Math.min(5, Math.max(1, item.impact || 3))) as Risk["impact"],
      piScore: calculateRiskScore(item.probability || 3, item.impact || 3),
      status: "identified" as const,
      responseStrategy: item.mitigation || "",
      owner: "",
      createdAt: new Date().toISOString().split("T")[0],
    }));

    return NextResponse.json({
      risks,
      aiReasoning: content.slice(0, 500),
      model: result.model,
    });
  } catch (error) {
    console.error("[risk/analyze] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI风险分析失败" },
      { status: 500 }
    );
  }
}