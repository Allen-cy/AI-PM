import { NextRequest, NextResponse } from "next/server";
import { llmComplete, SYSTEM_PROMPTS } from "@/lib/llm";
import { PaymentMilestone } from "@/lib/contract";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, text } = body;

    if (action === "parse" && text) {
      // AI-powered payment terms parsing
      const systemPrompt = `你是一位合同管理专家，精通付款条款解析。
请从合同文本中提取付款里程碑信息。
规则：
1. 识别每个付款节点（阶段/里程碑）
2. 提取金额（万元为单位）
3. 提取计划付款日期
4. 判断付款条件触发点
5. 输出JSON数组格式：[{"milestone": "里程碑名称", "amount": 金额, "dueDate": "YYYY-MM-DD", "trigger": "触发条件"}]
6. 只输出JSON，不要其他说明`;

      const result = await llmComplete("contract" as any, systemPrompt, text, { temperature: 0.3 });

      let milestones: PaymentMilestone[] = [];
      let aiReasoning = "";

      try {
        // Try to parse JSON from response
        const content = result.content;
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          milestones = parsed.map((item: any, idx: number) => ({
            id: `ai-${Date.now()}-${idx}`,
            name: item.milestone || item.name || `里程碑${idx + 1}`,
            amount: parseFloat(item.amount) || 0,
            dueDate: item.dueDate || item.date || "",
            status: "pending" as const,
            trigger: item.trigger || "",
          }));

          // Extract reasoning (everything before the JSON)
          aiReasoning = content.substring(0, jsonMatch.index || 0).trim();
        }
      } catch (parseErr) {
        console.warn("[contract/route] Failed to parse AI response as JSON:", parseErr);
        aiReasoning = "AI解析失败，使用备用规则引擎";
      }

      // If AI parsing failed, use rule-based fallback
      if (milestones.length === 0) {
        const { parsePaymentTerms } = await import("@/lib/contract");
        milestones = parsePaymentTerms(text);
        aiReasoning = "使用规则引擎解析（AI解析返回格式异常）";
      }

      return NextResponse.json({
        milestones,
        aiReasoning: aiReasoning || "解析完成",
        success: true,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("[contract/route] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
