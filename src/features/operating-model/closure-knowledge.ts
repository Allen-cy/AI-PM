export interface ClosureGateFacts {
  openTasks: number;
  unacceptedDeliverables: number;
  openHighRisks: number;
  openIssues: number;
  pendingChanges: number;
  acceptanceEvidence: number;
  outstandingReceivable: number;
  archiveEvidence: number;
  handoverEvidence: number;
  benefitBaselineRequired: boolean;
  benefitBaselineCount: number;
}

export function canReviewClosureAssessment(input: {
  status: string;
  ready: boolean;
  role: string;
  currentGateReady: boolean;
}): boolean {
  return input.status === "submitted"
    && input.ready
    && input.currentGateReady
    && ["pmo", "sponsor"].includes(input.role);
}

export function evaluateClosureGate(facts: ClosureGateFacts) {
  const blockers: Array<{ code: string; category: string; message: string; requiredAction: string }> = [];
  const add = (condition: boolean, code: string, category: string, message: string, requiredAction: string) => { if (condition) blockers.push({ code, category, message, requiredAction }); };
  add(facts.openTasks > 0, "OPEN_TASKS", "交付", `仍有${facts.openTasks}项任务未关闭`, "完成、取消并审批或转入明确的运维待办");
  add(facts.unacceptedDeliverables > 0, "DELIVERABLES_NOT_ACCEPTED", "验收", `仍有${facts.unacceptedDeliverables}项交付物未验收`, "补齐验收人、验收结论和验收证据");
  add(facts.openHighRisks > 0, "HIGH_RISKS_OPEN", "风险", `仍有${facts.openHighRisks}项高风险未处置`, "关闭、转移或由授权人书面接受剩余风险");
  add(facts.openIssues > 0, "OPEN_ISSUES", "问题", `仍有${facts.openIssues}项问题未关闭`, "完成解决和效果复核，或办理移交");
  add(facts.pendingChanges > 0, "PENDING_CHANGES", "变更", `仍有${facts.pendingChanges}项变更未形成最终结论`, "完成审批、实施、撤回或影响归档");
  add(facts.acceptanceEvidence < 1, "ACCEPTANCE_EVIDENCE_MISSING", "验收", "缺少正式验收证据", "上传或关联可验证的客户/业务验收记录");
  add(facts.outstandingReceivable > 0, "OUTSTANDING_RECEIVABLE", "财务", `仍有应收${facts.outstandingReceivable.toLocaleString("zh-CN")}`, "完成回款、核销或由财务与授权人批准后续收款计划");
  add(facts.archiveEvidence < 1, "ARCHIVE_EVIDENCE_MISSING", "归档", "缺少项目档案清单和归档证据", "完成合同、计划、交付、决策、财务和复盘材料归档");
  add(facts.handoverEvidence < 1, "KNOWLEDGE_HANDOVER_MISSING", "移交", "缺少运营/运维/知识移交证据", "完成责任人确认的移交清单、培训和知识候选");
  add(facts.benefitBaselineRequired && facts.benefitBaselineCount < 1, "BENEFIT_BASELINE_MISSING", "收益", "S/A项目缺少收益基线或G6复核安排", "明确收益Owner、目标、复核日期和退出标准");
  return { ready: blockers.length === 0, blockers, facts, generatedAt: new Date().toISOString() };
}
