import { isTerminalGovernanceState, type GovernanceActionRecord, type GovernanceEventRecord, type GovernanceInstanceRecord } from "./model.ts";
import { deriveGovernanceSla } from "./sla.ts";

export type GovernanceImpactTargetType = "project" | "risk" | "report";
export type GovernanceImpactWritebackMode = "manual_confirmation_required" | "audit_only";
export type GovernanceImpactSeverity = "high" | "medium" | "low";

export interface GovernanceImpactUpdate {
  targetType: GovernanceImpactTargetType;
  targetName: string;
  field: string;
  suggestedValue: string;
  reason: string;
  requiresConfirmation: boolean;
}

export interface GovernanceImpactPackage {
  instanceId: string;
  workflowId: string;
  workflowName: string;
  projectName: string;
  state: string;
  decision: string;
  severity: GovernanceImpactSeverity;
  writebackMode: GovernanceImpactWritebackMode;
  summary: string;
  updates: GovernanceImpactUpdate[];
  reportFacts: string[];
  auditTrail: string[];
  nextAction: string;
}

export interface GovernanceImpactDashboard {
  summary: {
    totalImpacts: number;
    projectWritebacks: number;
    riskWritebacks: number;
    reportFacts: number;
    pendingConfirmation: number;
    highSeverity: number;
  };
  packages: GovernanceImpactPackage[];
  reportFacts: string[];
}

function transitionLabel(event?: GovernanceEventRecord | null): string {
  if (!event) return "state-derived";
  const from = event.fromState || "-";
  return `${event.eventType}:${from}->${event.toState}`;
}

function stateOutcome(state: string): "approved" | "conditional" | "rejected" | "closed" | "in_progress" {
  if (["已通过", "已批准", "已验收", "已归档", "已升级"].includes(state)) return "approved";
  if (["有条件通过", "需补充", "需整改", "应对中"].includes(state)) return "conditional";
  if (["已驳回", "已拒绝", "暂停"].includes(state)) return "rejected";
  if (["已关闭", "已实施"].includes(state)) return "closed";
  return "in_progress";
}

