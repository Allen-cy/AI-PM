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

export default function AccountPage() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState({ name: "", email: "", phone: "" });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

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
        if (!cancelled) {
          setUser(data.user);
          setProfile({
            name: data.user.name || "",
            email: data.user.email || "",
            phone: data.user.phone || "",
          });
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

  const saveProfile = async () => {
    setSavingProfile(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败");
      setUser(data.user);
      setProfile({
        name: data.user.name || "",
        email: data.user.email || "",
        phone: data.user.phone || "",
      });
      setMessage("用户资料已更新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async () => {
    setSavingPassword(true);
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
      setPasswordMessage("密码已更新。");
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : "密码修改失败");
    } finally {
      setSavingPassword(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/auth/login";
  };

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", color: "var(--text2)" }}>
        正在读取用户信息...
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", padding: 24 }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <Link href="/" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.85rem" }}>← 返回首页</Link>
            <h1 style={{ marginTop: 12, fontSize: "1.7rem" }}>用户中心</h1>
            <p style={{ color: "var(--text2)", fontSize: "0.9rem" }}>
              修改用户名称、邮箱、手机号和密码。
            </p>
          </div>
          <button className="btn-secondary" onClick={logout}>退出登录</button>
        </div>

        {user?.role === "admin" && (
          <div style={{
            marginBottom: 18,
            padding: "14px 16px",
            borderRadius: 10,
            background: "rgba(139,92,246,0.1)",
            border: "1px solid rgba(139,92,246,0.25)",
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "center",
          }}>
            <div>
              <div style={{ fontWeight: 700, color: "var(--purple)" }}>管理员入口</div>
              <div style={{ color: "var(--text2)", fontSize: "0.84rem", marginTop: 4 }}>审核用户注册申请，并发送一次性注册码。</div>
            </div>
            <Link href="/admin/registration-requests" className="btn-primary" style={{ textDecoration: "none" }}>
              去审核注册申请
            </Link>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 18 }}>
          <section className="card" style={{ padding: 24 }}>
            <h2 style={{ fontSize: "1.05rem", marginBottom: 16 }}>基础资料</h2>
            <div style={{ display: "grid", gap: 12 }}>
              <input className="input" placeholder="用户名称" value={profile.name} onChange={event => setProfile(prev => ({ ...prev, name: event.target.value }))} />
              <input className="input" placeholder="邮箱" value={profile.email} onChange={event => setProfile(prev => ({ ...prev, email: event.target.value }))} />
              <input className="input" placeholder="手机号码" value={profile.phone} onChange={event => setProfile(prev => ({ ...prev, phone: event.target.value }))} />
              <button className="btn-primary" onClick={saveProfile} disabled={savingProfile}>
                {savingProfile ? "保存中..." : "保存资料"}
              </button>
            </div>
            {message && (
              <div style={{ marginTop: 12, color: message.includes("已更新") ? "var(--green)" : "var(--red)", fontSize: "0.84rem" }}>
                {message}
              </div>
            )}
          </section>

          <section className="card" style={{ padding: 24 }}>
            <h2 style={{ fontSize: "1.05rem", marginBottom: 16 }}>修改密码</h2>
            <div style={{ display: "grid", gap: 12 }}>
              <input className="input" type="password" placeholder="当前密码" value={passwordForm.currentPassword} onChange={event => setPasswordForm(prev => ({ ...prev, currentPassword: event.target.value }))} />
              <input className="input" type="password" placeholder="新密码：至少6位，包含字母和数字" value={passwordForm.newPassword} onChange={event => setPasswordForm(prev => ({ ...prev, newPassword: event.target.value }))} />
              <button className="btn-primary" onClick={savePassword} disabled={savingPassword}>
                {savingPassword ? "更新中..." : "修改密码"}
              </button>
            </div>
            {passwordMessage && (
              <div style={{ marginTop: 12, color: passwordMessage.includes("已更新") ? "var(--green)" : "var(--red)", fontSize: "0.84rem" }}>
                {passwordMessage}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
