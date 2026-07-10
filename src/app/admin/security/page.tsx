"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Role = "admin" | "user";
type UserStatus = "active" | "disabled";

type PermissionDefinition = {
  key: string;
  label: string;
  description: string;
  category: string;
};

type AppUser = {
  id: string;
  email: string;
  phone: string;
  name: string | null;
  role: Role;
  status: UserStatus;
};

type ProjectAccessGrant = {
  id: string;
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
  projectName?: string | null;
  projectCode?: string | null;
  accessLevel: "viewer" | "editor" | "owner";
  status: "active" | "revoked";
  grantReason?: string | null;
  createdAt?: string;
};

type ProjectAccessRequest = {
  id: string;
  requesterId: string;
  requesterName?: string | null;
  requesterEmail?: string | null;
  projectName?: string | null;
  projectCode?: string | null;
  accessLevel: "viewer" | "editor" | "owner";
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewerName?: string | null;
  reviewComment?: string | null;
  relatedGrantId?: string | null;
  createdAt?: string;
  reviewedAt?: string | null;
};

type AuditLog = {
  id: string;
  actorName: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  status: string;
  severity: string;
  summary: string;
  createdAt: string;
  requestId?: string | null;
};

type SystemConfiguration = {
  id: string;
  key: string;
  category: string;
  description?: string | null;
  value: Record<string, unknown>;
  updatedAt?: string;
  updatedByName?: string | null;
};

type BusinessRoleKey = "pm" | "operations" | "pmo" | "ceo" | "sponsor" | "business_owner" | "finance" | "quality";
type SubjectScopeKey = "project" | "portfolio" | "organization" | "customer" | "contract";
type BusinessRoleAssignment = {
  id: string;
  userId: string;
  userName?: string | null;
  userEmail?: string | null;
  businessRole: BusinessRoleKey;
  orgId: string;
  subjectScope: SubjectScopeKey;
  subjectId: string;
  status: string;
  validFrom: string;
  validUntil?: string | null;
  assignmentReason?: string | null;
};

type SecuritySnapshot = {
  permissions: {
    definitions: PermissionDefinition[];
    matrix: Record<Role, string[]>;
  };
  users: AppUser[];
  projectAccess: ProjectAccessGrant[];
  projectAccessRequests: ProjectAccessRequest[];
  businessRoles: BusinessRoleAssignment[];
  organizations: Array<{ id: string; code: string; name: string; status: string }>;
  portfolios: Array<{ id: string; orgId: string; code: string; name: string; status: string }>;
  projects: Array<{ id: string; orgId: string; code?: string | null; name: string; dataClass: string }>;
  managementRules: Array<{ id: string; ruleKey: string; version: string; status: string; scopeKey: string; configuration: Record<string, unknown>; approvedAt?: string | null }>;
  reportingRelationships: Array<{ id: string; orgId: string; subjectScope: string; subjectId: string; fromUserId: string; fromUserName?: string | null; fromBusinessRole: string; toUserId: string; toUserName?: string | null; toBusinessRole: string; relationshipType: string; status: string; validFrom: string; validUntil?: string | null }>;
  auditLogs: AuditLog[];
  systemConfigurations: SystemConfiguration[];
  warnings: string[];
  runtime: {
    authRequired: boolean;
    authStorageConfigured: boolean;
  };
};

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 18,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "var(--text2)",
  fontSize: "0.76rem",
  marginBottom: 6,
};

function StatusTag({ value }: { value: string }) {
  const color = value === "active" || value === "succeeded" ? "var(--green)" : value === "admin" || value === "owner" ? "var(--purple)" : value === "failed" || value === "disabled" ? "var(--red)" : "var(--amber)";
  return <span className="tag" style={{ color, background: `${color}22` }}>{value}</span>;
}

function AdminInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="input" style={{ ...(props.style || {}), minHeight: 38 }} />;
}

function AdminSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="input" style={{ ...(props.style || {}), minHeight: 38 }} />;
}

function AdminTextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className="input" style={{ ...(props.style || {}), minHeight: 110 }} />;
}

