// AI Closing Review API - POST /api/closing/review
import { NextRequest, NextResponse } from "next/server";
import { llmComplete } from "@/lib/llm";

interface ClosingReviewRequest {
  projectId: string;
  checklists: Array<{
    id: string;
    category: string;
    item: string;
    completed: boolean;
  }>;
  signOffs: Array<{
    role: string;
    name: string;
    signed: boolean;
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const body: ClosingReviewRequest = await request.json();
    const { projectId, checklists, signOffs } = body;

    // Calculate completion stats
    const totalItems = checklists.length;
    const completedItems = checklists.filter(c => c.completed).length;
    const completionRate = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    // Group by category
    const byCategory = checklists.reduce((acc, c) => {
      if (!acc[c.category]) acc[c.category] = { total: 0, completed: 0 };
      acc[c.category].total++;
      if (c.completed) acc[c.category].completed++;
      return acc;
    }, {} as Record<string, { total: number; completed: number }>);

    // Find missing items
    const missingItems = checklists
      .filter(c => !c.completed)
      .map(c => c.item);

    // Find pending sign-offs
    const pendingSignoffs = signOffs
      .filter(s => !s.signed)
      .map(s => s.role);

    // Build AI prompt
    const systemPrompt = `你是AI项目管理专家，精通PMBOK项目收尾过程组。
项目收尾审查要点：
1. 验收确认是否完整
2. 文档归档是否齐全
3. 经验教训是否提炼
4. 财务结算是否清晰
5. 合同关闭是否完成
6. 所有干系人签字是否齐全

请分析给定的收尾数据，返回JSON格式的审查结果。
JSON格式：{"approved": boolean, "missingItems": string[], "suggestions": string[], "finalReport": string}`;

    const userMessage = `项目ID: ${projectId}

收尾检查项（${completionRate}% 完成）：
${checklists.map(c => `- [${c.completed ? '✓' : '✗'}] ${c.item} (${c.category})`).join('\n')}

签字状态：
${signOffs.map(s => `- ${s.role} (${s.name}): ${s.signed ? '已签字' : '待签字'}`).join('\n')}

请分析并给出：
1. approved: 是否通过收尾审查（所有检查项完成且签字齐全才通过）
2. missingItems: 缺失项列表
3. suggestions: 改进建议
4. finalReport: 一段话的项目收尾最终报告摘要`;

    // Call LLM for review
    const result = await llmComplete("general", systemPrompt, userMessage);

    let aiResult;
    try {
      aiResult = JSON.parse(result.content);
    } catch {
      // If parsing fails, provide structured fallback
      aiResult = {
        approved: completionRate >= 80 && pendingSignoffs.length === 0,
        missingItems,
        suggestions: [
          completionRate < 100 ? `仍有 ${totalItems - completedItems} 项检查项未完成` : '',
          pendingSignoffs.length > 0 ? `以下签字待完成: ${pendingSignoffs.join(', ')}` : '',
        ].filter(Boolean),
        finalReport: `项目收尾进度${completionRate}%，${completedItems}/${totalItems}项检查项已完成，${pendingSignoffs.length}项签字待完成。建议优先完成缺失项后再进行最终审批。`,
      };
    }

    return NextResponse.json({
      success: true,
      projectId,
      completionRate,
      completedItems,
      totalItems,
      byCategory,
      missingItems,
      pendingSignoffs,
      ...aiResult,
    });
  } catch (error) {
    console.error("[closing/review] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate closing review" },
      { status: 500 }
    );
  }
}
