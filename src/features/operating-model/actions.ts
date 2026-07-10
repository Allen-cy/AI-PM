export interface ActionClosureEvidence {
  sourceType: string;
  sourceId: string;
  title: string;
  validUntil?: string | null;
}

const ACTION_EVIDENCE_SOURCE_TYPES = new Set([
  "feishu_record",
  "feishu",
  "feishu_drive",
  "feishu_task",
  "supabase_record",
  "signed_document",
  "external_url",
]);

export function validateActionClosureEvidence(
  evidence: unknown,
  now = new Date(),
): { valid: boolean; errors: string[] } {
  if (!Array.isArray(evidence)) return { valid: false, errors: ["关闭证据必须是数组。"] };
  if (evidence.length === 0) return { valid: false, errors: ["至少需要一项关闭证据。"] };
  const errors: string[] = [];
  const identities = new Set<string>();
  evidence.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`第${index + 1}项证据格式错误。`);
      return;
    }
    const record = item as Record<string, unknown>;
    const sourceType = typeof record.sourceType === "string" ? record.sourceType.trim() : "";
    const sourceId = typeof record.sourceId === "string" ? record.sourceId.trim() : "";
    const title = typeof record.title === "string" ? record.title.trim() : "";
    if (!sourceType || !sourceId || !title) {
      errors.push(`第${index + 1}项证据缺少来源、标识或标题。`);
    }
    if (sourceType && !ACTION_EVIDENCE_SOURCE_TYPES.has(sourceType)) {
      errors.push(`第${index + 1}项证据来源类型不受信任。`);
    }
    if (sourceType && sourceId) {
      const identity = `${sourceType}:${sourceId}`;
      if (identities.has(identity)) errors.push(`第${index + 1}项证据与前面记录重复。`);
      identities.add(identity);
    }
    if (record.validUntil) {
      const expiresAt = new Date(String(record.validUntil)).getTime();
      if (!Number.isFinite(expiresAt)) errors.push(`第${index + 1}项证据有效期格式错误。`);
      else if (expiresAt < now.getTime()) errors.push(`第${index + 1}项证据已过期。`);
    }
  });
  return { valid: errors.length === 0, errors };
}