function workflowImpactPlan(instance: GovernanceInstanceRecord, actions: GovernanceActionRecord[] = []): {
  severity: GovernanceImpactSeverity;
  summary: string;
  updates: GovernanceImpactUpdate[];
  nextAction: string;
} {
  const outcome = stateOutcome(instance.state);
  const hasOpenActions = actions.some(action => action.status === "open" || action.status === "overdue");
  const targetProject = instance.projectName;
  const confirmationRequired = true;

  if (instance.workflowId === "project-initiation-review") {
    if (outcome === "approved") {
      return {
        severity: "medium",
        summary: "立项评审通过，建议将项目台账推进到启动阶段并补齐章程/预算基线。",
        updates: [
          { targetType: "project", targetName: targetProject, field: "项目状态", suggestedValue: "启动中", reason: "立项评审已通过，项目可进入正式启动。", requiresConfirmation: confirmationRequired },
          { targetType: "project", targetName: targetProject, field: "当前阶段", suggestedValue: "启动阶段", reason: "立项输出成果包含是否进入启动阶段。", requiresConfirmation: confirmationRequired },
        ],
        nextAction: "由项目经理确认项目章程、预算假设和关键干系人后写回项目台账。",
      };
    }
    if (outcome === "rejected") {
      return {
        severity: "high",
        summary: "立项评审未通过，建议暂停项目主数据推进并记录驳回原因。",
        updates: [
          { targetType: "project", targetName: targetProject, field: "项目状态", suggestedValue: "立项驳回", reason: "立项评审已驳回，不应进入正式启动。", requiresConfirmation: confirmationRequired },
        ],
        nextAction: "由业务负责人确认是否重提商业论证或终止立项。",
      };
    }
  }

  if (instance.workflowId === "stage-gate-review") {
    if (outcome === "approved") {
      return {
        severity: "medium",
        summary: "阶段门已通过，建议授权进入下一阶段，并同步阶段结论到项目报告。",
        updates: [
          { targetType: "project", targetName: targetProject, field: "阶段门状态", suggestedValue: "已通过", reason: "阶段门评审结论已通过。", requiresConfirmation: confirmationRequired },
          { targetType: "project", targetName: targetProject, field: "下一阶段授权", suggestedValue: "已授权", reason: "阶段门输出成果要求明确下一阶段授权。", requiresConfirmation: confirmationRequired },
        ],
        nextAction: "由 PMO 确认阶段成果和下一阶段计划后写回项目台账。",
      };
    }
    if (outcome === "conditional" || hasOpenActions) {
      return {
        severity: "high",
        summary: "阶段门有条件通过或存在未关闭整改项，建议保持项目受控推进并跟踪整改关闭。",
        updates: [
          { targetType: "project", targetName: targetProject, field: "阶段门状态", suggestedValue: "有条件通过", reason: "仍有整改行动项或结论为有条件通过。", requiresConfirmation: confirmationRequired },
          { targetType: "project", targetName: targetProject, field: "项目状态", suggestedValue: "受控推进", reason: "下一阶段推进需受整改项约束。", requiresConfirmation: confirmationRequired },
        ],
        nextAction: "责任人关闭整改行动项后，PMO 再确认是否完全放行。",
      };
    }
    if (outcome === "rejected") {
      return {
        severity: "high",
        summary: "阶段门暂停，建议阻断下一阶段授权并进入项目例外治理。",
        updates: [
          { targetType: "project", targetName: targetProject, field: "阶段门状态", suggestedValue: "暂停", reason: "阶段门评审结果为暂停或未通过。", requiresConfirmation: confirmationRequired },
          { targetType: "project", targetName: targetProject, field: "项目状态", suggestedValue: "治理暂停", reason: "未获得下一阶段授权。", requiresConfirmation: confirmationRequired },
        ],
        nextAction: "PMO 组织项目例外评审，明确恢复条件和责任动作。",
      };
    }
  }

  if (instance.workflowId === "change-control") {
    if (outcome === "approved") {
      return {
        severity: "medium",
        summary: "变更已批准，建议更新范围/成本/进度/质量基线，并在报告中标注变更依据。",
        updates: [
          { targetType: "project", targetName: targetProject, field: "变更状态", suggestedValue: "已批准", reason: "变更评审已批准。", requiresConfirmation: confirmationRequired },
          { targetType: "project", targetName: targetProject, field: "项目基线", suggestedValue: "待按审批结论更新", reason: "变更输出成果包含更新后的基线。", requiresConfirmation: confirmationRequired },
        ],
        nextAction: "项目经理按审批结论更新基线，并补充客户/业务确认材料。",
      };
    }
    if (outcome === "closed") {
      return {
        severity: "medium",
        summary: "变更已实施，建议关闭变更事项并同步影响到进度、成本和验收口径。",
        updates: [
          { targetType: "project", targetName: targetProject, field: "变更状态", suggestedValue: "已实施", reason: "变更流程已流转到已实施。", requiresConfirmation: confirmationRequired },
        ],
        nextAction: "PMO 抽查实施证据，确认基线和报告口径一致。",
      };
    }
    if (outcome === "rejected") {
      return {
        severity: "low",
        summary: "变更被拒绝，建议保持原基线，并在报告中保留审批记录。",
        updates: [
          { targetType: "project", targetName: targetProject, field: "变更状态", suggestedValue: "已拒绝", reason: "变更评审未批准。", requiresConfirmation: confirmationRequired },
        ],
        nextAction: "项目经理通知相关干系人继续按原基线执行。",
      };
    }
  }

  if (instance.workflowId === "risk-escalation") {
    if (outcome === "approved") {
      return {
        severity: "high",
        summary: "风险已升级，建议将风险登记册状态推进到应对实施，并同步责任人与 deadline。",
        updates: [
          { targetType: "risk", targetName: targetProject, field: "风险状态", suggestedValue: "应对实施中", reason: "风险升级评审已升级，需进入正式应对实施。", requiresConfirmation: confirmationRequired },
          { targetType: "risk", targetName: targetProject, field: "治理升级状态", suggestedValue: "已升级", reason: "治理流程结论为已升级。", requiresConfirmation: confirmationRequired },
        ],
        nextAction: "风险责任人补齐应急计划执行证据，PMO 按 deadline 监督关闭。",
      };
    }
    if (outcome === "closed") {
      return {
        severity: "medium",
        summary: "风险升级流程已关闭，建议复核风险关闭证据并同步风险登记册。",
        updates: [
          { targetType: "risk", targetName: targetProject, field: "风险状态", suggestedValue: "已关闭", reason: "风险升级治理流程已关闭。", requiresConfirmation: confirmationRequired },
        ],
        nextAction: "PMO 复核关闭证据，确认触发条件消除或剩余风险可接受。",
      };
    }
    if (outcome === "conditional") {
      return {
        severity: "high",
        summary: "风险升级仍在应对中，建议保持高风险提醒并要求责任人补充证据。",
        updates: [
          { targetType: "risk", targetName: targetProject, field: "风险状态", suggestedValue: "应对中", reason: "治理流程尚未关闭，风险应保持跟踪。", requiresConfirmation: confirmationRequired },
        ],
        nextAction: "责任人提交应对进展、剩余风险和下一次复核日期。",
      };
    }
  }

  if (instance.workflowId === "project-closure") {
    if (outcome === "approved") {
      return {
        severity: "medium",
        summary: "项目已验收，建议同步验收状态，并把遗留问题/回款跟进进入收尾清单。",
        updates: [
          { targetType: "project", targetName: targetProject, field: "验收状态", suggestedValue: "已验收", reason: "项目收尾验收已通过。", requiresConfirmation: confirmationRequired },
          { targetType: "project", targetName: targetProject, field: "项目状态", suggestedValue: "收尾中", reason: "验收完成后仍需归档、复盘和回款跟进。", requiresConfirmation: confirmationRequired },
        ],
        nextAction: "项目经理完成归档清单、复盘报告和回款跟进事项。",
      };
    }
    if (outcome === "closed") {
      return {
        severity: "low",
        summary: "项目已归档，建议将项目台账状态更新为已结项并保留复盘报告。",
        updates: [
          { targetType: "project", targetName: targetProject, field: "项目状态", suggestedValue: "已结项", reason: "收尾验收流程已归档。", requiresConfirmation: confirmationRequired },
        ],
        nextAction: "PMO 抽查归档材料完整性，并沉淀经验教训。",
      };
    }
    if (outcome === "conditional") {
      return {
        severity: "high",
        summary: "验收需整改，建议保持项目未关闭，并跟踪整改与回款条件。",
        updates: [
          { targetType: "project", targetName: targetProject, field: "验收状态", suggestedValue: "需整改", reason: "收尾验收流程仍有整改要求。", requiresConfirmation: confirmationRequired },
        ],
        nextAction: "责任人完成整改证据后再提交验收/归档确认。",
      };
    }
  }

  return {
    severity: isTerminalGovernanceState(instance.state) ? "low" : "medium",
    summary: "治理流程已更新，当前阶段暂不建议自动写回项目或风险主数据。",
    updates: [],
    nextAction: "继续按流程状态补齐输入、输出、行动项和审批意见。",
  };
}

