import type { FeishuActionBody } from "../feishu/action-payload.ts";
import type { GovernanceImpactDashboard, GovernanceImpactPackage } from "./impact.ts";

export interface GovernanceWritebackConfirmationItem {
  id: string;
  instanceId: string;
  workflowName: string;
  projectName: string;
  severity: GovernanceImpactPackage["severity"];
  targetSummary: string;
  updateCount: number;
  reportFactCount: number;
  confirmationRequired: boolean;
  humanInputs: string[];
  outputArtifacts: string[];
  feishuDocumentPayload: FeishuActionBody;
}

export interface GovernanceWritebackConfirmationPackage {
  generatedAt: string;
  summary: {
    totalPackages: number;
    confirmationRequired: number;
    highSeverity: number;
    projectUpdates: number;
    riskUpdates: number;
    reportFacts: number;
  };
  items: GovernanceWritebackConfirmationItem[];
  boundary: string;
}

function titleFor(item: GovernanceImpactPackage): string {
  return `治理反写确认包-${item.workflowName}-${item.projectName}`;
}

function bulletsFor(item: GovernanceImpactPackage): string[] {
  return [
    `流程：${item.workflowName}；项目：${item.projectName}；当前状态：${item.state}`,
    `结论：${item.summary}`,
    `下一步：${item.nextAction}`,
    ...item.updates.map(update => `${update.targetType === "risk" ? "风险" : "项目"}写回建议：${update.targetName}.${update.field}=${update.suggestedValue}；原因：${update.reason}`),
  ].slice(0, 18);
}

export function buildGovernanceWritebackConfirmationPackage(
  impact: GovernanceImpactDashboard,
  now = new Date(),
): GovernanceWritebackConfirmationPackage {
  const items = impact.packages
    .filter(item => item.updates.length > 0 || item.reportFacts.length > 0)
    .map(item => {
      const title = titleFor(item);
      const bullets = bulletsFor(item);
      return {
        id: `governance-writeback:${item.instanceId}`,
        instanceId: item.instanceId,
        workflowName: item.workflowName,
        projectName: item.projectName,
        severity: item.severity,
        targetSummary: `${item.workflowName} / ${item.projectName} / ${item.updates.length} 条写回建议`,
        updateCount: item.updates.length,
        reportFactCount: item.reportFacts.length,
        confirmationRequired: item.writebackMode === "manual_confirmation_required",
        humanInputs: [
          "PMO确认治理流程输出是否完整。",
          "项目经理/风险责任人确认字段值和业务影响。",
          "管理员确认目标飞书表、字段和权限可写。",
        ],
        outputArtifacts: [
          "治理反写确认包",
          "飞书待确认文档草稿",
          "报告工厂事实清单",
          "操作审计记录",
        ],
        feishuDocumentPayload: {
          type: "document",
          idempotency_key: `governance-writeback:${item.instanceId}`,
          title,
          summary: [
            item.summary,
            `写回模式：${item.writebackMode === "manual_confirmation_required" ? "需人工确认" : "仅审计记录"}`,
            `报告事实：${item.reportFacts.join("；") || "暂无"}`,
          ].join("\n"),
          bullets,
        },
      };
    });

  return {
    generatedAt: now.toISOString(),
    summary: {
      totalPackages: items.length,
      confirmationRequired: items.filter(item => item.confirmationRequired).length,
      highSeverity: items.filter(item => item.severity === "high").length,
      projectUpdates: impact.summary.projectWritebacks,
      riskUpdates: impact.summary.riskWritebacks,
      reportFacts: impact.summary.reportFacts,
    },
    items,
    boundary: "治理反写确认包只形成待确认材料和飞书写入草稿；实际写回项目台账或风险登记册必须由用户在集成中心确认执行。",
  };
}
