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

type SecuritySnapshot = {
  permissions: {
    definitions: PermissionDefinition[];
    matrix: Record<Role, string[]>;
  };
  users: AppUser[];
  projectAccess: ProjectAccessGrant[];
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
        <span style={{ color: "var(--border)" }}>|</span>
        <strong style={{ color: "var(--purple)" }}>🛡️ 管理员安全配置中心</strong>
        <span className="tag tag-purple">P9</span>
      </header>

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "28px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "start", marginBottom: 22 }}>
          <div>
            <h1 style={{ margin: "0 0 8px", fontSize: "1.5rem", fontWeight: 900 }}>权限、项目授权、审计和企业配置统一管理</h1>
            <p style={{ margin: 0, color: "var(--text2)", lineHeight: 1.7, maxWidth: 920 }}>
              P9 将公网使用从“登录即可用”推进到“角色权限 + 项目级授权 + 操作审计”。普通用户只能查看本人负责或被授权的项目，管理员动作会写入审计日志。
            </p>
          </div>
          <button className="btn-secondary" onClick={() => void loadSnapshot()} disabled={loading}>{loading ? "刷新中..." : "刷新"}</button>
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
