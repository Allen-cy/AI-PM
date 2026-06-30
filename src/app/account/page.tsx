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
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
              <div style={{ color: "#6e617a", fontSize: "0.86rem", marginTop: 4 }}>审核注册申请，批准后系统发送一次性注册码。</div>
            </div>
            <Link href="/admin/registration-requests" style={{
              textDecoration: "none",
              borderRadius: 14,
              padding: "10px 16px",
              color: "#fff",
              fontWeight: 800,
              background: "linear-gradient(180deg, #8b5cf6, #5b36a3)",
              boxShadow: "0 10px 20px rgba(91,54,163,0.24), inset 0 2px 2px rgba(255,255,255,0.32)",
            }}>
              去审核注册申请
            </Link>
          </section>
        )}

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
      </div>
    </main>
  );
}

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
