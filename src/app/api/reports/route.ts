// AI Report Generation API Endpoint
import { NextRequest, NextResponse } from 'next/server';
import { llmComplete, SYSTEM_PROMPTS } from '@/lib/llm';
import { ReportRequest, GeneratedReport, generateReportId, REPORT_TYPE_LABELS } from '@/lib/reports';

export async function POST(request: NextRequest) {
  try {
    const body: ReportRequest = await request.json();

    // Validate required fields
    if (!body.type || !body.projectName) {
      return NextResponse.json(
        { success: false, error: '缺少必填字段：type, projectName' },
        { status: 400 }
      );
    }

    // Build system prompt based on report type
    const systemPrompts: Record<string, string> = {
      weekly: `你是PMO项目管理专家，负责生成专业的项目周报。
规则：
1. 总-分-总结构：开头有执行摘要，结尾有总结
2. 用🔴🟡🟢标识问题严重程度（红色=严重/阻塞，黄色=注意，绿色=正常）
3. 数据真实，不编造数字，如需估算请标注"（估算）"
4. Markdown格式，层次分明，便于阅读
5. 中文专业商务语言
6. 包含：关键指标、本期完成、下期计划、风险与问题、资源需求`,
      monthly: `你是PMO项目管理专家，负责生成专业的项目月报。
规则：
1. 总-分-总结构：开头有执行摘要，结尾有总结
2. 用🔴🟡🟢标识问题严重程度
3. 数据真实，不编造数字，如需估算请标注"（估算）"
4. Markdown格式，层次分明
5. 中文专业商务语言
6. 包含：月度关键指标、本月完成情况、偏差分析、下月计划、风险预警`,
      progress: `你是项目经理，负责生成项目进度报告。
规则：
1. 清晰展示当前阶段和进度
2. 关键里程碑完成情况用状态图标标识（✅已完成 🔄进行中 ⏳未开始）
3. 偏差分析要客观
4. Markdown格式
5. 中文专业语言
6. 包含：项目概述、当前进度、里程碑跟踪、偏差分析、下阶段计划、风险预警`,
      meeting: `你是PMO助理，负责生成规范化的会议纪要。
规则：
1. 格式规范，信息完整
2. 决议用加粗标注
3. 待办事项用表格展示（任务、责任人、截止日期）
4. Markdown格式
5. 中文专业语言
6. 包含：会议基本信息、议程、决议、待办事项、未决议题、后续跟进`,
      acceptance: `你是项目经理，负责生成项目验收报告。
规则：
1. 对照验收标准逐项检查
2. 交付物清单用表格展示（交付物、验收状态、备注）
3. 问题与缺陷单独统计
4. Markdown格式
5. 中文专业语言
6. 包含：验收概览、交付物清单、功能验收、非功能验收、问题统计、验收结论`,
    };

    const systemPrompt = systemPrompts[body.type] || systemPrompts.weekly;

    // Build user message
    let userMessage = `项目名称：${body.projectName}`;

    if (body.dateRange) {
      userMessage += `\n报告期间：${body.dateRange.start} 至 ${body.dateRange.end}`;
    }

    userMessage += `\n\n语气风格：${
      body.tone === 'formal' ? '正式商务语言' :
      body.tone === 'concise' ? '简洁明了，突出重点' :
      '详细全面，涵盖所有细节'
    }\n\n`;

    // Add content sections based on type
    if (body.completedWork) {
      userMessage += `## 本期完成内容\n${body.completedWork}\n\n`;
    }
    if (body.nextPlans) {
      userMessage += `## 下期计划\n${body.nextPlans}\n\n`;
    }
    if (body.issues) {
      userMessage += `## 遇到的问题与风险\n${body.issues}\n\n`;
    }
    if (body.resourceNeeds) {
      userMessage += `## 资源需求\n${body.resourceNeeds}\n\n`;
    }

    userMessage += `\n请生成专业的${REPORT_TYPE_LABELS[body.type]}。`;

    // Call LLM with scene="report"
    const response = await llmComplete('report', systemPrompt, userMessage, {
      temperature: 0.7,
    });

    // Build generated report
    const report: GeneratedReport = {
      id: generateReportId(),
      type: body.type,
      title: `${body.projectName} - ${REPORT_TYPE_LABELS[body.type]}`,
      content: response.content,
      generatedAt: new Date().toISOString(),
      projectName: body.projectName,
    };

    return NextResponse.json({
      success: true,
      report,
    });

  } catch (error) {
    console.error('[API/reports/generate] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '报告生成失败，请稍后重试',
      },
      { status: 500 }
    );
  }
}