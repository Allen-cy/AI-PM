"use client";

import Link from "next/link";
import { useState } from "react";

export default function ApplyPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", reason: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const update = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const submit = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "申请提交失败");
      setMessage("申请已提交，待管理员审核后会通过邮件发送注册码。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "申请提交失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", padding: 24 }}>
      <div className="card" style={{ width: "100%", maxWidth: 520, padding: 28 }}>
        <Link href="/" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.85rem" }}>← 返回首页</Link>
        <h1 style={{ marginTop: 18, fontSize: "1.6rem" }}>申请使用 AI PMO</h1>
        <p style={{ color: "var(--text2)", fontSize: "0.9rem", lineHeight: 1.6 }}>
          初期采用申请制。管理员审核通过后，系统会向你的邮箱发送一次性注册码。
        </p>
        <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
          <input className="input" placeholder="姓名" value={form.name} onChange={event => update("name", event.target.value)} />
          <input className="input" placeholder="邮箱" value={form.email} onChange={event => update("email", event.target.value)} />
          <input className="input" placeholder="手机号码" value={form.phone} onChange={event => update("phone", event.target.value)} />
          <textarea className="input" placeholder="申请原因，可选" rows={4} value={form.reason} onChange={event => update("reason", event.target.value)} />
          <button className="btn-primary" onClick={submit} disabled={loading}>
            {loading ? "提交中..." : "提交申请"}
          </button>
        </div>
        {message && (
          <div style={{ marginTop: 14, color: message.includes("已提交") ? "var(--green)" : "var(--red)", fontSize: "0.84rem" }}>
            {message}
          </div>
        )}
        <div style={{ marginTop: 18, fontSize: "0.84rem" }}>
          <Link href="/auth/register" style={{ color: "var(--accent2)" }}>已有注册码，去注册</Link>
        </div>
      </div>
    </main>
  );
}
