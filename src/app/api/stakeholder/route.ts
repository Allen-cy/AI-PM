import { NextRequest, NextResponse } from 'next/server';
import { llmComplete } from '@/lib/llm';
import type { Stakeholder } from '@/lib/stakeholder';

const STAKEHOLDER_PROMPT = `你是项目管理专家，精通PMBOK干系人管理知识。

根据提供的干系人列表，为每个干系人生成管理策略建议。

分析维度：
1. 权力-利益矩阵分类：高权力×高利益=重点管理，高权力×低利益=保持满意，低权力×高利益=随时告知，低权力×低利益=监督
2. 当前参与度与期望参与度的差距
3. 沟通偏好（频率和方式）

输出要求：
- 为每个干系人优化 managementStrategy 字段
- 提供具体的沟通频率和方式建议
- 识别需要优先关注的干系人
- 用JSON格式输出，包含suggestions数组和aiReasoning说明`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { stakeholders } = body as { stakeholders: Stakeholder[] };

    if (!stakeholders || !Array.isArray(stakeholders)) {
      return NextResponse.json(
        { error: '需要提供干系人列表' },
        { status: 400 }
      );
    }

    const stakeholderList = stakeholders
      .map(s => `${s.name}(${s.role}) - 权力:${s.power}, 利益:${s.interest}, 当前参与度:${s.currentEngagement}, 期望参与度:${s.desiredEngagement}`)
      .join('\n');

    const userMessage = `干系人列表:\n${stakeholderList}`;

    const response = await llmComplete('stakeholder' as Parameters<typeof llmComplete>[0], STAKEHOLDER_PROMPT, userMessage, {
      temperature: 0.7,
    });

    // Parse AI response - in production would parse structured JSON
    // For now, return a formatted response
    const suggestions = stakeholders.map(s => ({
      ...s,
      managementStrategy: getDefaultStrategy(s),
    }));

    const aiReasoning = response.content || '基于干系人分析，已生成管理策略建议。';

    return NextResponse.json({
      suggestions,
      aiReasoning,
      model: response.model,
    });
  } catch (error: unknown) {
    console.error('[API/stakeholder] Error:', error);
    const message = error instanceof Error ? error.message : 'AI策略生成失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function getDefaultStrategy(s: Stakeholder): string {
  const highPower = s.power >= 4;
  const highInterest = s.interest >= 4;

  let baseStrategy = '';
  if (highPower && highInterest) {
    baseStrategy = '重点管理：';
  } else if (highPower && !highInterest) {
    baseStrategy = '保持满意：';
  } else if (!highPower && highInterest) {
    baseStrategy = '随时告知：';
  } else {
    baseStrategy = '监督：';
  }

  const engagementGap = getEngagementGapLabel(s.currentEngagement, s.desiredEngagement);

  const commMap: Record<string, string> = {
    '每周': '每周定期沟通',
    '每两周': '每两周沟通一次',
    '每月': '每月沟通一次',
    '按需': '按需沟通',
  };

  return `${baseStrategy}${engagementGap}${commMap[s.communicationFrequency] || '定期沟通'}，重点关注${s.role}角色的核心诉求。`;
}

function getEngagementGapLabel(current: string, desired: string): string {
  const order = ['不知情', '抵制', '中立', '支持', '领导'];
  const curIdx = order.indexOf(current);
  const desIdx = order.indexOf(desired);

  if (desIdx > curIdx) return '建议提升参与度，';
  if (desIdx < curIdx) return '注意管理期望，';
  return '';
}
