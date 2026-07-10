export interface FeishuProjectIdentityCandidate {
  sourceType: "feishu";
  sourceContainerId: string;
  sourceRecordId: string;
  projectCode: string | null;
  projectName: string;
  dataClass: "production" | "sample" | "test" | "diagnostic" | "unclassified";
  fields: Record<string, unknown>;
}

export function normalizeFeishuProjectIdentityCandidate(
  record: { recordId: string; fields: Record<string, unknown> },
  sourceContainerId: string,
): FeishuProjectIdentityCandidate {
  const scalar = (value: unknown): unknown => {
    if (!Array.isArray(value)) return value;
    const first = value[0];
    if (first && typeof first === "object" && "text" in first) return (first as { text: unknown }).text;
    if (first && typeof first === "object" && "name" in first) return (first as { name: unknown }).name;
    return first;
  };
  const fields = Object.fromEntries(Object.entries(record.fields).map(([key, value]) => [key, scalar(value)]));
  const projectName = String(fields["项目名称"] ?? fields.project_name ?? "").trim();
  if (!projectName) throw new Error("飞书项目记录缺少项目名称");
  const projectCode = String(fields.project_id ?? fields["项目编号"] ?? "").trim() || null;
  const explicit = String(fields.data_class ?? fields["数据分类"] ?? "").trim().toLowerCase();
  const sampleMarker = String(fields["样例来源"] ?? fields.sample_source ?? "").trim();
  const testMarker = String(fields["测试批次"] ?? fields.test_batch ?? "").trim();
  let dataClass: FeishuProjectIdentityCandidate["dataClass"] = "unclassified";
  if (["production", "正式", "生产"].includes(explicit)) dataClass = "production";
  else if (["sample", "样例", "示例"].includes(explicit) || sampleMarker) dataClass = "sample";
  else if (["diagnostic", "诊断"].includes(explicit) || /字段定位|诊断/i.test(projectName)) dataClass = "diagnostic";
  else if (["test", "测试"].includes(explicit) || testMarker || /测试|codex/i.test(projectName)) dataClass = "test";
  return {
    sourceType: "feishu",
    sourceContainerId,
    sourceRecordId: record.recordId,
    projectCode,
    projectName,
    dataClass,
    fields,
  };
}
