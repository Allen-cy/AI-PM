import { buildManagementSignalDedupKey, MANAGEMENT_SIGNAL_TYPES, type ManagementSignalType } from "./operating-contracts.ts";

export interface MetricSignalObservation {
  observationId: string; orgId: string; projectId: string; projectLevel: string;
  dataClass: "production"|"sample"|"test"|"diagnostic"|"unclassified";
  metricKey: string; currentValue: number|null; baselineValue: number|null; latestForecastValue: number|null;
  periodKey: string; observedAt: string; freshnessStatus: "fresh"|"stale"|"unavailable";
  trustStatus: "trusted"|"untrusted"|"accepted_with_risk"; sourceType: string; sourceId: string; ownerUserId: string|null;
}
export interface MetricSignalRule {
  version: string; signalType: ManagementSignalType; metricKey: string;
  metricVersion?: string;
  comparison: "greater_than"|"less_than"|"variance_percent_above";
  yellowThreshold: number; redThreshold: number; routeOnYellow: "action"|"escalation"; routeOnRed: "action"|"escalation";
  reviewAfterMinutes: number;
}

export function parseProjectLevelMetricSignalRules(input: {
  matrixVersion: string;
  projectLevel: string;
  rules: Record<string, unknown>;
}): MetricSignalRule[] {
  const level = input.rules[input.projectLevel];
  if (!level || typeof level !== "object" || Array.isArray(level)) return [];
  const levelRule = level as Record<string, unknown>;
  const signalRules = Array.isArray(levelRule.signalRules) ? levelRule.signalRules : [];
  const reviewAfterMinutes = Math.max(1, Number(levelRule.escalationHours || 24) * 60);
  return signalRules.flatMap(raw => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const rule = raw as Record<string, unknown>;
    const signalType = String(rule.signalType || "");
    const metricKey = String(rule.metricKey || "");
    const metricVersion = String(rule.metricVersion || "");
    const comparison = String(rule.comparison || "greater_than");
    const yellowThreshold = Number(rule.yellowThreshold);
    const redThreshold = Number(rule.redThreshold);
    if (!(MANAGEMENT_SIGNAL_TYPES as readonly string[]).includes(signalType) || !metricKey || !metricVersion) return [];
    if (!(comparison === "greater_than" || comparison === "less_than" || comparison === "variance_percent_above")) return [];
    if (!Number.isFinite(yellowThreshold) || !Number.isFinite(redThreshold)) return [];
    const thresholdsValid = comparison === "less_than" ? redThreshold <= yellowThreshold : yellowThreshold <= redThreshold;
    if (!thresholdsValid) return [];
    const escalationLevel = String(rule.escalationLevel || "").toUpperCase();
    return [{
      version: `${input.matrixVersion}:${input.projectLevel}:${signalType}:${metricKey}:${metricVersion}`,
      signalType: signalType as ManagementSignalType,
      metricKey,
      metricVersion,
      comparison,
      yellowThreshold,
      redThreshold,
      routeOnYellow: "action" as const,
      routeOnRed: ["L2", "L3"].includes(escalationLevel) ? "escalation" as const : "action" as const,
      reviewAfterMinutes,
    }];
  });
}

function score(observation: MetricSignalObservation, comparison: MetricSignalRule["comparison"]): number|null {
  if (observation.currentValue === null) return null;
  if (comparison !== "variance_percent_above") return observation.currentValue;
  if (observation.baselineValue === null || observation.baselineValue === 0) return null;
  return Math.abs((observation.currentValue-observation.baselineValue)/observation.baselineValue*100);
}

export function evaluateMetricSignal(observation: MetricSignalObservation, rule: MetricSignalRule, now=new Date()) {
  if (!observation.ownerUserId) throw new Error("管理信号必须有责任人");
  if (rule.metricKey!==observation.metricKey) return null;
  const reviewedAt=new Date(now.getTime()+rule.reviewAfterMinutes*60_000).toISOString();
  const base={orgId:observation.orgId,projectId:observation.projectId,dataClass:observation.dataClass,ownerUserId:observation.ownerUserId,sourceType:observation.sourceType,sourceId:observation.sourceId,snapshotAt:observation.observedAt,dueAt:reviewedAt,nextReviewAt:reviewedAt,metricObservationIds:[observation.observationId],baselineVersion:null as string|null,status:"pending_verification" as const};
  if(observation.freshnessStatus!=="fresh"||observation.trustStatus==="untrusted") return {...base,signalType:"data_quality" as const,ruleVersion:rule.version,severity:"high" as const,route:"action" as const,trustStatus:observation.trustStatus,title:`数据质量异常：${observation.metricKey}`,summary:"指标已过期、不可用或未经验证，不能用于正式决策。",impact:{metric_key:observation.metricKey,freshness_status:observation.freshnessStatus,trust_status:observation.trustStatus},payload:{period_key:observation.periodKey,current_value:observation.currentValue},dedupKey:buildManagementSignalDedupKey({signalType:"data_quality",subjectScope:"project",subjectId:observation.projectId,window:`${observation.metricKey}:${observation.periodKey}`})};
  const value=score(observation,rule.comparison);if(value===null)return null;
  const red=rule.comparison==="less_than"?value<=rule.redThreshold:value>=rule.redThreshold;
  const yellow=rule.comparison==="less_than"?value<=rule.yellowThreshold:value>=rule.yellowThreshold;
  if(!red&&!yellow)return null;
  const severity=red?"critical" as const:"high" as const;const route=red?rule.routeOnRed:rule.routeOnYellow;
  return {...base,signalType:rule.signalType,ruleVersion:rule.version,severity,route,trustStatus:observation.trustStatus,title:`${rule.signalType}异常：${observation.metricKey}`,summary:`指标值 ${value} 触发${red?"红色":"黄色"}阈值。`,impact:{metric_key:observation.metricKey,value,yellow_threshold:rule.yellowThreshold,red_threshold:rule.redThreshold,project_level:observation.projectLevel},payload:{period_key:observation.periodKey,current_value:observation.currentValue,baseline_value:observation.baselineValue,latest_forecast_value:observation.latestForecastValue},dedupKey:buildManagementSignalDedupKey({signalType:rule.signalType,subjectScope:"project",subjectId:observation.projectId,window:observation.periodKey})};
}