export function buildGovernanceImpactPackage(input: {
  instance: GovernanceInstanceRecord;
  event?: GovernanceEventRecord | null;
  actions?: GovernanceActionRecord[];
}): GovernanceImpactPackage {
  const actions = input.actions ?? [];
  const plan = workflowImpactPlan(input.instance, actions);
  const sla = deriveGovernanceSla(input.instance);
  const reportFacts = [
    `${input.instance.workflowName}｜${input.instance.projectName}｜状态：${input.instance.state}｜SLA：${sla.label}`,
    plan.summary,
    ...plan.updates.map(update => `${update.targetType === "risk" ? "风险" : "项目"}写回建议：${update.targetName}.${update.field}=${update.suggestedValue}`),
  ];
  return {
    instanceId: input.instance.id,
    workflowId: input.instance.workflowId,
    workflowName: input.instance.workflowName,
    projectName: input.instance.projectName,
    state: input.instance.state,
    decision: input.event?.decision || transitionLabel(input.event),
    severity: plan.severity,
    writebackMode: plan.updates.length > 0 ? "manual_confirmation_required" : "audit_only",
    summary: plan.summary,
    updates: plan.updates,
    reportFacts,
    auditTrail: [
      `流程ID：${input.instance.id}`,
      `状态：${input.instance.state}`,
      `事件：${transitionLabel(input.event)}`,
      `输出：${input.instance.outputSummary || input.event?.comment || "待补充"}`,
    ],
    nextAction: plan.nextAction,
  };
}

export function buildGovernanceImpactDashboard(instances: GovernanceInstanceRecord[]): GovernanceImpactDashboard {
  const packages = instances.map(instance => buildGovernanceImpactPackage({ instance }));
  const reportFacts = packages.flatMap(item => item.reportFacts).slice(0, 12);
  return {
    summary: {
      totalImpacts: packages.length,
      projectWritebacks: packages.reduce((sum, item) => sum + item.updates.filter(update => update.targetType === "project").length, 0),
      riskWritebacks: packages.reduce((sum, item) => sum + item.updates.filter(update => update.targetType === "risk").length, 0),
      reportFacts: reportFacts.length,
      pendingConfirmation: packages.filter(item => item.writebackMode === "manual_confirmation_required").length,
      highSeverity: packages.filter(item => item.severity === "high").length,
    },
    packages,
    reportFacts,
  };
}
