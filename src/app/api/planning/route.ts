import { NextResponse } from 'next/server';
import { llmComplete } from '@/lib/llm';

interface AssistRequest {
  projectType: '信息化' | '课程' | '工程' | '运营';
  knowledgeArea: string;
  context?: {
    projectName?: string;
    constraints?: string[];
    objectives?: string[];
  };
}

export async function POST(request: Request) {
  try {
    const body: AssistRequest = await request.json();
    const { projectType, knowledgeArea, context } = body;

    if (!projectType || !knowledgeArea) {
      return NextResponse.json(
        { error: 'Missing required fields: projectType, knowledgeArea' },
        { status: 400 }
      );
    }

    // Build context for AI
    const contextStr = context
      ? `\n项目背景：
- 项目名称：${context.projectName || '未命名项目'}
- 约束条件：${context.constraints?.join('；') || '暂无'}
- 项目目标：${context.objectives?.join('；') || '暂无'}`
      : '';

    const systemPrompt = `你是PMBOK项目管理规划助手，为${projectType}类型的项目提供${knowledgeArea}知识领域的规划指导。

要求：
1. 输出JSON格式，包含suggestions、checklist、warnings三个字段
2. suggestions：提供3-5条具体的规划建议
3. checklist：提供该知识领域的规划检查清单（5-8项）
4. warnings：列出2-4个常见的规划陷阱或风险点
5. 所有内容使用中文，简洁专业
6. 结合中国项目管理实践（如有）`;

    const userMessage = `请为${projectType}项目的${knowledgeArea}领域提供规划指导。${contextStr}`;

    // Call AI for suggestions
    const response = await llmComplete('planning', systemPrompt, userMessage);

    // Parse AI response
    let parsed: { suggestions: string[]; checklist: string[]; warnings: string[] };
    try {
      // Try to extract JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: generate structured response
        parsed = generateFallbackResponse(projectType, knowledgeArea);
      }
    } catch {
      parsed = generateFallbackResponse(projectType, knowledgeArea);
    }

    return NextResponse.json({
      suggestions: parsed.suggestions,
      checklist: parsed.checklist,
      warnings: parsed.warnings,
      knowledgeArea,
      projectType,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[planning/assist] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate planning assistance' },
      { status: 500 }
    );
  }
}

