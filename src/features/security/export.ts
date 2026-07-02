import type { AdminSecuritySnapshot } from "./repository.ts";

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",");
}

function mdCell(value: unknown): string {
  return String(value ?? "-")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim() || "-";
}

export function buildSecurityMarkdown(snapshot: AdminSecuritySnapshot, generatedAt = new Date().toISOString()): string {
  return [
    "# AI-PMO 企业安全运营报告",
    "",
    `生成时间：${generatedAt}`,
    "",
    "## 一、用户与角色",
    "| 用户 | 邮箱 | 角色 | 状态 |",
    "| --- | --- | --- | --- |",
    ...snapshot.users.map(user => `| ${mdCell(user.name)} | ${mdCell(user.email)} | ${mdCell(user.role)} | ${mdCell(user.status)} |`),
    "",
    "## 二、项目授权",
    "| 用户 | 项目 | 级别 | 状态 | 原因 |",
    "| --- | --- | --- | --- | --- |",
    ...snapshot.projectAccess.map(grant => `| ${mdCell(grant.userName || grant.userEmail || grant.userId)} | ${mdCell(grant.projectName || grant.projectCode)} | ${mdCell(grant.accessLevel)} | ${mdCell(grant.status)} | ${mdCell(grant.grantReason)} |`),
    "",
    "## 三、项目访问申请",
    "| 申请人 | 项目 | 级别 | 状态 | 原因 |",
    "| --- | --- | --- | --- | --- |",
    ...snapshot.projectAccessRequests.map(request => `| ${mdCell(request.requesterName || request.requesterEmail || request.requesterId)} | ${mdCell(request.projectName || request.projectCode)} | ${mdCell(request.accessLevel)} | ${mdCell(request.status)} | ${mdCell(request.reason)} |`),
    "",
    "## 四、审计日志",
    "| 时间 | 操作者 | 动作 | 对象 | 状态 | 摘要 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...snapshot.auditLogs.map(log => `| ${mdCell(log.createdAt)} | ${mdCell(log.actorName)} | ${mdCell(log.action)} | ${mdCell(log.resourceType)} | ${mdCell(log.status)} | ${mdCell(log.summary)} |`),
    "",
    "## 五、风险提示",
    ...(snapshot.warnings.length ? snapshot.warnings.map(item => `- ${item}`) : ["- 暂无系统级警告。"]),
    "",
    "> 本报告不包含 API Key、App Secret、Token、密码等敏感字段。",
  ].join("\n");
}

export function buildSecurityCsv(snapshot: AdminSecuritySnapshot): string {
  const rows = [
    csvRow(["section", "time", "actor/user", "action/project", "status/role", "summary/detail"]),
    ...snapshot.users.map(user => csvRow(["user", "", user.name || user.email, user.email, user.role, user.status])),
    ...snapshot.projectAccess.map(grant => csvRow(["project_access", grant.createdAt || "", grant.userName || grant.userEmail || grant.userId, grant.projectName || grant.projectCode, grant.status, grant.accessLevel])),
    ...snapshot.projectAccessRequests.map(request => csvRow(["access_request", request.createdAt || "", request.requesterName || request.requesterEmail || request.requesterId, request.projectName || request.projectCode, request.status, request.reason])),
    ...snapshot.auditLogs.map(log => csvRow(["audit", log.createdAt, log.actorName, `${log.action}/${log.resourceType}`, log.status, log.summary])),
  ];
  return rows.join("\n");
}
