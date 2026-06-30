"use client";

import Link from "next/link";
import { useState } from "react";

export default function LoginPage() {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "登录失败");
      setMessage("登录成功，正在返回首页。");
      window.location.href = "/";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", padding: 24 }}>
      <div className="card" style={{ width: "100%", maxWidth: 420, padding: 28 }}>
        <Link href="/" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.85rem" }}>← 返回首页</Link>
        <h1 style={{ marginTop: 18, fontSize: "1.6rem" }}>登录 AI PMO</h1>
        <p style={{ color: "var(--text2)", fontSize: "0.9rem", lineHeight: 1.6 }}>
          可使用邮箱或手机号码登录。
        </p>
        <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
          <input className="input" placeholder="邮箱或手机号" value={account} onChange={event => setAccount(event.target.value)} />
          <input className="input" type="password" placeholder="密码" value={password} onChange={event => setPassword(event.target.value)} />
          <button className="btn-primary" onClick={submit} disabled={loading}>
            {loading ? "登录中..." : "登录"}
          </button>
        </div>
        {message && (
          <div style={{ marginTop: 14, color: message.includes("成功") ? "var(--green)" : "var(--red)", fontSize: "0.84rem" }}>
            {message}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, fontSize: "0.84rem" }}>
          <Link href="/auth/apply" style={{ color: "var(--accent2)" }}>申请使用</Link>
          <Link href="/auth/register" style={{ color: "var(--accent2)" }}>已有注册码，去注册</Link>
        </div>
      </div>
    </main>
  );
}
