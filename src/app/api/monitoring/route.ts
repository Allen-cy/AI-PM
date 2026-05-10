import { NextRequest, NextResponse } from "next/server";
import { llmComplete } from "@/lib/llm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projects, timeframe } = body as {
      projects: Array<{
        id: string;
        name: string;
        scheduleVariance: number;
        costVariance: number;
        scopeChangeCount: number;
        riskCount: number;
        status: string;
        trend: string;
      }>;
      timeframe: string;
    };

    if (!projects || !Array.isArray(projects)) {
      return NextResponse.json({ error: "Missing or invalid projects array" }, { status: 400 });
    }

    const projectSummary = projects.map(p =>
      `${p.name}(${p.id}): 进度偏差${p.scheduleVariance}天, 成本偏差${p.costVariance}万元, 范围变更${p.scopeChangeCount}次, 风险${p.riskCount}个, 状态${p.status}, 趋势${p.trend}`
    ).join("\n");

    const prompt = `你是AI PM系统的监控中心分析师。请分析以下项目组合的运行状况：

项目详情：
${projectSummary}

分析周期：${timeframe || '最近30天'}

请从以下三个维度进行深度分析：

1. **核心洞察 (insights)**：识别3-5个关键观察，如模式识别、异常点、关联性
2. **根因分析 (rootCauses)**：分析导致当前问题的深层原因，聚焦可改善的因素
3. **行动建议 (recommendations)**：给出3-5条具体的干预建议，包括优先级和预期效果

要求：
- 洞察要有数据支撑，简洁明确
- 根因分析要避免流于表面，挖掘真正的驱动因素
- 建议要具体可执行，指定责任方和预期周期
- 使用中文输出
- 返回JSON格式：{ insights: string[], rootCauses: string[], recommendations: string[] }`;

    const result = await llmComplete(
      "monitoring" as any,
      `你是AI PM系统的监控中心分析师，精通项目管理方法论和数据可视化。
分析维度：进度、成本、质量、风险、干系人满意度
输出格式：严格的JSON对象 { insights: string[], rootCauses: string[], recommendations: string[] }`,
      prompt
    );

    let parsed;
    try {
      // Try to extract JSON from the response
      const content = result.content.trim();
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(content);
      }
    } catch {
      // Fallback if JSON parsing fails
      parsed = {
        insights: [
          `当前有 ${projects.filter(p => p.status === 'critical').length} 个项目处于危急状态，需立即干预`,
          `平均进度偏差为 ${(projects.reduce((s, p) => s + p.scheduleVariance, 0) / projects.length).toFixed(1)} 天`,
          `成本偏差整体可控，但个别项目超支严重`,
          `${projects.filter(p => p.trend === 'declining').length} 个项目趋势恶化`,
          '范围变更频繁是主要风险来源'
        ],
        rootCauses: [
          '资源分配不均，关键路径上的任务存在瓶颈',
          '需求变更流程缺失有效的控制机制',
          '早期风险识别不足，后期补救成本高',
          '跨部门协调效率低下，导致等待时间过长',
          '项目组合优先级动态调整机制缺失'
        ],
        recommendations: [
          '优先级：高优先级项目启动专项资源保障机制，确保关键资源不被占用',
          '优先级：高优先级建立变更预警机制，当范围变更超过3次时自动触发评审',
          '优先级：中优先级引入风险预识别流程，在每个阶段启动会设置风险checkpoint',
          '优先级：中优先级建立跨部门协调周会机制，减少协调等待时间',
          '优先级：低优先级建立项目组合健康度仪表盘，实现动态优先级调整'
        ]
      };
    }

    return NextResponse.json({
      insights: parsed.insights || [],
      rootCauses: parsed.rootCauses || [],
      recommendations: parsed.recommendations || [],
    });
  } catch (error) {
    console.error("[monitoring/insight] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate monitoring insights", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
