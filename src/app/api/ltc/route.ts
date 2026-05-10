import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { projectId, stageId, stageData } = await request.json();

    // AI stage review simulation
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Basic validation
    if (!stageData?.entryCriteria?.length) {
      issues.push('缺少入口标准定义');
    }
    if (!stageData?.exitCriteria?.length) {
      issues.push('缺少出口标准定义');
    }
    if (!stageData?.deliverables?.length) {
      issues.push('缺少交付物定义');
    }

    // Simulate AI review reasoning
    const aiReasoning = `
【AI阶段评审报告】

项目: ${projectId}
阶段: ${stageData?.name || stageId} (${stageData?.alias || ''})

📋 评审维度:

1. 入口标准检查:
   - ${stageData?.entryCriteria?.length > 0 ? '✓ 已定义 ' + stageData.entryCriteria.length + ' 项入口标准' : '✗ 未定义入口标准'}

2. 出口标准检查:
   - ${stageData?.exitCriteria?.length > 0 ? '✓ 已定义 ' + stageData.exitCriteria.length + ' 项出口标准' : '✗ 未定义出口标准'}

3. 交付物检查:
   - ${stageData?.deliverables?.length > 0 ? '✓ 已定义 ' + stageData.deliverables.length + ' 项交付物' : '✗ 未定义交付物'}

4. RACI矩阵检查:
   - ${stageData?.raciMatrix ? '✓ 已定义RACI矩阵' : '✗ 未定义RACI矩阵'}

📊 评审结论:
${issues.length === 0 ? '✓ 阶段配置完整，可进入下一阶段审批流程' : '⚠ 阶段配置存在缺陷，建议补充完善'}

${suggestions.length > 0 ? '💡 改进建议:\n' + suggestions.map(s => `- ${s}`).join('\n') : ''}
`.trim();

    return NextResponse.json({
      approved: issues.length === 0,
      issues,
      suggestions,
      aiReasoning,
    });
  } catch (error) {
    console.error('LTC review error:', error);
    return NextResponse.json(
      { approved: false, issues: ['系统错误'], suggestions: ['请稍后重试'], aiReasoning: '评审服务暂不可用' },
      { status: 500 }
    );
  }
}