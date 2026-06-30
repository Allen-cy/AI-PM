"use client";

import Link from "next/link";
import { useState } from "react";

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", code: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const update = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const submit = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "注册失败");
      setMessage("注册成功，可以登录系统。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "注册失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", padding: 24 }}>
      <div className="card" style={{ width: "100%", maxWidth: 520, padding: 28 }}>
        <Link href="/" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.85rem" }}>← 返回首页</Link>
        <h1 style={{ marginTop: 18, fontSize: "1.6rem" }}>使用注册码注册</h1>
        <p style={{ color: "var(--text2)", fontSize: "0.9rem", lineHeight: 1.6 }}>
          注册码仅可使用一次。密码至少6位，必须同时包含英文字母和数字。
        </p>
        <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
          <input className="input" placeholder="用户名称（必填）" value={form.name} onChange={event => update("name", event.target.value)} />
          <input className="input" placeholder="邮箱" value={form.email} onChange={event => update("email", event.target.value)} />
          <input className="input" placeholder="手机号码" value={form.phone} onChange={event => update("phone", event.target.value)} />
          <input className="input" type="password" placeholder="密码" value={form.password} onChange={event => update("password", event.target.value)} />
          <input className="input" placeholder="注册码" value={form.code} onChange={event => update("code", event.target.value.toUpperCase())} />
          <button className="btn-primary" onClick={submit} disabled={loading || message === "注册成功，可以登录系统。"}>
            {loading ? "注册中..." : "注册"}
          </button>
        </div>
        {message && (
          <div style={{ marginTop: 14, color: message.includes("成功") ? "var(--green)" : "var(--red)", fontSize: "0.84rem" }}>
            {message}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, fontSize: "0.84rem" }}>
          <Link href="/auth/apply" style={{ color: "var(--accent2)" }}>没有注册码，先申请</Link>
          <Link href="/auth/login" style={{ color: "var(--accent2)" }}>去登录</Link>
        </div>
      </div>
    </main>
  );
}