// Fallback response generator
function generateFallbackResponse(
  projectType: string,
  knowledgeArea: string
): { suggestions: string[]; checklist: string[]; warnings: string[] } {
  const responses: Record<string, { suggestions: string[]; checklist: string[]; warnings: string[] }> = {
    integration: {
      suggestions: [
        '制定项目管理计划，明确各知识领域的管理方法',
        '建立变更控制流程，确保项目范围和基准可控',
        '设置阶段审查点，定期评估项目状态',
        '建立项目收尾清单，确保交付物完整移交',
      ],
      checklist: [
        '项目章程已批准',
        '项目管理计划已定义',
        '变更管理流程已建立',
        '阶段审查机制已设定',
        '项目收尾标准已明确',
        '项目治理结构已建立',
      ],
      warnings: [
        '过度强调整合而忽略各知识领域的特殊性',
        '变更控制不严格导致范围蔓延',
        '缺乏有效的项目监控机制',
      ],
    },
    scope: {
      suggestions: [
        '使用WBS分解项目工作，明确交付物层次结构',
        '制定详细的需求管理计划，跟踪需求变更',
        '建立范围基准，作为项目控制的依据',
        '识别范围管理与其他知识领域的接口',
      ],
      checklist: [
        '项目范围说明书已完成',
        'WBS已分解到工作包级别',
        '范围基准已批准',
        '需求变更已建立流程',
        '范围状态已定义测量指标',
      ],
      warnings: [
        '范围定义不清晰导致后续变更频繁',
        'WBS分解过细或过粗，影响管理效率',
        '范围蔓延未及时识别和控制',
      ],
    },
    schedule: {
      suggestions: [
        '识别关键路径，确保关键活动资源充足',
        '使用甘特图和里程碑计划展示项目进度',
        '建立进度基准，用于绩效测量',
        '设置进度预警机制，及时发现延误',
      ],
      checklist: [
        '项目进度计划已制定',
        '关键路径已识别',
        '进度基准已批准',
        '进度测量机制已建立',
        '进度变更流程已定义',
      ],
      warnings: [
        '关键路径识别错误导致进度失控',
        '资源冲突未识别导致活动延误',
        '依赖关系定义不准确影响进度',
      ],
    },
    cost: {
      suggestions: [
        '制定详细的成本估算，考虑直接和间接成本',
        '建立成本基准，作为预算控制的依据',
        '使用挣值管理（EVM）监控成本绩效',
        '设置成本预警阈值，及时发现超支',
      ],
      checklist: [
        '成本估算已完成',
        '成本基准已批准',
        '预算分配已确定',
        '成本监控机制已建立',
        '成本变更流程已定义',
      ],
      warnings: [
        '成本估算遗漏关键成本项',
        '资源费率假设不准确',
        '未考虑风险储备导致预算不足',
      ],
    },
    risk: {
      suggestions: [
        '建立风险登记册，系统化管理项目风险',
        '使用概率影响矩阵评估风险优先级',
        '制定风险应对策略，包括应急计划',
        '定期审查风险状态，及时更新风险信息',
      ],
      checklist: [
        '风险识别已完成',
        '风险评估已进行',
        '风险应对策略已制定',
        '风险登记册已建立',
        '风险监控机制已运行',
      ],
      warnings: [
        '风险识别不全面，遗漏重要风险',
        '风险应对策略缺乏针对性',
        '风险监控流于形式，未实际执行',
      ],
    },
    quality: {
      suggestions: [
        '制定质量管理计划，明确质量标准和度量指标',
        '建立质量保证流程，确保过程符合要求',
        '实施质量控制检查，验证交付物质量',
        '收集质量数据，持续改进项目质量',
      ],
      checklist: [
        '质量标准已定义',
        '质量管理计划已批准',
        '质量保证活动已安排',
        '质量控制检查点已设置',
        '质量测量指标已确定',
      ],
      warnings: [
        '质量标准定义不清或无法测量',
        '质量检查流于形式，未真正执行',
        '质量改进建议未实际落实',
      ],
    },
    resource: {
      suggestions: [
        '制定资源管理计划，明确资源获取和分配方式',
        '建立资源日历，跟踪资源使用情况',
        '使用责任分配矩阵（RAM）明确角色职责',
        '设置资源预警机制，及时发现资源冲突',
      ],
      checklist: [
        '资源需求已识别',
        '资源管理计划已批准',
        '资源分配已确定',
        '角色职责已明确（RAM）',
        '资源监控机制已建立',
      ],
      warnings: [
        '资源需求估算不准确',
        '资源冲突未及时识别和解决',
        '团队成员角色职责不清晰',
      ],
    },
    communications: {
      suggestions: [
        '制定沟通管理计划，明确信息发布和收集方式',
        '建立沟通渠道清单，确保信息传递畅通',
        '设置沟通频率和格式，规范信息交换',
        '定期评估沟通效果，及时调整沟通策略',
      ],
      checklist: [
        '沟通需求已分析',
        '沟通管理计划已批准',
        '沟通渠道已建立',
        '沟通报告机制已设定',
        '干系人信息需求已明确',
      ],
      warnings: [
        '沟通计划不符合干系人需求',
        '重要信息未及时传递给相关方',
        '沟通记录不完整，难以追溯',
      ],
    },
    procurement: {
      suggestions: [
        '制定采购管理计划，明确采购流程和策略',
        '编制招标文件，确保采购需求完整清晰',
        '建立供应商评估标准，选择合格供应商',
        '设置合同管理机制，监控供应商绩效',
      ],
      checklist: [
        '采购需求已明确',
        '采购策略已制定',
        '招标文件已准备',
        '供应商评估已完成',
        '合同管理机制已建立',
      ],
      warnings: [
        '采购需求描述不清晰导致供应商误解',
        '供应商选择标准不客观',
        '合同条款不完善导致后续纠纷',
      ],
    },
    stakeholder: {
      suggestions: [
        '识别所有干系人，建立干系人登记册',
        '分析干系人需求和期望，制定参与策略',
        '使用权力利益方格对干系人进行分类管理',
        '定期更新干系人状态，评估参与效果',
      ],
      checklist: [
        '干系人已识别',
        '干系人分析已完成',
        '干系人管理策略已制定',
        '沟通策略已针对干系人',
        '干系人参与度已评估',
      ],
      warnings: [
        '关键干系人遗漏未识别',
        '干系人期望管理不当导致不满',
        '干系人沟通策略缺乏针对性',
      ],
    },
  };

  return responses[knowledgeArea] || responses.integration;
}