// AI Resource Optimization API
import { NextRequest, NextResponse } from "next/server";
import { llmComplete } from "@/lib/llm";
import { TeamMember, Allocation, ACTIVE_PROJECTS } from "@/lib/resource";

const SYSTEM_PROMPT = `你是资源管理专家，精通人员配置和项目资源优化。
根据团队成员分配情况和项目需求，提供资源优化建议。
规则：
1. 识别超负荷成员（>100%）和低利用率成员（<60%）
2. 识别项目资源冲突（同一成员同时分配到多个高负荷项目）
3. 提供具体的调整建议，包括项目转移、工期调整、人员增减
4. 输出JSON格式，包含优化后的分配方案和建议列表`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { members, projects, targetUtilization = 80 } = body as {
      members: TeamMember[];
      projects: string[];
      targetUtilization: number;
    };

    // Calculate current utilization
    const memberData = members.map(m => {
      const totalAllocated = m.allocation.reduce((sum, a) => sum + a.allocatedHours, 0);
      const utilization = Math.round((totalAllocated / m.availableHours) * 100);
      return {
        name: m.name,
        role: m.role,
        utilization,
        allocated: totalAllocated,
        available: m.availableHours,
        allocation: m.allocation.map(a => `${a.projectName}(${a.allocatedHours}h)`).join(", "),
      };
    });

    const userMessage = `
当前团队资源配置分析：
目标利用率: ${targetUtilization}%

团队成员状态:
${memberData.map(m =>
  `- ${m.name} (${m.role}): 利用率 ${m.utilization}% (分配${m.allocated}h / 可用${m.available}h)
    当前项目: ${m.allocation || "无"}`
).join("\n")}

项目列表: ${projects.join(", ")}

请提供：
1. 优化后的资源分配方案
2. 具体调整建议（JSON格式）
`;

    const result = await llmComplete("resource" as any, SYSTEM_PROMPT, userMessage);

    // Parse the AI response to extract optimized allocations and suggestions
    let optimizedAllocations: Allocation[] = [];
    let suggestions: string[] = [];
    let conflicts: string[] = [];

    try {
      const parsed = JSON.parse(result.content);
      if (parsed.optimizedAllocations) {
        optimizedAllocations = parsed.optimizedAllocations;
      }
      if (parsed.suggestions) {
        suggestions = parsed.suggestions;
      }
      if (parsed.conflicts) {
        conflicts = parsed.conflicts;
      }
    } catch {
      // If not valid JSON, use the content as suggestions
      suggestions = result.content.split("\n").filter((line: string) => line.trim());
    }

    // Add system-generated suggestions based on utilization
    const systemSuggestions: string[] = [];
    for (const m of memberData) {
      if (m.utilization > 100) {
        systemSuggestions.push(`⚠️ ${m.name} 超负荷 ${m.utilization - 100}%，需要立即调整`);
      } else if (m.utilization < 60) {
        systemSuggestions.push(`📊 ${m.name} 利用率偏低 ${m.utilization}%，建议增加任务`);
      }
    }

    return NextResponse.json({
      success: true,
      optimizedAllocations,
      suggestions: [...systemSuggestions, ...suggestions],
      conflicts,
      raw: result.content,
    });
  } catch (error) {
    console.error("[resource/optimize] Error:", error);
    return NextResponse.json(
      { success: false, error: "资源优化失败，请稍后重试" },
      { status: 500 }
    );
  }
}