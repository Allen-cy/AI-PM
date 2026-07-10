export type JointCheckType = "delivery_acceptance_gap" | "acceptance_billing_gap" | "delay_cash_impact";

interface JointCheckInput {
  evaluatedAt: string;
  pm: {
    projects: Array<{ projectId: string; projectName: string; externalProjectCode: string | null; commitment: { customerDueDate: string | null; forecastDueDate: string | null; status: string | null; progress: number | null; sourceRecordId: string } }>;
    milestones: Array<{ projectId: string; projectName: string; sourceRecordId: string; name: string; baselineDate: string | null; forecastDate: string | null; status: string | null; owner: string | null }>;
  };
  operations: {
    acceptances: Array<{ projectId: string; projectName: string; sourceRecordId: string; status: string; plannedDate: string | null; actualDate: string | null }>;
    invoices: Array<{ projectId: string; projectName: string; sourceRecordId: string; contractCode: string | null; amount: number | null; invoiceDate: string | null; status: string | null }>;
    receivables: Array<{ projectId: string; projectName: string; sourceRecordId: string; contractCode: string | null; receivableAmount: number | null; collectedAmount: number | null; outstandingAmount: number | null; plannedCollectionDate: string | null }>;
  };
}

export interface JointCheckItem {
  projectId: string;
  projectName: string;
  checkType: JointCheckType;
  severity: "medium" | "high" | "critical";
  title: string;
  finding: string;
  ownerBusinessRole: "pm" | "operations";
  reviewerBusinessRole: "pmo";
  factReferences: Array<{ sourceType: string; sourceId: string }>;
  suggestedAction: string;
}

function completed(status: string | null): boolean { return /已完成|完成|completed|done|closed/i.test(status || ""); }
function accepted(status: string | null): boolean { return /已验收|验收通过|accepted|approved/i.test(status || ""); }
function dateAfter(left: string | null, right: string | null): boolean {
  if (!left || !right) return false; const l = Date.parse(left); const r = Date.parse(right); return Number.isFinite(l) && Number.isFinite(r) && l > r;
}

export function buildPmOperationsJointChecks(input: JointCheckInput): { evaluatedAt: string; items: JointCheckItem[]; dataGaps: string[] } {
  const items: JointCheckItem[] = []; const dataGaps: string[] = [];
  if (input.pm.projects.length === 0) dataGaps.push("缺少稳定关联的项目承诺事实");
  if (input.operations.acceptances.length === 0) dataGaps.push("缺少验收事实，不能判定交付到验收是否闭环");
  const acceptanceByProject = new Map(input.operations.acceptances.map(item => [item.projectId, item]));
  const invoicesByProject = new Map<string, JointCheckInput["operations"]["invoices"]>();
  for (const invoice of input.operations.invoices) invoicesByProject.set(invoice.projectId, [...(invoicesByProject.get(invoice.projectId) ?? []), invoice]);
  const receivablesByProject = new Map<string, JointCheckInput["operations"]["receivables"]>();
  for (const receivable of input.operations.receivables) receivablesByProject.set(receivable.projectId, [...(receivablesByProject.get(receivable.projectId) ?? []), receivable]);

  for (const milestone of input.pm.milestones.filter(item => completed(item.status))) {
    const acceptance = acceptanceByProject.get(milestone.projectId);
    if (!acceptance || !accepted(acceptance.status)) items.push({ projectId: milestone.projectId, projectName: milestone.projectName, checkType: "delivery_acceptance_gap", severity: "high", title: "交付已完成但验收未闭环", finding: `里程碑“${milestone.name}”已完成，验收状态为${acceptance?.status || "未登记"}。`, ownerBusinessRole: "operations", reviewerBusinessRole: "pmo", factReferences: [{ sourceType: "milestone", sourceId: milestone.sourceRecordId }, ...(acceptance ? [{ sourceType: "project", sourceId: acceptance.sourceRecordId }] : [])], suggestedAction: "运营确认验收条件、责任人和计划日期；PM补齐交付证据。" });
  }
  for (const acceptance of input.operations.acceptances.filter(item => accepted(item.status))) {
    const invoices = invoicesByProject.get(acceptance.projectId) ?? []; const receivables = receivablesByProject.get(acceptance.projectId) ?? [];
    if (invoices.length === 0 && receivables.length === 0) items.push({ projectId: acceptance.projectId, projectName: acceptance.projectName, checkType: "acceptance_billing_gap", severity: "high", title: "验收完成但开票/应收未建立", finding: "验收已完成，尚未找到关联开票或应收事实。", ownerBusinessRole: "operations", reviewerBusinessRole: "pmo", factReferences: [{ sourceType: "project", sourceId: acceptance.sourceRecordId }], suggestedAction: "运营发起开票/应收动作，并由财务确认正式财务事实。" });
  }
  for (const project of input.pm.projects) {
    if (!dateAfter(project.commitment.forecastDueDate, project.commitment.customerDueDate)) continue;
    const outstanding = (receivablesByProject.get(project.projectId) ?? []).filter(item => Number(item.outstandingAmount || 0) > 0);
    if (outstanding.length === 0) continue;
    items.push({ projectId: project.projectId, projectName: project.projectName, checkType: "delay_cash_impact", severity: "critical", title: "延期正在影响未收现金", finding: `预测完成日 ${project.commitment.forecastDueDate} 晚于客户承诺 ${project.commitment.customerDueDate}，且存在 ${outstanding.length} 笔未收应收。`, ownerBusinessRole: "pm", reviewerBusinessRole: "pmo", factReferences: [{ sourceType: "project", sourceId: project.commitment.sourceRecordId }, ...outstanding.map(item => ({ sourceType: "payment", sourceId: item.sourceRecordId }))], suggestedAction: "PM与运营共同确认交付恢复、验收和回款预测，超容差时提交PMO复核。" });
  }
  return { evaluatedAt: input.evaluatedAt, items, dataGaps };
}

export interface CadenceDefinition {
  id: string;
  cadenceType: "daily" | "weekly" | "monthly" | "event";
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  eventKey: string | null;
}

export function materializeCadenceOccurrences(definitions: CadenceDefinition[], date: Date, eventKeys: string[] = []) {
  if (Number.isNaN(date.getTime())) throw new Error("运行日期不合法");
  return definitions.filter(item => {
    if (item.cadenceType === "daily") return true;
    if (item.cadenceType === "weekly") return item.dayOfWeek === date.getDay();
    if (item.cadenceType === "monthly") return item.dayOfMonth === date.getDate();
    return Boolean(item.eventKey && eventKeys.includes(item.eventKey));
  }).map(item => ({ definitionId: item.id, scheduledDate: date.toISOString().slice(0, 10), trigger: item.cadenceType === "event" ? item.eventKey : item.cadenceType }));
}

