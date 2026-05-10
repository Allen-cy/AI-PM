import { NextRequest, NextResponse } from "next/server";
import { llmComplete } from "@/lib/llm";

export async function POST(request: NextRequest) {
  try {
    const { projectType, phase, deliverables, criteria } = await request.json();

    if (!projectType || !phase) {
      return NextResponse.json(
        { error: "Missing required fields: projectType, phase" },
        { status: 400 }
      );
    }

    const typeLabel: Record<string, string> = {
      it: "信息化系统集成",
      content: "课程内容开发",
      engineering: "工程基建施工",
      ops: "运营服务交付",
    };

    const phaseLabel: Record<string, string> = {
      启动: "项目启动阶段",
      规划: "项目规划阶段",
      执行: "项目执行阶段",
      监控: "项目监控阶段",
      收尾: "项目收尾阶段",
    };

    const systemPrompt = `你是教育行业资深质量管理专家，精通PMBOK质量管理知识体系与ISO9001质量标准。
请对项目的质量状况进行评估，分析潜在问题并给出改进建议。
评估维度：
1. 流程合规性 - 是否遵循既定流程和标准
2. 交付物质量 - 成果物是否满足质量要求
3. 验收标准达成 - 是否满足预设验收条件
4. 风险隐患 - 是否有未被识别的质量风险

输出要求：
- issues: 列出发现的问题（最多5项，每项一句话）
- suggestions: 给出改进建议（最多5项，每项一句话）
- riskLevel: 整体风险等级 low | medium | high`;

    const userMessage = `项目类型：${typeLabel[projectType] || projectType}
项目阶段：${phaseLabel[phase] || phase}
${deliverables ? `关键交付物：${deliverables}` : ""}
${criteria ? `验收标准：${criteria}` : ""}

请进行AI质量评审，识别潜在问题并给出建议。`;

    const result = await llmComplete("quality", systemPrompt, userMessage, { temperature: 0.3 });

    // Try to parse structured response, fall back to raw content
    let issues: string[] = [];
    let suggestions: string[] = [];
    let riskLevel: "low" | "medium" | "high" = "medium";

    try {
      // Try JSON parsing first
      const parsed = JSON.parse(result.content);
      if (Array.isArray(parsed.issues)) issues = parsed.issues;
      if (Array.isArray(parsed.suggestions)) suggestions = parsed.suggestions;
      if (["low", "medium", "high"].includes(parsed.riskLevel)) {
        riskLevel = parsed.riskLevel;
      }
    } catch {
      // Fallback: extract lines containing problem/suggestion keywords
      const lines = result.content.split("\n").filter((l: string) => l.trim());
      for (const line of lines) {
        const cleaned = line.replace(/^[-*•🔴🟡🟢]\s*/, "").trim();
        if (cleaned.length > 10) {
          if (issues.length < 5 && (line.includes("问题") || line.includes("缺陷") || line.includes("风险") || issues.length < suggestions.length + 2)) {
            issues.push(cleaned);
          } else if (suggestions.length < 5) {
            suggestions.push(cleaned);
          }
        }
      }
      // Determine risk level from content
      if (result.content.includes("🔴") || result.content.toLowerCase().includes("high risk")) {
        riskLevel = "high";
      } else if (result.content.includes("🟢") || result.content.toLowerCase().includes("low risk")) {
        riskLevel = "low";
      }
    }

    // Ensure we have at least some content
    if (issues.length === 0 && suggestions.length === 0) {
      issues = ["未能获取AI评审结果，请检查API配置"];
      suggestions = ["确认 MINIMAX_API_KEY 或 DEEPSEEK_API_KEY 已正确配置"];
    }

    return NextResponse.json({ issues, suggestions, riskLevel });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
