import type { FeishuProjectIdentityCandidate } from "./feishu-project.ts";

export interface ExistingProjectIdentityMapping {
  projectId: string;
  orgId: string;
  sourceType: string;
  sourceContainerId: string;
  sourceRecordId: string;
  externalProjectCode: string | null;
}

export interface ProjectIdentityBackfillPlan {
  entries: Array<{
    sourceRecordId: string;
    action: "create" | "reuse" | "conflict";
    projectId: string | null;
    reason: string;
    candidate: FeishuProjectIdentityCandidate;
  }>;
  summary: { total: number; create: number; reuse: number; conflict: number };
}

export function planProjectIdentityBackfill(
  candidates: FeishuProjectIdentityCandidate[],
  existing: ExistingProjectIdentityMapping[],
): ProjectIdentityBackfillPlan {
  const sourceKey = (sourceType: string, container: string, record: string) => `${sourceType}:${container}:${record}`;
  const existingBySource = new Map(existing.map(item => [sourceKey(item.sourceType, item.sourceContainerId, item.sourceRecordId), item]));
  const existingByCode = new Map<string, ExistingProjectIdentityMapping[]>();
  for (const item of existing) {
    const code = item.externalProjectCode?.trim().toLowerCase();
    if (code) existingByCode.set(code, [...(existingByCode.get(code) ?? []), item]);
  }
  const candidateCodeCounts = new Map<string, number>();
  for (const candidate of candidates) {
    const code = candidate.projectCode?.trim().toLowerCase();
    if (code) candidateCodeCounts.set(code, (candidateCodeCounts.get(code) ?? 0) + 1);
  }

  const entries = candidates.map(candidate => {
    const mapped = existingBySource.get(sourceKey(candidate.sourceType, candidate.sourceContainerId, candidate.sourceRecordId));
    if (mapped) {
      return { sourceRecordId: candidate.sourceRecordId, action: "reuse" as const, projectId: mapped.projectId, reason: "外部记录已有稳定映射。", candidate };
    }
    const code = candidate.projectCode?.trim().toLowerCase();
    if (code && (candidateCodeCounts.get(code) ?? 0) > 1) {
      return { sourceRecordId: candidate.sourceRecordId, action: "conflict" as const, projectId: null, reason: "同一批次存在重复项目编号，禁止自动合并。", candidate };
    }
    const codeMatches = code ? existingByCode.get(code) ?? [] : [];
    if (codeMatches.length > 1) {
      return { sourceRecordId: candidate.sourceRecordId, action: "conflict" as const, projectId: null, reason: "历史映射中项目编号不唯一，需要人工确认。", candidate };
    }
    if (codeMatches.length === 1) {
      return { sourceRecordId: candidate.sourceRecordId, action: "reuse" as const, projectId: codeMatches[0].projectId, reason: "项目编号命中唯一稳定项目。", candidate };
    }
    return { sourceRecordId: candidate.sourceRecordId, action: "create" as const, projectId: null, reason: "未发现稳定来源或唯一项目编号映射。", candidate };
  });
  return {
    entries,
    summary: {
      total: entries.length,
      create: entries.filter(item => item.action === "create").length,
      reuse: entries.filter(item => item.action === "reuse").length,
      conflict: entries.filter(item => item.action === "conflict").length,
    },
  };
}