export default function AdminSecurityPage() {
  const [snapshot, setSnapshot] = useState<SecuritySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [grantDraft, setGrantDraft] = useState({
    userId: "",
    projectName: "",
    projectCode: "",
    accessLevel: "viewer" as ProjectAccessGrant["accessLevel"],
    grantReason: "",
  });
  const [businessRoleDraft, setBusinessRoleDraft] = useState({
    userId: "",
    businessRole: "pm" as BusinessRoleKey,
    orgId: "",
    subjectScope: "project" as SubjectScopeKey,
    subjectId: "",
    validFrom: new Date().toISOString().slice(0, 16),
    validUntil: "",
    assignmentReason: "",
  });
  const [revokeRoleReason, setRevokeRoleReason] = useState<Record<string, string>>({});
  const [reportingDraft, setReportingDraft] = useState({
    orgId: "", subjectScope: "project" as "project" | "portfolio" | "organization", subjectId: "",
    fromUserId: "", fromBusinessRole: "pm" as BusinessRoleKey,
    toUserId: "", toBusinessRole: "pmo" as BusinessRoleKey,
    validFrom: new Date().toISOString().slice(0, 16), validUntil: "", relationshipType: "reports_to",
  });
  const [revokeReportingReason, setRevokeReportingReason] = useState<Record<string, string>>({});
  const [configDraft, setConfigDraft] = useState({
    configKey: "enterprise_security_policy",
    category: "security",
    description: "P9 企业化安全策略",
    configValue: JSON.stringify({
      auth_required: true,
      default_user_project_scope: "owner_or_explicit_grant",
      audit_required_for_admin_actions: true,
      secret_redaction: true,
    }, null, 2),
  });
  const [reviewDraft, setReviewDraft] = useState<Record<string, string>>({});

  async function loadSnapshot() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/security", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "加载安全中心失败");
      setSnapshot(data as SecuritySnapshot);
      if (!grantDraft.userId && data.users?.[0]?.id) {
        setGrantDraft(prev => ({ ...prev, userId: data.users[0].id }));
      }
      setBusinessRoleDraft(prev => {
        const orgId = prev.orgId || data.organizations?.[0]?.id || "";
        const project = data.projects?.find((item: { orgId: string }) => item.orgId === orgId);
        return {
          ...prev,
          userId: prev.userId || data.users?.[0]?.id || "",
          orgId,
          subjectId: prev.subjectId || project?.id || "",
        };
      });
      setReportingDraft(prev => {
        const orgId = prev.orgId || data.organizations?.[0]?.id || "";
        return { ...prev, orgId, fromUserId: prev.fromUserId || data.users?.[0]?.id || "", toUserId: prev.toUserId || data.users?.[1]?.id || data.users?.[0]?.id || "", subjectId: prev.subjectId || data.projects?.find((item: { orgId: string }) => item.orgId === orgId)?.id || orgId };
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载安全中心失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSnapshot(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, PermissionDefinition[]>();
    for (const item of snapshot?.permissions.definitions ?? []) {
      groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
    }
    return [...groups.entries()];
  }, [snapshot]);

  const availableRoleSubjects = useMemo(() => {
    if (!snapshot) return [] as Array<{ id: string; label: string }>;
    if (businessRoleDraft.subjectScope === "organization") {
      return snapshot.organizations.filter(item => item.id === businessRoleDraft.orgId).map(item => ({ id: item.id, label: `${item.name}（组织）` }));
    }
    if (businessRoleDraft.subjectScope === "portfolio") {
      return snapshot.portfolios.filter(item => item.orgId === businessRoleDraft.orgId).map(item => ({ id: item.id, label: `${item.name}（${item.code}）` }));
    }
    if (businessRoleDraft.subjectScope === "project") {
      return snapshot.projects.filter(item => item.orgId === businessRoleDraft.orgId).map(item => ({ id: item.id, label: `${item.name}${item.code ? `（${item.code}）` : ""} · ${item.dataClass}` }));
    }
    return [] as Array<{ id: string; label: string }>;
  }, [businessRoleDraft.orgId, businessRoleDraft.subjectScope, snapshot]);

  const reportingSubjects = useMemo(() => {
    if (!snapshot) return [] as Array<{ id: string; label: string }>;
    if (reportingDraft.subjectScope === "organization") return snapshot.organizations.filter(item => item.id === reportingDraft.orgId).map(item => ({ id: item.id, label: item.name }));
    if (reportingDraft.subjectScope === "portfolio") return snapshot.portfolios.filter(item => item.orgId === reportingDraft.orgId).map(item => ({ id: item.id, label: `${item.name}（${item.code}）` }));
    return snapshot.projects.filter(item => item.orgId === reportingDraft.orgId).map(item => ({ id: item.id, label: `${item.name}${item.code ? `（${item.code}）` : ""}` }));
  }, [reportingDraft.orgId, reportingDraft.subjectScope, snapshot]);

  async function runOperation(body: Record<string, unknown>, successText: string) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "操作失败");
      setMessage(successText);
      await loadSnapshot();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "操作失败");
    } finally {
      setSaving(false);
    }
  }

  async function grantProjectAccess() {
    await runOperation({
      operation: "grant_project_access",
      ...grantDraft,
    }, "项目访问授权已保存");
  }

  async function revokeGrant(id: string) {
    await runOperation({ operation: "revoke_project_access", grantId: id }, "项目访问授权已撤销");
  }

  async function assignBusinessRole() {
    const subjectId = businessRoleDraft.subjectScope === "organization"
      ? businessRoleDraft.orgId
      : businessRoleDraft.subjectId;
    await runOperation({
      operation: "assign_business_role",
      ...businessRoleDraft,
      subjectId,
      validFrom: new Date(businessRoleDraft.validFrom).toISOString(),
      validUntil: businessRoleDraft.validUntil ? new Date(businessRoleDraft.validUntil).toISOString() : null,
    }, "业务角色与管理范围已分配");
  }

  async function revokeBusinessRole(id: string) {
    const reason = revokeRoleReason[id]?.trim();
    if (!reason) {
      setError("撤销业务角色前必须填写原因");
      return;
    }
    await runOperation({ operation: "revoke_business_role", assignmentId: id, reason }, "业务角色已撤销");
  }

  async function activateManagementRule(id: string) {
    await runOperation({ operation: "activate_management_rule", ruleId: id, confirmation: "ACTIVATE_S1_MILESTONE_DELAY" }, "S1里程碑延期规则已批准启用");
  }

  async function assignReportingRelationship() {
    await runOperation({
      operation: "assign_reporting_relationship",
      ...reportingDraft,
      validFrom: new Date(reportingDraft.validFrom).toISOString(),
      validUntil: reportingDraft.validUntil ? new Date(reportingDraft.validUntil).toISOString() : null,
    }, "业务汇报关系已建立");
  }

  async function revokeReportingRelationship(id: string) {
    const reason = revokeReportingReason[id]?.trim();
    if (!reason) { setError("撤销汇报关系前必须填写原因"); return; }
    await runOperation({ operation: "revoke_reporting_relationship", relationshipId: id, reason }, "业务汇报关系已撤销");
  }

  async function updateUser(user: AppUser, next: Partial<Pick<AppUser, "role" | "status">>) {
    await runOperation({
      operation: "update_user_role",
      userId: user.id,
      role: next.role ?? user.role,
      status: next.status ?? user.status,
    }, "用户角色/状态已更新");
  }

  async function saveConfig() {
    await runOperation({
      operation: "save_system_config",
      ...configDraft,
    }, "系统配置已保存");
  }

  async function approveAccessRequest(id: string) {
    await runOperation({
      operation: "approve_project_access_request",
      requestId: id,
      reviewComment: reviewDraft[id] || "审批通过",
    }, "项目访问申请已批准并生成授权");
  }

  async function rejectAccessRequest(id: string) {
    await runOperation({
      operation: "reject_project_access_request",
      requestId: id,
      reviewComment: reviewDraft[id] || "申请信息不足或不符合当前授权策略",
    }, "项目访问申请已驳回");
  }

  const securityRisks = useMemo(() => {
    const risks: Array<{ title: string; detail: string; severity: "high" | "medium" | "low" }> = [];
    if (!snapshot?.runtime.authRequired) risks.push({ title: "公网登录开关未启用", detail: "AUTH_REQUIRED 不是 true 时，公网访问边界不足。", severity: "high" });
    if (snapshot?.warnings.length) risks.push({ title: "安全表或配置存在告警", detail: snapshot.warnings.join("；"), severity: "high" });
    const failedAudits = snapshot?.auditLogs.filter(log => log.status === "failed" || log.status === "rejected").length ?? 0;
    if (failedAudits > 0) risks.push({ title: "存在失败/拒绝审计事件", detail: `最近审计日志中有 ${failedAudits} 条失败或拒绝事件，需要复核。`, severity: "medium" });
    const pendingRequests = snapshot?.projectAccessRequests.filter(item => item.status === "pending").length ?? 0;
    if (pendingRequests > 0) risks.push({ title: "存在待审批项目访问申请", detail: `${pendingRequests} 条项目访问申请等待管理员处理。`, severity: "medium" });
    risks.push({ title: "Excel解析依赖待替换", detail: "xlsx 上游暂无修复版本，当前已限制上传类型/大小/行数，长期建议替换或隔离解析服务。", severity: "medium" });
    return risks;
  }, [snapshot]);

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header style={{
        borderBottom: "1px solid var(--border)",
        padding: "14px 32px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        background: "var(--surface)",
      }}>
        <Link href="/" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.85rem" }}>← 返回首页</Link>
        <Link href="/account" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.85rem" }}>用户中心</Link>
        <Link href="/admin/operating-model" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.85rem" }}>运行模型控制台</Link>
        <span style={{ color: "var(--border)" }}>|</span>
        <strong style={{ color: "var(--purple)" }}>🛡️ 管理员安全配置中心</strong>
        <span className="tag tag-purple">P9/P10</span>
      </header>

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "28px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "start", marginBottom: 22 }}>
          <div>
            <h1 style={{ margin: "0 0 8px", fontSize: "1.5rem", fontWeight: 900 }}>权限、项目授权、审计和企业配置统一管理</h1>
            <p style={{ margin: 0, color: "var(--text2)", lineHeight: 1.7, maxWidth: 920 }}>
              P9/P10 将公网使用从“登录即可用”推进到“角色权限 + 项目级授权 + 操作审计 + 申请审批 + 审计导出”。普通用户只能查看本人负责或被授权的项目，管理员动作会写入审计日志。
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <a className="btn-secondary" href="/api/admin/security/export?format=markdown" style={{ textDecoration: "none" }}>导出Markdown</a>
            <a className="btn-secondary" href="/api/admin/security/export?format=csv" style={{ textDecoration: "none" }}>导出CSV</a>
            <button className="btn-secondary" onClick={() => void loadSnapshot()} disabled={loading}>{loading ? "刷新中..." : "刷新"}</button>
          </div>
        </div>

        {(message || error || snapshot?.warnings?.length) && (
          <div style={{
            ...cardStyle,
            marginBottom: 18,
            borderColor: error ? "rgba(239,68,68,0.35)" : snapshot?.warnings?.length ? "rgba(245,158,11,0.35)" : "rgba(16,185,129,0.35)",
          }}>
            {error && <div style={{ color: "var(--red)", fontWeight: 800 }}>{error}</div>}
            {message && <div style={{ color: "var(--green)", fontWeight: 800 }}>{message}</div>}
            {snapshot?.warnings?.map(item => <div key={item} style={{ color: "var(--amber)", marginTop: 6 }}>⚠ {item}</div>)}
          </div>
        )}

        {loading && !snapshot && <div style={cardStyle}>正在加载安全中心...</div>}

        {snapshot && (
          <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 18, alignItems: "start" }}>
            <section style={cardStyle}>
              <h2 style={{ margin: "0 0 14px", fontSize: "1rem" }}>角色权限矩阵</h2>
              <div style={{ display: "grid", gap: 16 }}>
                {groupedPermissions.map(([category, items]) => (
                  <div key={category}>
                    <div style={{ color: "var(--accent2)", fontWeight: 900, marginBottom: 8 }}>{category}</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {items.map(item => (
                        <div key={item.key} style={{ display: "grid", gridTemplateColumns: "1.1fr 80px 80px", gap: 10, alignItems: "center", padding: "10px 12px", background: "var(--surface2)", borderRadius: 10 }}>
                          <div>
                            <div style={{ fontWeight: 800 }}>{item.label}</div>
                            <div style={{ color: "var(--text2)", fontSize: "0.76rem", marginTop: 3 }}>{item.description}</div>
                          </div>
                          <StatusTag value={snapshot.permissions.matrix.admin.includes(item.key) ? "admin" : "-"} />
                          <StatusTag value={snapshot.permissions.matrix.user.includes(item.key) ? "user" : "-"} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section style={{ ...cardStyle, gridColumn: "1 / -1" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "1rem" }}>业务角色与管理范围</h2>
                  <p style={{ color: "var(--text2)", fontSize: "0.78rem", marginTop: 6, lineHeight: 1.6 }}>
                    系统管理员只负责配置，不自动拥有 CEO 或 PMO 业务权限。每个角色必须绑定组织和明确管理对象，并受有效期约束。
                  </p>
                </div>
                <span className="tag tag-purple">PM / 运营 → PMO → CEO</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10 }}>
                <label>
                  <span style={labelStyle}>用户</span>
                  <AdminSelect value={businessRoleDraft.userId} onChange={event => setBusinessRoleDraft(prev => ({ ...prev, userId: event.target.value }))}>
                    {snapshot.users.map(user => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}
                  </AdminSelect>
                </label>
                <label>
                  <span style={labelStyle}>业务角色</span>
                  <AdminSelect value={businessRoleDraft.businessRole} onChange={event => setBusinessRoleDraft(prev => ({ ...prev, businessRole: event.target.value as BusinessRoleKey }))}>
                    <option value="pm">项目经理</option><option value="operations">运营</option><option value="pmo">PMO</option><option value="ceo">CEO</option>
                    <option value="sponsor">项目发起人</option><option value="business_owner">业务负责人</option><option value="finance">财务</option><option value="quality">质量</option>
                  </AdminSelect>
                </label>
                <label>
                  <span style={labelStyle}>组织</span>
                  <AdminSelect value={businessRoleDraft.orgId} onChange={event => {
                    const orgId = event.target.value;
                    const nextSubject = businessRoleDraft.subjectScope === "organization"
                      ? orgId
                      : businessRoleDraft.subjectScope === "portfolio"
                        ? snapshot.portfolios.find(item => item.orgId === orgId)?.id || ""
                        : snapshot.projects.find(item => item.orgId === orgId)?.id || "";
                    setBusinessRoleDraft(prev => ({ ...prev, orgId, subjectId: nextSubject }));
                  }}>
                    {snapshot.organizations.map(item => <option key={item.id} value={item.id}>{item.name}（{item.code}）</option>)}
                  </AdminSelect>
                </label>
                <label>
                  <span style={labelStyle}>管理范围</span>
                  <AdminSelect value={businessRoleDraft.subjectScope} onChange={event => {
                    const subjectScope = event.target.value as SubjectScopeKey;
                    const nextSubject = subjectScope === "organization"
                      ? businessRoleDraft.orgId
                      : subjectScope === "portfolio"
                        ? snapshot.portfolios.find(item => item.orgId === businessRoleDraft.orgId)?.id || ""
                        : subjectScope === "project"
                          ? snapshot.projects.find(item => item.orgId === businessRoleDraft.orgId)?.id || ""
                          : "";
                    setBusinessRoleDraft(prev => ({ ...prev, subjectScope, subjectId: nextSubject }));
                  }}>
                    <option value="project">项目</option><option value="portfolio">项目组合</option><option value="organization">组织</option><option value="customer">客户</option><option value="contract">合同</option>
                  </AdminSelect>
                </label>
                <label style={{ gridColumn: "span 2" }}>
                  <span style={labelStyle}>管理对象</span>
                  {availableRoleSubjects.length > 0 ? (
                    <AdminSelect value={businessRoleDraft.subjectScope === "organization" ? businessRoleDraft.orgId : businessRoleDraft.subjectId} onChange={event => setBusinessRoleDraft(prev => ({ ...prev, subjectId: event.target.value }))}>
                      {availableRoleSubjects.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </AdminSelect>
                  ) : (
                    <AdminInput value={businessRoleDraft.subjectId} onChange={event => setBusinessRoleDraft(prev => ({ ...prev, subjectId: event.target.value }))} placeholder="客户或合同范围请输入稳定ID；不得用名称猜测" />
                  )}
                </label>
                <label>
                  <span style={labelStyle}>生效时间</span>
                  <AdminInput type="datetime-local" value={businessRoleDraft.validFrom} onChange={event => setBusinessRoleDraft(prev => ({ ...prev, validFrom: event.target.value }))} />
                </label>
                <label>
                  <span style={labelStyle}>失效时间（可选）</span>
                  <AdminInput type="datetime-local" value={businessRoleDraft.validUntil} onChange={event => setBusinessRoleDraft(prev => ({ ...prev, validUntil: event.target.value }))} />
                </label>
              </div>
              <label style={{ display: "block", marginTop: 10 }}>
                <span style={labelStyle}>分配原因</span>
                <AdminInput value={businessRoleDraft.assignmentReason} onChange={event => setBusinessRoleDraft(prev => ({ ...prev, assignmentReason: event.target.value }))} placeholder="例如：担任智慧校园一期项目经理；负责2026年度项目组合治理" />
              </label>
              <button className="btn-primary" onClick={() => void assignBusinessRole()} disabled={saving || !businessRoleDraft.userId || !businessRoleDraft.orgId || !(businessRoleDraft.subjectScope === "organization" ? businessRoleDraft.orgId : businessRoleDraft.subjectId)} style={{ marginTop: 12 }}>
                {saving ? "处理中..." : "分配业务角色"}
              </button>
              <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
                {snapshot.businessRoles.length === 0 && <div style={{ color: "var(--text2)" }}>暂无业务角色分配。完成 P17 数据库迁移后，可在这里建立真实汇报与授权范围。</div>}
                {snapshot.businessRoles.map(item => (
                  <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr minmax(260px,.8fr) auto", gap: 10, alignItems: "center", padding: 11, borderRadius: 10, background: "var(--surface2)" }}>
                    <div>
                      <div style={{ fontWeight: 850 }}>{item.userName || item.userEmail || item.userId} · {item.businessRole}</div>
                      <div style={{ color: "var(--text2)", fontSize: "0.75rem", marginTop: 4 }}>{item.subjectScope} / {item.subjectId} · {new Date(item.validFrom).toLocaleString("zh-CN")} 至 {item.validUntil ? new Date(item.validUntil).toLocaleString("zh-CN") : "长期"}</div>
                    </div>
                    {item.status === "active" ? <AdminInput value={revokeRoleReason[item.id] || ""} onChange={event => setRevokeRoleReason(prev => ({ ...prev, [item.id]: event.target.value }))} placeholder="撤销原因（必填）" /> : <span style={{ color: "var(--text2)" }}>{item.assignmentReason || "-"}</span>}
                    {item.status === "active" ? <button className="btn-secondary" onClick={() => void revokeBusinessRole(item.id)} disabled={saving}>撤销业务角色</button> : <StatusTag value={item.status} />}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: "0.9rem", marginBottom: 6 }}>业务汇报关系</h3>
                <p style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.6, marginBottom: 10 }}>建立真实的 PM/运营 → PMO → CEO 上报链。升级信号找不到有效汇报关系时会停止，不会猜测接收人。</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 9 }}>
                  <label><span style={labelStyle}>组织</span><AdminSelect value={reportingDraft.orgId} onChange={event => {
                    const orgId = event.target.value;
                    const subjectId = reportingDraft.subjectScope === "organization" ? orgId : reportingDraft.subjectScope === "portfolio" ? snapshot.portfolios.find(item => item.orgId === orgId)?.id || "" : snapshot.projects.find(item => item.orgId === orgId)?.id || "";
                    setReportingDraft(prev => ({ ...prev, orgId, subjectId }));
                  }}>{snapshot.organizations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</AdminSelect></label>
                  <label><span style={labelStyle}>适用范围</span><AdminSelect value={reportingDraft.subjectScope} onChange={event => {
                    const subjectScope = event.target.value as "project" | "portfolio" | "organization";
                    const subjectId = subjectScope === "organization" ? reportingDraft.orgId : subjectScope === "portfolio" ? snapshot.portfolios.find(item => item.orgId === reportingDraft.orgId)?.id || "" : snapshot.projects.find(item => item.orgId === reportingDraft.orgId)?.id || "";
                    setReportingDraft(prev => ({ ...prev, subjectScope, subjectId }));
                  }}><option value="project">项目</option><option value="portfolio">项目组合</option><option value="organization">组织</option></AdminSelect></label>
                  <label style={{ gridColumn: "span 2" }}><span style={labelStyle}>管理对象</span><AdminSelect value={reportingDraft.subjectId} onChange={event => setReportingDraft(prev => ({ ...prev, subjectId: event.target.value }))}>{reportingSubjects.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</AdminSelect></label>
                  <label><span style={labelStyle}>上报人</span><AdminSelect value={reportingDraft.fromUserId} onChange={event => setReportingDraft(prev => ({ ...prev, fromUserId: event.target.value }))}>{snapshot.users.map(user => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}</AdminSelect></label>
                  <label><span style={labelStyle}>上报角色</span><AdminSelect value={reportingDraft.fromBusinessRole} onChange={event => setReportingDraft(prev => ({ ...prev, fromBusinessRole: event.target.value as BusinessRoleKey }))}><option value="pm">项目经理</option><option value="operations">运营</option><option value="pmo">PMO</option></AdminSelect></label>
                  <label><span style={labelStyle}>接收人</span><AdminSelect value={reportingDraft.toUserId} onChange={event => setReportingDraft(prev => ({ ...prev, toUserId: event.target.value }))}>{snapshot.users.map(user => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}</AdminSelect></label>
                  <label><span style={labelStyle}>接收角色</span><AdminSelect value={reportingDraft.toBusinessRole} onChange={event => setReportingDraft(prev => ({ ...prev, toBusinessRole: event.target.value as BusinessRoleKey }))}><option value="pmo">PMO</option><option value="ceo">CEO</option><option value="sponsor">项目发起人</option></AdminSelect></label>
                  <label><span style={labelStyle}>生效时间</span><AdminInput type="datetime-local" value={reportingDraft.validFrom} onChange={event => setReportingDraft(prev => ({ ...prev, validFrom: event.target.value }))} /></label>
                  <label><span style={labelStyle}>失效时间（可选）</span><AdminInput type="datetime-local" value={reportingDraft.validUntil} onChange={event => setReportingDraft(prev => ({ ...prev, validUntil: event.target.value }))} /></label>
                  <label><span style={labelStyle}>关系类型</span><AdminSelect value={reportingDraft.relationshipType} onChange={event => setReportingDraft(prev => ({ ...prev, relationshipType: event.target.value }))}><option value="reports_to">正式汇报</option><option value="escalates_to">升级接收</option><option value="reviews">复核</option><option value="delegates_to">授权代理</option></AdminSelect></label>
                  <button className="btn-primary" onClick={() => void assignReportingRelationship()} disabled={saving || !reportingDraft.subjectId || !reportingDraft.fromUserId || !reportingDraft.toUserId} style={{ alignSelf: "end", minHeight: 38 }}>建立汇报关系</button>
                </div>
                <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                  {snapshot.reportingRelationships.map(item => (
                    <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr minmax(220px,.65fr) auto", gap: 9, alignItems: "center", padding: 10, borderRadius: 10, background: "var(--surface2)" }}>
                      <div><strong>{item.fromUserName || item.fromUserId}（{item.fromBusinessRole}） → {item.toUserName || item.toUserId}（{item.toBusinessRole}）</strong><div style={{ color: "var(--text2)", fontSize: "0.74rem", marginTop: 4 }}>{item.subjectScope} / {item.subjectId} · {item.relationshipType}</div></div>
                      {item.status === "active" ? <AdminInput value={revokeReportingReason[item.id] || ""} onChange={event => setRevokeReportingReason(prev => ({ ...prev, [item.id]: event.target.value }))} placeholder="撤销原因（必填）" /> : <StatusTag value={item.status} />}
                      {item.status === "active" ? <button className="btn-secondary" onClick={() => void revokeReportingRelationship(item.id)} disabled={saving}>撤销关系</button> : null}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: "0.9rem", marginBottom: 6 }}>管理规则审批</h3>
                <p style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.6, marginBottom: 10 }}>规则只有经过管理员明确批准后才会参与真实信号计算；草稿规则不会在后台悄悄执行。</p>
                <div style={{ display: "grid", gap: 8 }}>
                  {snapshot.managementRules.map(rule => (
                    <div key={rule.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center", padding: 10, borderRadius: 10, background: "var(--surface2)" }}>
                      <div><strong>{rule.ruleKey}</strong><div style={{ color: "var(--text2)", fontSize: "0.74rem", marginTop: 4 }}>{rule.version} · {rule.scopeKey}</div></div>
                      <StatusTag value={rule.status} />
                      {rule.status === "draft" && rule.version === "S1-MILESTONE-DELAY-v1" ? <button className="btn-primary" onClick={() => void activateManagementRule(rule.id)} disabled={saving}>审阅并启用S1规则</button> : <span style={{ color: "var(--text2)", fontSize: "0.74rem" }}>{rule.approvedAt ? new Date(rule.approvedAt).toLocaleString("zh-CN") : "-"}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section style={cardStyle}>
              <h2 style={{ margin: "0 0 14px", fontSize: "1rem" }}>运行安全状态</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ padding: 12, borderRadius: 12, background: "var(--surface2)" }}>
                  <div style={{ color: "var(--text2)", fontSize: "0.78rem" }}>登录访问</div>
                  <div style={{ marginTop: 8 }}><StatusTag value={snapshot.runtime.authRequired ? "active" : "disabled"} /></div>
                </div>
                <div style={{ padding: 12, borderRadius: 12, background: "var(--surface2)" }}>
                  <div style={{ color: "var(--text2)", fontSize: "0.78rem" }}>Supabase认证存储</div>
                  <div style={{ marginTop: 8 }}><StatusTag value={snapshot.runtime.authStorageConfigured ? "active" : "disabled"} /></div>
                </div>
              </div>
              <p style={{ color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.7 }}>
                环境变量仍然只在 Vercel/Supabase 中配置；本页面保存的是企业化策略说明和可审计配置，不保存密钥。
              </p>
            </section>

            <section style={{ ...cardStyle, gridColumn: "1 / -1" }}>
              <h2 style={{ margin: "0 0 14px", fontSize: "1rem" }}>安全风险面板</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                {securityRisks.map(item => {
                  const color = item.severity === "high" ? "var(--red)" : item.severity === "medium" ? "var(--amber)" : "var(--green)";
                  return (
                    <div key={item.title} style={{ padding: 12, borderRadius: 12, background: "var(--surface2)", border: `1px solid ${color}55` }}>
                      <div style={{ color, fontWeight: 900 }}>{item.title}</div>
                      <div style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.6, marginTop: 6 }}>{item.detail}</div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section style={cardStyle}>
              <h2 style={{ margin: "0 0 14px", fontSize: "1rem" }}>用户与角色</h2>
              <div style={{ display: "grid", gap: 10, maxHeight: 500, overflow: "auto" }}>
                {snapshot.users.map(user => (
                  <div key={user.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, padding: 12, borderRadius: 12, background: "var(--surface2)" }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{user.name || user.email}</div>
                      <div style={{ color: "var(--text2)", fontSize: "0.76rem", marginTop: 3 }}>{user.email} · {user.phone}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}><StatusTag value={user.role} /><StatusTag value={user.status} /></div>
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      <button className="btn-secondary" onClick={() => void updateUser(user, { role: user.role === "admin" ? "user" : "admin" })} disabled={saving}>
                        {user.role === "admin" ? "设为普通用户" : "设为管理员"}
                      </button>
                      <button className="btn-secondary" onClick={() => void updateUser(user, { status: user.status === "active" ? "disabled" : "active" })} disabled={saving}>
                        {user.status === "active" ? "禁用" : "启用"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section style={cardStyle}>
              <h2 style={{ margin: "0 0 14px", fontSize: "1rem" }}>项目级授权</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label>
                  <span style={labelStyle}>授权用户</span>
                  <AdminSelect value={grantDraft.userId} onChange={event => setGrantDraft(prev => ({ ...prev, userId: event.target.value }))}>
                    {snapshot.users.map(user => <option key={user.id} value={user.id}>{user.name || user.email} / {user.role}</option>)}
                  </AdminSelect>
                </label>
                <label>
                  <span style={labelStyle}>授权级别</span>
                  <AdminSelect value={grantDraft.accessLevel} onChange={event => setGrantDraft(prev => ({ ...prev, accessLevel: event.target.value as ProjectAccessGrant["accessLevel"] }))}>
                    <option value="viewer">viewer - 查看</option>
                    <option value="editor">editor - 编辑</option>
                    <option value="owner">owner - 负责</option>
                  </AdminSelect>
                </label>
                <label>
                  <span style={labelStyle}>项目名称</span>
                  <AdminInput value={grantDraft.projectName} onChange={event => setGrantDraft(prev => ({ ...prev, projectName: event.target.value }))} placeholder="如：智慧校园一期" />
                </label>
                <label>
                  <span style={labelStyle}>项目编号</span>
                  <AdminInput value={grantDraft.projectCode} onChange={event => setGrantDraft(prev => ({ ...prev, projectCode: event.target.value }))} placeholder="可选，如：PMO-2026-001" />
                </label>
              </div>
              <label style={{ marginTop: 10, display: "block" }}>
                <span style={labelStyle}>授权原因</span>
                <AdminInput value={grantDraft.grantReason} onChange={event => setGrantDraft(prev => ({ ...prev, grantReason: event.target.value }))} placeholder="例如：临时参与验收支持" />
              </label>
              <button className="btn-primary" onClick={() => void grantProjectAccess()} disabled={saving} style={{ marginTop: 12 }}>{saving ? "处理中..." : "授予项目访问权限"}</button>
              <div style={{ display: "grid", gap: 8, marginTop: 14, maxHeight: 300, overflow: "auto" }}>
                {snapshot.projectAccess.length === 0 && <div style={{ color: "var(--text2)" }}>暂无项目授权记录。</div>}
                {snapshot.projectAccess.map(grant => (
                  <div key={grant.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, padding: 10, borderRadius: 10, background: "var(--surface2)" }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{grant.projectName || grant.projectCode}</div>
                      <div style={{ color: "var(--text2)", fontSize: "0.75rem", marginTop: 4 }}>{grant.userName || grant.userEmail || grant.userId} · {grant.accessLevel} · {grant.status}</div>
                    </div>
                    {grant.status === "active" && <button className="btn-secondary" onClick={() => void revokeGrant(grant.id)} disabled={saving}>撤销</button>}
                  </div>
                ))}
              </div>
            </section>

            <section style={cardStyle}>
              <h2 style={{ margin: "0 0 14px", fontSize: "1rem" }}>项目访问申请审批</h2>
              <div style={{ display: "grid", gap: 10, maxHeight: 430, overflow: "auto" }}>
                {snapshot.projectAccessRequests.length === 0 && <div style={{ color: "var(--text2)" }}>暂无项目访问申请。</div>}
                {snapshot.projectAccessRequests.map(item => (
                  <div key={item.id} style={{ padding: 12, borderRadius: 12, background: "var(--surface2)", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 900 }}>{item.projectName || item.projectCode}</div>
                        <div style={{ color: "var(--text2)", fontSize: "0.75rem", marginTop: 4 }}>{item.requesterName || item.requesterEmail || item.requesterId} · {item.accessLevel}</div>
                      </div>
                      <StatusTag value={item.status} />
                    </div>
                    <div style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6, marginTop: 8 }}>{item.reason}</div>
                    {item.status === "pending" ? (
                      <>
                        <input
                          className="input"
                          value={reviewDraft[item.id] || ""}
                          onChange={event => setReviewDraft(prev => ({ ...prev, [item.id]: event.target.value }))}
                          placeholder="审批意见，可选"
                          style={{ marginTop: 10, minHeight: 36 }}
                        />
                        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                          <button className="btn-primary" onClick={() => void approveAccessRequest(item.id)} disabled={saving}>批准并授权</button>
                          <button className="btn-secondary" onClick={() => void rejectAccessRequest(item.id)} disabled={saving}>驳回</button>
                        </div>
                      </>
                    ) : (
                      <div style={{ color: "var(--text2)", fontSize: "0.75rem", marginTop: 8 }}>
                        审批人：{item.reviewerName || "-"}；意见：{item.reviewComment || "-"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section style={cardStyle}>
              <h2 style={{ margin: "0 0 14px", fontSize: "1rem" }}>系统配置</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label>
                  <span style={labelStyle}>配置键</span>
                  <AdminInput value={configDraft.configKey} onChange={event => setConfigDraft(prev => ({ ...prev, configKey: event.target.value }))} />
                </label>
                <label>
                  <span style={labelStyle}>分类</span>
                  <AdminInput value={configDraft.category} onChange={event => setConfigDraft(prev => ({ ...prev, category: event.target.value }))} />
                </label>
              </div>
              <label style={{ display: "block", marginTop: 10 }}>
                <span style={labelStyle}>说明</span>
                <AdminInput value={configDraft.description} onChange={event => setConfigDraft(prev => ({ ...prev, description: event.target.value }))} />
              </label>
              <label style={{ display: "block", marginTop: 10 }}>
                <span style={labelStyle}>配置 JSON</span>
                <AdminTextArea value={configDraft.configValue} onChange={event => setConfigDraft(prev => ({ ...prev, configValue: event.target.value }))} />
              </label>
              <button className="btn-primary" onClick={() => void saveConfig()} disabled={saving} style={{ marginTop: 12 }}>保存配置</button>
              <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
                {snapshot.systemConfigurations.map(item => (
                  <div key={item.id} style={{ padding: 10, borderRadius: 10, background: "var(--surface2)" }}>
                    <div style={{ fontWeight: 800 }}>{item.key}</div>
                    <div style={{ color: "var(--text2)", fontSize: "0.75rem", marginTop: 4 }}>{item.category} · {item.description || "无说明"}</div>
                  </div>
                ))}
              </div>
            </section>

            <section style={{ ...cardStyle, gridColumn: "1 / -1" }}>
              <h2 style={{ margin: "0 0 14px", fontSize: "1rem" }}>操作审计日志</h2>
              <div style={{ overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ color: "var(--text2)", textAlign: "left" }}>
                      <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>时间</th>
                      <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>操作者</th>
                      <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>动作</th>
                      <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>对象</th>
                      <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>状态</th>
                      <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>摘要</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.auditLogs.length === 0 && (
                      <tr><td colSpan={6} style={{ padding: 16, color: "var(--text2)" }}>暂无审计日志。若已执行 P9 SQL，新的管理员操作会在这里出现。</td></tr>
                    )}
                    {snapshot.auditLogs.map(log => (
                      <tr key={log.id}>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{new Date(log.createdAt).toLocaleString("zh-CN")}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>{log.actorName}<div style={{ color: "var(--text2)", fontSize: "0.72rem" }}>{log.actorRole}</div></td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>{log.action}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>{log.resourceType}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}><StatusTag value={log.status} /></td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)", color: "var(--text2)" }}>{log.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
