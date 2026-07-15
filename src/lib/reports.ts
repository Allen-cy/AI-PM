// Report Generation Types and Utilities

export type ReportType = 'weekly' | 'monthly' | 'progress' | 'meeting' | 'acceptance';

export interface ReportRequest {
  type: ReportType;
  projectName: string;
  dateRange?: { start: string; end: string };
  completedWork: string;
  nextPlans: string;
  issues: string;
  resourceNeeds: string;
  tone: 'formal' | 'concise' | 'detailed';
}

export interface ReportDataSource {
  label: string;
  detail: string;
  source: 'user_input' | 'feishu' | 'system' | 'ai' | 'fallback';
}

export interface ReportActionItem {
  title: string;
  owner: string;
  dueDate: string;
  priority: 'P0' | 'P1' | 'P2';
  sourceReason: string;
}

export interface GeneratedReport {
  id: string;
  type: ReportType;
  title: string;
  content: string;
  generatedAt: string;
  projectName: string;
  dataSources?: ReportDataSource[];
  actionItems?: ReportActionItem[];
  evidence?: import('@/features/ai/evidence').AiEvidence;
  requestId?: string;
  formalOutputId?: string;
  reportingSnapshotId?: string;
  formalStatus?: 'draft' | 'submitted' | 'approved' | 'published' | 'superseded' | 'archived';
  version?: number;
}

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  weekly: '项目周报',
  monthly: 'PMO月报',
  progress: '项目进度报告',
  meeting: '会议纪要',
  acceptance: '验收报告',
};

export const TONE_LABELS = {
  formal: '正式',
  concise: '简洁',
  detailed: '详细',
} as const;

export function generateReportMeta(request: ReportRequest): string {
  const date = new Date().toLocaleDateString('zh-CN');
  const typeLabel = REPORT_TYPE_LABELS[request.type];
  return `${request.projectName} - ${typeLabel} ${date}`;
}

export function getReportPrompt(request: ReportRequest): string {
  const { type, projectName, dateRange, completedWork, nextPlans, issues, resourceNeeds, tone } = request;

  const toneInstruction = {
    formal: '使用正式商务语言，结构严谨，避免口语化表达',
    concise: '简洁明了，突出关键信息，不冗余',
    detailed: '详细全面，涵盖所有细节，适当展开说明',
  }[tone];

  const dateRangeStr = dateRange
    ? `期间：${dateRange.start} 至 ${dateRange.end}`
    : `报告日期：${new Date().toLocaleDateString('zh-CN')}`;

  // 构建基础prompt
  let prompt = `## 任务
为"${projectName}"生成专业的项目管理报告。

## 要求
- 语气风格：${toneInstruction}
- 输出格式：Markdown，专业排版
- 数据真实：不编造数字，如需估算请标注"（估算）"

## 项目信息
- 项目名称：${projectName}
- ${dateRangeStr}`;

  // 根据报告类型添加不同section
  switch (type) {
    case 'weekly':
    case 'monthly':
      prompt += `
## 本期完成内容
${completedWork || '（请填写）'}

## 下期计划
${nextPlans || '（请填写）'}

## 遇到的问题与风险
${issues || '（无）'}

## 资源需求
${resourceNeeds || '（无）'}

## 输出要求
生成结构化报告，包含：
1. 报告摘要（核心指标一览）
2. 本期工作完成情况（里程碑、交付物）
3. 项目整体进度（如有百分比请标注）
4. 问题与风险分析（严重程度标识）
5. 下期工作计划与目标
6. 资源需求与协调事项

请使用🔴🟡🟢标识问题严重程度。`;
      break;

    case 'progress':
      prompt += `
## 进度详情
${completedWork || '（请填写当前进度）'}

## 下阶段计划
${nextPlans || '（请填写）'}

## 风险与问题
${issues || '（请填写）'}

## 输出要求
生成项目进度报告，包含：
1. 项目概述与当前阶段
2. 进度跟踪（关键里程碑完成情况）
3. 偏差分析（如有延期需说明原因）
4. 下阶段目标与关键路径
5. 风险预警与应对措施`;
      break;

    case 'meeting':
      prompt += `
## 会议要点/记录
${completedWork || '（请填写会议要点）'}

## 待决事项
${nextPlans || '（如有）'}

## 输出要求
生成规范化会议纪要，包含：
1. 会议基本信息（时间、地点、参会人）
2. 核心决议（决策内容、结论）
3. 待办事项（任务描述、责任人、截止日期）
4. 未决议题（需进一步讨论的事项）
5. 后续跟进事项

使用表格清晰展示待办清单。`;
      break;

    case 'acceptance':
      prompt += `
## 交付物清单
${completedWork || '（请填写已交付内容）'}

## 验收标准对比
${nextPlans || '（请填写验收标准）'}

## 问题与遗留
${issues || '（如有）'}

## 资源情况
${resourceNeeds || '（如有）'}

## 输出要求
生成验收报告，包含：
1. 验收概览（项目名称、验收日期、验收范围）
2. 交付物清单与验收状态对照表
3. 功能验收情况（是否符合需求）
4. 非功能性验收（性能、安全、稳定性）
5. 问题与缺陷统计
6. 验收结论与遗留事项
7. 最终验收签字栏`;
      break;
  }

  return prompt;
}

// 估算阅读时间（中文约500字/分钟）
export function estimateReadingTime(content: string): string {
  const chineseChars = content.replace(/[^一-龥]/g, '').length;
  const words = Math.ceil(chineseChars / 500);
  return words <= 1 ? '1 分钟' : `${words} 分钟`;
}

// 生成唯一ID
export function generateReportId(): string {
  return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
