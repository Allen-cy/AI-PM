"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import styles from "./page.module.css";

export default function LoginPage() {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
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

  const inputStyle = {
    width: "100%",
    border: "1px solid rgba(86,58,31,0.34)",
    borderRadius: 14,
    padding: "14px 16px",
    color: "#2b2118",
    background:
      "linear-gradient(180deg, rgba(255,253,246,0.95), rgba(235,220,194,0.88))",
    boxShadow:
      "inset 0 3px 8px rgba(70,47,26,0.18), 0 1px 0 rgba(255,255,255,0.86)",
    outline: "none",
    fontSize: "0.95rem",
  } as const;

  return (
    <main className={styles.page}>
      <section className={styles.deskCard}>
        <div style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.22,
          background:
            "repeating-linear-gradient(90deg, rgba(111,76,42,0.12) 0 1px, transparent 1px 18px), repeating-linear-gradient(0deg, rgba(255,255,255,0.2) 0 1px, transparent 1px 24px)",
        }} />

        <aside className={styles.brandPanel}>
          <Link href="/" style={{ color: "#f7deb0", textDecoration: "none", fontSize: "0.86rem" }}>← 返回首页</Link>
          <div className={styles.brandEmblem}>
            🏛️
          </div>
          <h1 className={styles.brandTitle}>
            AI PMO<br />管理工作台
          </h1>
          <p className={styles.brandDescription}>
            像打开一本熟悉的项目台账：飞书承载业务数据，AI帮助你看清风险、进度和经营状态。
          </p>
          <div className={styles.brandNote}>
            支持邮箱或手机号登录。新用户请先提交申请，由管理员审核后发放一次性注册码。
          </div>
        </aside>

        <div className={styles.formColumn}>
          <div className={styles.formCard}>
            <div style={{
              display: "inline-flex",
              padding: "6px 12px",
              borderRadius: 999,
              background: "rgba(113,76,40,0.1)",
              color: "#815427",
              fontWeight: 700,
              fontSize: "0.78rem",
              boxShadow: "inset 0 1px 3px rgba(79,51,24,0.12)",
            }}>
              安全登录
            </div>
            <h2 style={{ marginTop: 16, marginBottom: 8, fontSize: "1.75rem", color: "#2b2118" }}>欢迎回来</h2>
            <p style={{ color: "#7c6248", lineHeight: 1.7, fontSize: "0.92rem" }}>
              输入你的邮箱或手机号码，进入项目管理驾驶舱。
            </p>

            <form className={styles.formFields} onSubmit={submit}>
              <label style={{ display: "grid", gap: 8, color: "#6d5034", fontWeight: 700, fontSize: "0.84rem" }}>
                邮箱或手机号
                <input
                  style={inputStyle}
                  placeholder="请输入邮箱或手机号"
                  value={account}
                  onChange={event => setAccount(event.target.value)}
                />
              </label>
              <label style={{ display: "grid", gap: 8, color: "#6d5034", fontWeight: 700, fontSize: "0.84rem" }}>
                登录密码
                <input
                  style={inputStyle}
                  type="password"
                  placeholder="请输入密码"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                style={{
                  border: "1px solid rgba(92,55,24,0.42)",
                  borderRadius: 16,
                  padding: "14px 18px",
                  color: "#fff8e8",
                  fontWeight: 800,
                  fontSize: "0.95rem",
                  cursor: loading ? "not-allowed" : "pointer",
                  background:
                    "linear-gradient(180deg, #c78a3a, #8c5526 58%, #5d351b)",
                  boxShadow:
                    "0 12px 24px rgba(103,61,24,0.28), inset 0 2px 2px rgba(255,237,184,0.58), inset 0 -5px 12px rgba(68,34,13,0.42)",
                  textShadow: "0 1px 1px rgba(0,0,0,0.24)",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "正在打开工作台..." : "进入工作台"}
              </button>
            </form>

            {message && (
              <div style={{
                marginTop: 16,
                padding: "10px 12px",
                borderRadius: 12,
                background: message.includes("成功") ? "rgba(40,131,76,0.12)" : "rgba(172,61,44,0.12)",
                color: message.includes("成功") ? "#287d4b" : "#a13d2c",
                fontSize: "0.84rem",
                fontWeight: 700,
              }}>
                {message}
              </div>
            )}

            <div className={styles.secondaryLinks}>
              <Link href="/auth/apply" style={{ color: "#8a5724", fontWeight: 700 }}>申请使用</Link>
              <Link href="/auth/register" style={{ color: "#8a5724", fontWeight: 700 }}>已有注册码，去注册</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
