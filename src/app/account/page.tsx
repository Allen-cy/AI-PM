"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface AppUser {
  id: string;
  email: string;
  phone: string;
  name: string | null;
  role: "admin" | "user";
  status: "active" | "disabled";
}

type EditMode = "name" | "email" | "phone" | "password" | null;
type ModelProvider = "deepseek" | "minimax" | "glm" | "anthropic" | "openai-compatible";
type FeishuTableKey = "project" | "milestone" | "task" | "risk" | "contract" | "payment" | "cost" | "syncLedger";

interface AiSettings {
  provider: ModelProvider;
  model: string;
  baseUrl: string;
  enabled: boolean;
  apiKeyConfigured: boolean;
  apiKeyLast4: string;
  providerOptions: ModelProvider[];
  defaultModels: Record<ModelProvider, string>;
}

interface FeishuConnection {
  appId: string;
  appSecretConfigured: boolean;
  appSecretLast4: string;
  baseToken: string;
  tableMapping: Partial<Record<FeishuTableKey, string>>;
  configured: boolean;
  status: string;
  tableLabels: Record<FeishuTableKey, string>;
  setupHint: string;
  larkCliHint: string;
}

interface AiConnectionTestResult {
  status: "ok" | "not_configured" | "failed";
  providerLabel: string;
  model: string;
  checkedAt: string;
  latencyMs?: number;
  failureCategory?: string;
  message: string;
  nextActions: string[];
  endpointHost?: string;
  responsePreview?: string;
}

interface FeishuConnectionTestStep {
  id: string;
  label: string;
  status: "ok" | "warning" | "failed" | "skipped";
  detail: string;
  nextAction?: string;
  code?: string;
}

interface FeishuConnectionTestResult {
  status: "ok" | "warning" | "failed" | "not_configured";
  checkedAt: string;
  baseAccessible: boolean;
  tableCount: number;
  configuredTableCount: number;
  steps: FeishuConnectionTestStep[];
  summary: {
    status: "ok" | "warning" | "failed" | "not_configured";
    message: string;
    okCount: number;
    warningCount: number;
    failedCount: number;
    skippedCount: number;
  };
}

const FIELD_LABELS: Record<Exclude<EditMode, null | "password">, string> = {
  name: "用户名称",
  email: "邮箱",
  phone: "手机号码",
};

