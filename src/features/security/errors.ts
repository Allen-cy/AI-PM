const SECURITY_TABLES = [
  "operation_audit_logs",
  "user_project_access_grants",
  "system_configurations",
  "project_access_requests",
];

export function isMissingSecurityTableError(message?: string, tableName?: string): boolean {
  const text = String(message ?? "");
  if (!text) return false;
  const lower = text.toLowerCase();
  if (lower.includes("relationship")) return false;
  const tableNames = tableName ? [tableName] : SECURITY_TABLES;
  return tableNames.some(table => {
    const normalizedTable = table.toLowerCase();
    const mentionsTable = lower.includes(normalizedTable);
    const missingBySql = lower.includes("does not exist") && mentionsTable;
    const missingBySchemaCache = lower.includes("could not find the table") && mentionsTable;
    const missingByPostgrestRelation = lower.includes("relation") && lower.includes("does not exist") && mentionsTable;
    return missingBySql || missingBySchemaCache || missingByPostgrestRelation;
  });
}
