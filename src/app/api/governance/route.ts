import { NextRequest, NextResponse } from "next/server";

// Mock data for governance analysis
const GOVERNANCE_MOCK = {
  portfolioHealth: {
    score: 78,
    trend: "+3",
    status: "yellow",
    factors: ["资源饱和度超标", "部分项目进度偏差", "变更控制率偏低"],
  },
  exceptionSummary: {
    critical: 3,
    warning: 12,
    normal: 32,
    trend: "-2",
  },
  pmoMaturity: {
    level: 3,
    maxLevel: 5,
    dimensions: {
      governance: 78,
      risk: 72,
      quality: 85,
      communication: 68,
      change: 61,
    },
  },
  aiSuggestions: [
    {
      category: "风险缓解",
      priority: "高",
      suggestion: "技术架构师资源饱和度达95%，建议暂停新项目接入并启动资源调配",
      impact: "避免项目交付延期风险",
    },
    {
      category: "治理改进",
      priority: "中",
      suggestion: "变更控制合规率仅76%，建议加强变更评审委员会运作",
      impact: "提升项目基准控制能力",
    },
    {
      category: "OKR优化",
      priority: "中",
      suggestion: "流程标准化率OKR仅55%，建议调整为分阶段目标",
      impact: "提高OKR达成可行性",
    },
  ],
};

// OKR generation templates
const OKR_TEMPLATES = {
  company: [
    { objective: "实现年度营收增长{target}%", keyResults: ["Q2新增合同额达到{amount}万", "客户续约率达到{rate}%", "重点客户渗透率提升至{target}%"] },
    { objective: "提升客户满意度至{target}分", keyResults: ["NPS评分达到{target}分以上", "客户投诉24小时响应率100%", "客户满意度调查参与率≥90%"] },
  ],
  department: [
    { objective: "项目管理能力达到行业领先水平", keyResults: ["PMBOK/PRINCE2认证通过人数≥{count}人", "项目文档规范化达到{target}%", "项目复盘会议覆盖率100%"] },
  ],
  project: [
    { objective: "按时按质交付项目成果", keyResults: ["里程碑达成率≥95%", "客户验收满意度≥{target}分", "缺陷遗留率≤{rate}%"] },
  ],
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, context } = body;

    // Simulate AI processing delay
    await new Promise(resolve => setTimeout(resolve, 500));

    switch (action) {
      case "analyzeGovernance": {
        // AI-assisted governance analysis
        return NextResponse.json({
          success: true,
          data: {
            portfolioHealth: GOVERNANCE_MOCK.portfolioHealth,
            exceptionSummary: GOVERNANCE_MOCK.exceptionSummary,
            pmoMaturity: GOVERNANCE_MOCK.pmoMaturity,
            aiSuggestions: GOVERNANCE_MOCK.aiSuggestions,
            generatedAt: new Date().toISOString(),
          },
        });
      }

      case "generateOKR": {
        // AI-assisted OKR generation
        const { level = "company", customParams = {} } = context || {};
        const templates = OKR_TEMPLATES[level as keyof typeof OKR_TEMPLATES] || OKR_TEMPLATES.company;

        const generatedOKRs = templates.map((template, index) => {
          const krWithParams = template.keyResults.map((kr: string) => {
            let result = kr;
            Object.entries(customParams).forEach(([key, value]) => {
              result = result.replace(`{${key}}`, String(value));
            });
            return result;
          });

          return {
            id: `O${index + 1}`,
            level,
            objective: template.objective
              .replace("{target}", customParams.target || "30")
              .replace("{amount}", customParams.amount || "1500")
              .replace("{rate}", customParams.rate || "85")
              .replace("{count}", customParams.count || "20"),
            keyResults: krWithParams.map((kr: string, i: number) => ({
              id: `KR${i + 1}`,
              kr,
              progress: Math.floor(Math.random() * 30) + 10,
              owner: customParams.owner || "待定",
            })),
          };
        });

        return NextResponse.json({
          success: true,
          data: {
            generatedOKRs,
            suggestions: [
              "建议OKR设置遵循SMART原则，确保具体、可衡量",
              "关键结果应与Objective强相关，避免OKR脱节",
              "建议每个Objective配置3-5个Key Results",
            ],
          },
        });
      }

      case "analyzeException": {
        // Analyze exception projects
        const { projectId } = context || {};
        return NextResponse.json({
          success: true,
          data: {
            projectId,
            analysis: {
              rootCause: "资源分配不均 + 需求变更频繁",
              severity: "中",
              recommendedActions: [
                "重新评估资源分配方案",
                "加强需求变更控制流程",
                "建立早期预警机制",
              ],
              expectedRecovery: "4-6周",
            },
          },
        });
      }

      case "assessPRINCE2Compliance": {
        // PRINCE2 compliance self-assessment
        return NextResponse.json({
          success: true,
          data: {
            overall: 86,
            principles: [
              { name: "持续业务验证", compliant: true, score: 92 },
              { name: "吸取经验教训", compliant: true, score: 88 },
              { name: "明确定义角色与职责", compliant: true, score: 95 },
              { name: "按阶段管理", compliant: true, score: 82 },
              { name: "例外管理", compliant: false, score: 65 },
              { name: "产品导向规划", compliant: true, score: 90 },
              { name: "情境适配", compliant: true, score: 84 },
            ],
            themes: [
              { name: "Business Case", score: 85 },
              { name: "Organization", score: 92 },
              { name: "Quality", score: 88 },
              { name: "Plans", score: 80 },
              { name: "Risk", score: 75 },
              { name: "Change", score: 68 },
              { name: "Progress", score: 78 },
            ],
            recommendations: [
              "例外管理机制需强化，建议明确授权阈值",
              "变更控制流程合规率偏低，需加强培训",
            ],
          },
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: "Unknown action" },
          { status: 400 }
        );
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      endpoints: [
        "POST /api/governance - AI-assisted governance analysis",
        "Actions: analyzeGovernance, generateOKR, analyzeException, assessPRINCE2Compliance",
      ],
      version: "1.0",
    },
  });
}