export default function AccountPage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState({ name: "", email: "", phone: "" });
  const [draftProfile, setDraftProfile] = useState({ name: "", email: "", phone: "" });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [aiDraft, setAiDraft] = useState({
    provider: "minimax" as ModelProvider,
    model: "MiniMax-M3",
    baseUrl: "",
    apiKey: "",
    enabled: true,
  });
  const [feishuConnection, setFeishuConnection] = useState<FeishuConnection | null>(null);
  const [feishuDraft, setFeishuDraft] = useState<{
    appId: string;
    appSecret: string;
    baseToken: string;
    tableMapping: Partial<Record<FeishuTableKey, string>>;
  }>({
    appId: "",
    appSecret: "",
    baseToken: "",
    tableMapping: {},
  });
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [feishuMessage, setFeishuMessage] = useState<string | null>(null);
  const [aiTestResult, setAiTestResult] = useState<AiConnectionTestResult | null>(null);
  const [feishuTestResult, setFeishuTestResult] = useState<FeishuConnectionTestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [feishuSaving, setFeishuSaving] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [feishuTesting, setFeishuTesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await response.json();
        if (!data.user) {
          window.location.href = "/auth/login?next=/account";
          return;
        }
        const nextProfile = {
          name: data.user.name || "",
          email: data.user.email || "",
          phone: data.user.phone || "",
        };
        if (!cancelled) {
          setUser(data.user);
          setProfile(nextProfile);
          setDraftProfile(nextProfile);
        }
        const [aiResponse, feishuResponse] = await Promise.all([
          fetch("/api/user/ai-settings", { cache: "no-store" }),
          fetch("/api/user/feishu-connection", { cache: "no-store" }),
        ]);
        if (!cancelled && aiResponse.ok) {
          const aiData = await aiResponse.json() as { settings?: AiSettings };
          if (aiData.settings) {
            setAiSettings(aiData.settings);
            setAiDraft({
              provider: aiData.settings.provider,
              model: aiData.settings.model,
              baseUrl: aiData.settings.baseUrl,
              apiKey: "",
              enabled: aiData.settings.enabled,
            });
          }
        }
        if (!cancelled && feishuResponse.ok) {
          const feishuData = await feishuResponse.json() as { connection?: FeishuConnection };
          if (feishuData.connection) {
            setFeishuConnection(feishuData.connection);
            setFeishuDraft({
              appId: feishuData.connection.appId,
              appSecret: "",
              baseToken: feishuData.connection.baseToken,
              tableMapping: feishuData.connection.tableMapping,
            });
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  const openEdit = (mode: EditMode) => {
    setMessage(null);
    setPasswordMessage(null);
    setDraftProfile(profile);
    setPasswordForm({ currentPassword: "", newPassword: "" });
    setEditMode(mode);
  };

  const saveProfile = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftProfile),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败");
      const nextProfile = {
        name: data.user.name || "",
        email: data.user.email || "",
        phone: data.user.phone || "",
      };
      setUser(data.user);
      setProfile(nextProfile);
      setDraftProfile(nextProfile);
      setEditMode(null);
      setMessage("用户资料已更新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    setSaving(true);
    setPasswordMessage(null);
    try {
      const response = await fetch("/api/auth/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(passwordForm),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "密码修改失败");
      setPasswordForm({ currentPassword: "", newPassword: "" });
      setEditMode(null);
      setPasswordMessage("密码已更新。");
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : "密码修改失败");
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/auth/login";
  };

  const saveAiSettings = async () => {
    setAiSaving(true);
    setAiMessage(null);
    try {
      const response = await fetch("/api/user/ai-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiDraft),
      });
      const data = await response.json() as { settings?: AiSettings; error?: string };
      if (!response.ok || !data.settings) throw new Error(data.error || "AI模型配置保存失败");
      setAiSettings(data.settings);
      setAiDraft(prev => ({ ...prev, apiKey: "", model: data.settings!.model, baseUrl: data.settings!.baseUrl, provider: data.settings!.provider, enabled: data.settings!.enabled }));
      setAiMessage("AI模型配置已保存。");
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : "AI模型配置保存失败");
    } finally {
      setAiSaving(false);
    }
  };

  const testAiSettings = async () => {
    setAiTesting(true);
    setAiMessage(null);
    setAiTestResult(null);
    try {
      const response = await fetch("/api/user/ai-settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiDraft),
      });
      const data = await response.json() as { test?: AiConnectionTestResult; warning?: string };
      if (!data.test) throw new Error(data.warning || "AI模型测试失败");
      setAiTestResult(data.test);
      setAiMessage(data.test.message);
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : "AI模型测试失败");
    } finally {
      setAiTesting(false);
    }
  };

  const saveFeishuConnection = async () => {
    setFeishuSaving(true);
    setFeishuMessage(null);
    try {
      const response = await fetch("/api/user/feishu-connection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(feishuDraft),
      });
      const data = await response.json() as { connection?: FeishuConnection; error?: string };
      if (!response.ok || !data.connection) throw new Error(data.error || "飞书配置保存失败");
      setFeishuConnection(data.connection);
      setFeishuDraft({
        appId: data.connection.appId,
        appSecret: "",
        baseToken: data.connection.baseToken,
        tableMapping: data.connection.tableMapping,
      });
      setFeishuMessage("个人飞书接入配置已保存。");
    } catch (error) {
      setFeishuMessage(error instanceof Error ? error.message : "飞书配置保存失败");
    } finally {
      setFeishuSaving(false);
    }
  };

  const testFeishuConnection = async (includeWriteCheck = false) => {
    if (includeWriteCheck && !window.confirm("确认向飞书同步流水表写入一条 AI-PMO 连接测试记录？该操作用于验证写入权限，不会写入项目台账。")) return;
    setFeishuTesting(true);
    setFeishuMessage(null);
    setFeishuTestResult(null);
    try {
      const response = await fetch("/api/user/feishu-connection/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...feishuDraft, includeWriteCheck }),
      });
      const data = await response.json() as { test?: FeishuConnectionTestResult; warning?: string };
      if (!data.test) throw new Error(data.warning || "飞书连接测试失败");
      setFeishuTestResult(data.test);
      setFeishuMessage(data.test.summary.message);
    } catch (error) {
      setFeishuMessage(error instanceof Error ? error.message : "飞书连接测试失败");
    } finally {
      setFeishuTesting(false);
    }
  };

  const profileInput = (field: keyof typeof draftProfile) => (
    <input
      style={{
        width: "100%",
        border: "1px solid rgba(76,58,39,0.28)",
        borderRadius: 14,
        padding: "13px 14px",
        background: "linear-gradient(180deg, #fffdf7, #eee0c8)",
        color: "#2b2118",
        boxShadow: "inset 0 3px 8px rgba(72,51,28,0.14), 0 1px 0 rgba(255,255,255,0.9)",
        outline: "none",
      }}
      value={draftProfile[field]}
      onChange={event => setDraftProfile(prev => ({ ...prev, [field]: event.target.value }))}
    />
  );

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#352215", color: "#f6dfb4" }}>
        正在读取用户信息...
      </main>
    );
  }

  const roleLabel = user?.role === "admin" ? "管理员" : "普通用户";
  const statusLabel = user?.status === "active" ? "正常启用" : "已停用";

  return (
    <main style={{
      minHeight: "100vh",
      padding: 24,
      color: "#2b2118",
      background:
        "radial-gradient(circle at 12% 10%, rgba(255,240,202,0.32), transparent 28%), linear-gradient(145deg, #2b1b11, #6a472c 48%, #2e1b12)",
    }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <header style={{
          marginBottom: 22,
          borderRadius: 26,
          padding: "22px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          background: "linear-gradient(180deg, rgba(255,247,230,0.98), rgba(226,195,144,0.94))",
          boxShadow: "0 22px 48px rgba(0,0,0,0.32), inset 0 2px 1px rgba(255,255,255,0.9), inset 0 -10px 22px rgba(111,76,35,0.16)",
          border: "1px solid rgba(255,255,255,0.55)",
        }}>
          <div>
            <Link href="/" style={{ color: "#7a4e22", textDecoration: "none", fontSize: "0.86rem", fontWeight: 700 }}>← 返回首页</Link>
            <h1 style={{ marginTop: 10, fontSize: "1.8rem", marginBottom: 6 }}>用户中心</h1>
            <p style={{ color: "#7d6246", fontSize: "0.92rem" }}>查看完整用户信息，并按需修改单项资料。</p>
          </div>
          <button
            onClick={logout}
            style={{
              border: "1px solid rgba(80,50,24,0.35)",
              borderRadius: 14,
              padding: "10px 16px",
              color: "#fff8e8",
              fontWeight: 800,
              background: "linear-gradient(180deg, #9b6a35, #5d351b)",
              boxShadow: "0 10px 18px rgba(73,44,19,0.22), inset 0 2px 2px rgba(255,235,181,0.42)",
              cursor: "pointer",
            }}
          >
            退出登录
          </button>
        </header>

        {user?.role === "admin" && (
          <section style={{
            marginBottom: 18,
            padding: "16px 18px",
            borderRadius: 20,
            background: "linear-gradient(180deg, rgba(246,238,255,0.98), rgba(219,204,239,0.94))",
            border: "1px solid rgba(139,92,246,0.28)",
            boxShadow: "0 16px 30px rgba(37,22,66,0.18), inset 0 2px 1px rgba(255,255,255,0.9)",
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "center",
          }}>
            <div>
              <div style={{ fontWeight: 800, color: "#5b36a3" }}>管理员入口</div>
              <div style={{ color: "#6e617a", fontSize: "0.86rem", marginTop: 4 }}>审核注册申请，维护权限、项目授权、审计日志和企业配置。</div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Link href="/admin/registration-requests" style={{
                textDecoration: "none",
                borderRadius: 14,
                padding: "10px 16px",
                color: "#fff",
                fontWeight: 800,
                background: "linear-gradient(180deg, #8b5cf6, #5b36a3)",
                boxShadow: "0 10px 20px rgba(91,54,163,0.24), inset 0 2px 2px rgba(255,255,255,0.32)",
              }}>
                注册审核
              </Link>
              <Link href="/admin/security" style={{
                textDecoration: "none",
                borderRadius: 14,
                padding: "10px 16px",
                color: "#fff",
                fontWeight: 800,
                background: "linear-gradient(180deg, #10b981, #047857)",
                boxShadow: "0 10px 20px rgba(4,120,87,0.22), inset 0 2px 2px rgba(255,255,255,0.32)",
              }}>
                安全配置中心
              </Link>
            </div>
          </section>
        )}

        <section style={{
          marginBottom: 18,
          padding: "16px 18px",
          borderRadius: 20,
          background: "linear-gradient(180deg, rgba(231,244,255,0.98), rgba(209,230,250,0.94))",
          border: "1px solid rgba(59,130,246,0.25)",
          boxShadow: "0 14px 26px rgba(30,64,175,0.12), inset 0 2px 1px rgba(255,255,255,0.85)",
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "center",
        }}>
          <div>
            <div style={{ fontWeight: 800, color: "#1d4ed8" }}>项目访问申请</div>
            <div style={{ color: "#52657a", fontSize: "0.86rem", marginTop: 4 }}>如果需要查看非本人负责的项目，可以提交访问申请，由管理员审批授权。</div>
          </div>
          <Link href="/account/project-access" style={{
            textDecoration: "none",
            borderRadius: 14,
            padding: "10px 16px",
            color: "#fff",
            fontWeight: 800,
            background: "linear-gradient(180deg, #3b82f6, #1d4ed8)",
            boxShadow: "0 10px 20px rgba(29,78,216,0.22), inset 0 2px 2px rgba(255,255,255,0.32)",
          }}>
            提交项目访问申请
          </Link>
        </section>

        <div style={{
          display: "grid",
          gridTemplateColumns: "330px minmax(0, 1fr)",
          gap: 20,
          alignItems: "start",
        }}>
          <aside style={{
            borderRadius: 26,
            padding: 24,
            background: "linear-gradient(160deg, #4a2c1b, #8a5c35)",
            color: "#fff1d3",
            boxShadow: "0 24px 48px rgba(0,0,0,0.34), inset 0 2px 1px rgba(255,255,255,0.22), inset 0 -18px 36px rgba(0,0,0,0.18)",
            border: "1px solid rgba(255,255,255,0.18)",
          }}>
            <div style={{
              width: 112,
              height: 112,
              borderRadius: 28,
              display: "grid",
              placeItems: "center",
              fontSize: "3rem",
              background: "linear-gradient(145deg, #fff3d0, #ce9140)",
              boxShadow: "0 18px 34px rgba(0,0,0,0.28), inset 0 3px 8px rgba(255,255,255,0.8), inset 0 -8px 18px rgba(91,52,18,0.38)",
            }}>
              {user?.role === "admin" ? "👑" : "👤"}
            </div>
            <h2 style={{ marginTop: 20, marginBottom: 8, fontSize: "1.5rem" }}>{profile.name || "未命名用户"}</h2>
            <p style={{ color: "rgba(255,241,211,0.74)", lineHeight: 1.7, fontSize: "0.9rem" }}>
              账号身份卡片。你可以在右侧逐项修改资料，系统会同步更新到 Supabase。
            </p>
            <div style={{ marginTop: 22, display: "grid", gap: 10 }}>
              <span style={{
                display: "inline-flex",
                width: "fit-content",
                borderRadius: 999,
                padding: "6px 12px",
                background: "rgba(255,241,211,0.14)",
                boxShadow: "inset 0 2px 6px rgba(0,0,0,0.14)",
                fontWeight: 800,
              }}>{roleLabel}</span>
              <span style={{
                display: "inline-flex",
                width: "fit-content",
                borderRadius: 999,
                padding: "6px 12px",
                background: "rgba(32,139,85,0.25)",
                color: "#d6ffe7",
                boxShadow: "inset 0 2px 6px rgba(0,0,0,0.14)",
                fontWeight: 800,
              }}>{statusLabel}</span>
            </div>
          </aside>

          <section style={{
            borderRadius: 26,
            padding: 24,
            background: "linear-gradient(180deg, rgba(255,252,244,0.98), rgba(235,218,187,0.95))",
            border: "1px solid rgba(255,255,255,0.5)",
            boxShadow: "0 24px 48px rgba(0,0,0,0.28), inset 0 2px 1px rgba(255,255,255,0.92), inset 0 -12px 28px rgba(127,88,44,0.14)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 18 }}>
              <div>
                <h2 style={{ fontSize: "1.25rem", marginBottom: 4 }}>完整用户信息</h2>
                <p style={{ color: "#7d6246", fontSize: "0.88rem" }}>每项信息后方都提供独立修改入口。</p>
              </div>
              <span style={{ color: "#8a5724", fontWeight: 800, fontSize: "0.8rem" }}>ID: {user?.id.slice(0, 8)}</span>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {([
                { key: "name", label: "用户名称", value: profile.name || "未填写", icon: "🏷️" },
                { key: "email", label: "邮箱", value: profile.email, icon: "✉️" },
                { key: "phone", label: "手机号码", value: profile.phone, icon: "📱" },
              ] as const).map(item => (
                <div key={item.key} style={{
                  display: "grid",
                  gridTemplateColumns: "44px minmax(0, 1fr) auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "14px 16px",
                  borderRadius: 18,
                  background: "linear-gradient(180deg, #fffaf0, #e7d4b6)",
                  boxShadow: "inset 0 2px 1px rgba(255,255,255,0.86), inset 0 -6px 14px rgba(128,89,43,0.1), 0 8px 18px rgba(88,58,27,0.08)",
                  border: "1px solid rgba(123,88,45,0.18)",
                }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    display: "grid",
                    placeItems: "center",
                    background: "linear-gradient(145deg, #f7e2b4, #c28a3c)",
                    boxShadow: "inset 0 2px 4px rgba(255,255,255,0.68), inset 0 -4px 10px rgba(80,48,18,0.26)",
                  }}>{item.icon}</div>
                  <div>
                    <div style={{ color: "#876849", fontSize: "0.78rem", fontWeight: 800 }}>{item.label}</div>
                    <div style={{ color: "#2b2118", fontWeight: 800, marginTop: 4, wordBreak: "break-all" }}>{item.value}</div>
                  </div>
                  <button
                    onClick={() => openEdit(item.key)}
                    style={{
                      border: "1px solid rgba(128,88,42,0.28)",
                      borderRadius: 12,
                      padding: "8px 12px",
                      color: "#7a4e22",
                      background: "linear-gradient(180deg, #fff7e6, #ddc39a)",
                      boxShadow: "0 6px 12px rgba(96,62,28,0.12), inset 0 2px 1px rgba(255,255,255,0.8)",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    修改
                  </button>
                </div>
              ))}

              <div style={{
                display: "grid",
                gridTemplateColumns: "44px minmax(0, 1fr) auto",
                gap: 12,
                alignItems: "center",
                padding: "14px 16px",
                borderRadius: 18,
                background: "linear-gradient(180deg, #fffaf0, #e7d4b6)",
                boxShadow: "inset 0 2px 1px rgba(255,255,255,0.86), inset 0 -6px 14px rgba(128,89,43,0.1), 0 8px 18px rgba(88,58,27,0.08)",
                border: "1px solid rgba(123,88,45,0.18)",
              }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  display: "grid",
                  placeItems: "center",
                  background: "linear-gradient(145deg, #f7e2b4, #c28a3c)",
                  boxShadow: "inset 0 2px 4px rgba(255,255,255,0.68), inset 0 -4px 10px rgba(80,48,18,0.26)",
                }}>🔐</div>
                <div>
                  <div style={{ color: "#876849", fontSize: "0.78rem", fontWeight: 800 }}>登录密码</div>
                  <div style={{ color: "#2b2118", fontWeight: 800, marginTop: 4 }}>已设置，出于安全原因不显示</div>
                </div>
                <button
                  onClick={() => openEdit("password")}
                  style={{
                    border: "1px solid rgba(128,88,42,0.28)",
                    borderRadius: 12,
                    padding: "8px 12px",
                    color: "#7a4e22",
                    background: "linear-gradient(180deg, #fff7e6, #ddc39a)",
                    boxShadow: "0 6px 12px rgba(96,62,28,0.12), inset 0 2px 1px rgba(255,255,255,0.8)",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  修改
                </button>
              </div>
            </div>

            {editMode && editMode !== "password" && (
              <div style={{
                marginTop: 18,
                padding: 18,
                borderRadius: 18,
                background: "linear-gradient(180deg, #f9edd6, #dfc59b)",
                border: "1px solid rgba(128,88,42,0.22)",
                boxShadow: "inset 0 2px 1px rgba(255,255,255,0.8)",
              }}>
                <div style={{ fontWeight: 900, marginBottom: 12 }}>修改{FIELD_LABELS[editMode]}</div>
                {profileInput(editMode)}
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button className="btn-primary" onClick={saveProfile} disabled={saving}>
                    {saving ? "保存中..." : "保存修改"}
                  </button>
                  <button className="btn-secondary" onClick={() => setEditMode(null)} disabled={saving}>取消</button>
                </div>
              </div>
            )}

            {editMode === "password" && (
              <div style={{
                marginTop: 18,
                padding: 18,
                borderRadius: 18,
                background: "linear-gradient(180deg, #f9edd6, #dfc59b)",
                border: "1px solid rgba(128,88,42,0.22)",
                boxShadow: "inset 0 2px 1px rgba(255,255,255,0.8)",
              }}>
                <div style={{ fontWeight: 900, marginBottom: 12 }}>修改登录密码</div>
                <div style={{ display: "grid", gap: 12 }}>
                  <input
                    type="password"
                    placeholder="当前密码"
                    style={{ ...profileInputStyle }}
                    value={passwordForm.currentPassword}
                    onChange={event => setPasswordForm(prev => ({ ...prev, currentPassword: event.target.value }))}
                  />
                  <input
                    type="password"
                    placeholder="新密码：至少6位，包含字母和数字"
                    style={{ ...profileInputStyle }}
                    value={passwordForm.newPassword}
                    onChange={event => setPasswordForm(prev => ({ ...prev, newPassword: event.target.value }))}
                  />
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button className="btn-primary" onClick={savePassword} disabled={saving}>
                    {saving ? "更新中..." : "保存新密码"}
                  </button>
                  <button className="btn-secondary" onClick={() => setEditMode(null)} disabled={saving}>取消</button>
                </div>
              </div>
            )}

            {(message || passwordMessage) && (
              <div style={{
                marginTop: 14,
                padding: "10px 12px",
                borderRadius: 12,
                background: (message || passwordMessage)?.includes("已") ? "rgba(40,131,76,0.12)" : "rgba(172,61,44,0.12)",
                color: (message || passwordMessage)?.includes("已") ? "#287d4b" : "#a13d2c",
                fontSize: "0.84rem",
                fontWeight: 800,
              }}>
                {message || passwordMessage}
              </div>
            )}
          </section>
        </div>

        <section style={{
          marginTop: 22,
          borderRadius: 26,
          padding: 24,
          background: "linear-gradient(180deg, rgba(238,245,255,0.98), rgba(207,224,248,0.94))",
          border: "1px solid rgba(255,255,255,0.55)",
          boxShadow: "0 22px 44px rgba(0,0,0,0.24), inset 0 2px 1px rgba(255,255,255,0.92), inset 0 -12px 28px rgba(49,89,144,0.12)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 18 }}>
            <div>
              <h2 style={{ fontSize: "1.25rem", marginBottom: 6 }}>AI模型配置</h2>
              <p style={{ color: "#52647c", fontSize: "0.88rem", lineHeight: 1.7 }}>
                每个用户可以配置自己的模型提供商。密钥保存后不会回显，只显示是否已配置和末四位。
              </p>
            </div>
            <span style={{
              borderRadius: 999,
              padding: "7px 12px",
              background: aiSettings?.apiKeyConfigured ? "rgba(40,131,76,0.12)" : "rgba(172,61,44,0.12)",
              color: aiSettings?.apiKeyConfigured ? "#287d4b" : "#a13d2c",
              fontWeight: 900,
              fontSize: "0.78rem",
            }}>
              {aiSettings?.apiKeyConfigured ? `密钥已配置 ****${aiSettings.apiKeyLast4}` : "未配置密钥"}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
            <div>
              <label style={brownLabelStyle}>模型提供商</label>
              <select
                style={lightInputStyle}
                value={aiDraft.provider}
                onChange={event => {
                  const provider = event.target.value as ModelProvider;
                  setAiDraft(prev => ({
                    ...prev,
                    provider,
                    model: aiSettings?.defaultModels?.[provider] || prev.model,
                  }));
                }}
              >
                {(aiSettings?.providerOptions || ["deepseek", "minimax", "glm", "anthropic", "openai-compatible"]).map(provider => (
                  <option key={provider} value={provider}>{provider}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={brownLabelStyle}>模型名称</label>
              <input style={lightInputStyle} value={aiDraft.model} onChange={event => setAiDraft(prev => ({ ...prev, model: event.target.value }))} placeholder="例如 MiniMax-M3 / deepseek-chat" />
            </div>
            <div>
              <label style={brownLabelStyle}>Base URL（可选）</label>
              <input style={lightInputStyle} value={aiDraft.baseUrl} onChange={event => setAiDraft(prev => ({ ...prev, baseUrl: event.target.value }))} placeholder="兼容OpenAI接口时填写" />
            </div>
            <div>
              <label style={brownLabelStyle}>API Key</label>
              <input type="password" style={lightInputStyle} value={aiDraft.apiKey} onChange={event => setAiDraft(prev => ({ ...prev, apiKey: event.target.value }))} placeholder={aiSettings?.apiKeyConfigured ? "留空表示不修改已保存密钥" : "首次配置请填写API Key"} />
            </div>
          </div>
          <label style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, color: "#52647c", fontSize: "0.84rem", fontWeight: 800 }}>
            <input type="checkbox" checked={aiDraft.enabled} onChange={event => setAiDraft(prev => ({ ...prev, enabled: event.target.checked }))} />
            启用我的模型配置
          </label>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16 }}>
            <button className="btn-primary" onClick={saveAiSettings} disabled={aiSaving}>{aiSaving ? "保存中..." : "保存AI模型配置"}</button>
            <button className="btn-secondary" onClick={testAiSettings} disabled={aiTesting}>{aiTesting ? "测试中..." : "测试AI模型"}</button>
            {aiMessage && <span style={{ color: aiMessage.includes("已") ? "#287d4b" : "#a13d2c", fontSize: "0.84rem", fontWeight: 900 }}>{aiMessage}</span>}
          </div>

          {aiTestResult && (
            <div style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 16,
              background: aiTestResult.status === "ok" ? "rgba(40,131,76,0.12)" : "rgba(172,61,44,0.12)",
              border: aiTestResult.status === "ok" ? "1px solid rgba(40,131,76,0.24)" : "1px solid rgba(172,61,44,0.24)",
              color: aiTestResult.status === "ok" ? "#287d4b" : "#a13d2c",
              lineHeight: 1.7,
              fontSize: "0.84rem",
            }}>
              <strong>{aiTestResult.providerLabel} · {aiTestResult.model}</strong>
              <div>{aiTestResult.message}</div>
              <div>接口主机：{aiTestResult.endpointHost || "未识别"}{aiTestResult.latencyMs ? `；耗时 ${aiTestResult.latencyMs}ms` : ""}</div>
              {aiTestResult.failureCategory && <div>失败分类：{aiTestResult.failureCategory}</div>}
              {aiTestResult.nextActions.length > 0 && (
                <ul style={{ margin: "8px 0 0 18px", color: "inherit" }}>
                  {aiTestResult.nextActions.map(action => <li key={action}>{action}</li>)}
                </ul>
              )}
            </div>
          )}
        </section>

        <section style={{
          marginTop: 22,
          borderRadius: 26,
          padding: 24,
          background: "linear-gradient(180deg, rgba(242,255,249,0.98), rgba(205,235,221,0.94))",
          border: "1px solid rgba(255,255,255,0.55)",
          boxShadow: "0 22px 44px rgba(0,0,0,0.24), inset 0 2px 1px rgba(255,255,255,0.92), inset 0 -12px 28px rgba(35,117,85,0.12)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 18 }}>
            <div>
              <h2 style={{ fontSize: "1.25rem", marginBottom: 6 }}>个人飞书接入</h2>
              <p style={{ color: "#4e695d", fontSize: "0.88rem", lineHeight: 1.7 }}>
                注册用户使用自己的飞书应用和多维表格。使用飞书相关功能时，系统优先读取这里的个人配置。
              </p>
            </div>
            <span style={{
              borderRadius: 999,
              padding: "7px 12px",
              background: feishuConnection?.configured ? "rgba(40,131,76,0.12)" : "rgba(172,61,44,0.12)",
              color: feishuConnection?.configured ? "#287d4b" : "#a13d2c",
              fontWeight: 900,
              fontSize: "0.78rem",
            }}>
              {feishuConnection?.configured ? `已配置 App Secret ****${feishuConnection.appSecretLast4}` : "未完成配置"}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
            <div>
              <label style={brownLabelStyle}>App ID</label>
              <input style={lightInputStyle} value={feishuDraft.appId} onChange={event => setFeishuDraft(prev => ({ ...prev, appId: event.target.value }))} placeholder="飞书开放平台应用App ID" />
            </div>
            <div>
              <label style={brownLabelStyle}>App Secret</label>
              <input type="password" style={lightInputStyle} value={feishuDraft.appSecret} onChange={event => setFeishuDraft(prev => ({ ...prev, appSecret: event.target.value }))} placeholder={feishuConnection?.appSecretConfigured ? "留空表示不修改已保存密钥" : "首次配置必须填写"} />
            </div>
            <div>
              <label style={brownLabelStyle}>多维表格 App Token</label>
              <input style={lightInputStyle} value={feishuDraft.baseToken} onChange={event => setFeishuDraft(prev => ({ ...prev, baseToken: event.target.value }))} placeholder="Base App Token" />
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>智能表表ID映射（飞书字段名称请使用中文描述）</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
              {(Object.keys(feishuConnection?.tableLabels || {
                project: "项目台账表ID",
                milestone: "里程碑表ID",
                task: "任务表ID",
                risk: "风险表ID",
                contract: "合同表ID",
                payment: "回款表ID",
                cost: "成本表ID",
                syncLedger: "同步流水表ID",
              }) as FeishuTableKey[]).map(key => (
                <div key={key}>
                  <label style={brownLabelStyle}>{feishuConnection?.tableLabels?.[key] || key}</label>
                  <input
                    style={lightInputStyle}
                    value={feishuDraft.tableMapping[key] || ""}
                    onChange={event => setFeishuDraft(prev => ({
                      ...prev,
                      tableMapping: { ...prev.tableMapping, [key]: event.target.value },
                    }))}
                    placeholder="tbl..."
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 16, padding: 14, borderRadius: 16, background: "rgba(255,255,255,0.52)", border: "1px solid rgba(79,125,104,0.16)", color: "#4e695d", fontSize: "0.82rem", lineHeight: 1.7 }}>
            <div><strong>网页端：</strong>{feishuConnection?.setupHint || "请配置个人飞书应用、多维表格App Token和表ID。"}</div>
            <div style={{ marginTop: 6 }}><strong>本机/Codex直连：</strong>{feishuConnection?.larkCliHint || "如果通过本机脚本直接操作飞书，需要安装并配置 lark-cli。"}</div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16 }}>
            <button className="btn-primary" onClick={saveFeishuConnection} disabled={feishuSaving}>{feishuSaving ? "保存中..." : "保存个人飞书配置"}</button>
            <button className="btn-secondary" onClick={() => testFeishuConnection(false)} disabled={feishuTesting}>{feishuTesting ? "测试中..." : "测试飞书连接"}</button>
            <button className="btn-secondary" onClick={() => testFeishuConnection(true)} disabled={feishuTesting}>确认写入测试</button>
            {feishuMessage && <span style={{ color: feishuMessage.includes("已") ? "#287d4b" : "#a13d2c", fontSize: "0.84rem", fontWeight: 900 }}>{feishuMessage}</span>}
          </div>

          {feishuTestResult && (
            <div style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 16,
              background: feishuTestResult.status === "ok" ? "rgba(40,131,76,0.12)" : feishuTestResult.status === "warning" ? "rgba(180,111,25,0.12)" : "rgba(172,61,44,0.12)",
              border: feishuTestResult.status === "ok" ? "1px solid rgba(40,131,76,0.24)" : feishuTestResult.status === "warning" ? "1px solid rgba(180,111,25,0.24)" : "1px solid rgba(172,61,44,0.24)",
              color: feishuTestResult.status === "ok" ? "#287d4b" : feishuTestResult.status === "warning" ? "#9a5b11" : "#a13d2c",
              lineHeight: 1.7,
              fontSize: "0.84rem",
            }}>
              <strong>{feishuTestResult.summary.message}</strong>
              <div>Base访问：{feishuTestResult.baseAccessible ? "可访问" : "未通过"}；表：{feishuTestResult.configuredTableCount} / {feishuTestResult.tableCount}</div>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {feishuTestResult.steps.map(step => (
                  <div key={step.id} style={{
                    padding: 10,
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.46)",
                    border: "1px solid rgba(79,125,104,0.14)",
                  }}>
                    <strong>{step.label}：{step.status === "ok" ? "通过" : step.status === "warning" ? "需关注" : step.status === "skipped" ? "未执行" : "失败"}</strong>
                    <div>{step.detail}</div>
                    {step.nextAction && <div style={{ marginTop: 4 }}>下一步：{step.nextAction}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const brownLabelStyle = {
  display: "block",
  color: "#6f563e",
  fontSize: "0.78rem",
  fontWeight: 900,
  marginBottom: 7,
} as const;

const lightInputStyle = {
  width: "100%",
  border: "1px solid rgba(76,58,39,0.18)",
  borderRadius: 14,
  padding: "12px 13px",
  background: "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(241,246,252,0.84))",
  color: "#2b2118",
  boxShadow: "inset 0 2px 6px rgba(72,51,28,0.08), 0 1px 0 rgba(255,255,255,0.9)",
  outline: "none",
  fontSize: "0.9rem",
} as const;

const profileInputStyle = {
  width: "100%",
  border: "1px solid rgba(76,58,39,0.28)",
  borderRadius: 14,
  padding: "13px 14px",
  background: "linear-gradient(180deg, #fffdf7, #eee0c8)",
  color: "#2b2118",
  boxShadow: "inset 0 3px 8px rgba(72,51,28,0.14), 0 1px 0 rgba(255,255,255,0.9)",
  outline: "none",
  fontSize: "0.94rem",
} as const;
