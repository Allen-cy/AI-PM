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

  const pageStyle = {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: 24,
    background:
      "radial-gradient(circle at 18% 12%, rgba(255,236,190,0.34), transparent 28%), radial-gradient(circle at 86% 80%, rgba(91,58,33,0.36), transparent 32%), linear-gradient(135deg, #2a1b12 0%, #6f4a2d 48%, #2e1b12 100%)",
    color: "#2b2118",
  } as const;

  const deskCard = {
    width: "100%",
    maxWidth: 980,
    minHeight: 560,
    display: "grid",
    gridTemplateColumns: "minmax(0, 0.95fr) minmax(380px, 1.05fr)",
    borderRadius: 30,
    padding: 18,
    background:
      "linear-gradient(145deg, rgba(255,244,221,0.96), rgba(223,190,139,0.94))",
    boxShadow:
      "0 34px 80px rgba(0,0,0,0.45), inset 0 2px 1px rgba(255,255,255,0.9), inset 0 -18px 36px rgba(104,67,34,0.18)",
    border: "1px solid rgba(255,255,255,0.58)",
    position: "relative",
    overflow: "hidden",
  } as const;

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
    <main style={pageStyle}>
      <section style={deskCard}>
        <div style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.22,
          background:
            "repeating-linear-gradient(90deg, rgba(111,76,42,0.12) 0 1px, transparent 1px 18px), repeating-linear-gradient(0deg, rgba(255,255,255,0.2) 0 1px, transparent 1px 24px)",
        }} />

        <aside style={{
          position: "relative",
          padding: "34px 30px",
          borderRadius: 24,
          color: "#fff4df",
          background:
            "linear-gradient(150deg, rgba(64,35,20,0.96), rgba(126,79,39,0.92)), radial-gradient(circle at 35% 25%, rgba(255,215,137,0.28), transparent 36%)",
          boxShadow:
            "inset 0 1px 1px rgba(255,255,255,0.24), inset 0 -18px 36px rgba(0,0,0,0.18), 8px 0 24px rgba(58,35,18,0.18)",
          overflow: "hidden",
        }}>
          <Link href="/" style={{ color: "#f7deb0", textDecoration: "none", fontSize: "0.86rem" }}>← 返回首页</Link>
          <div style={{
            width: 112,
            height: 112,
            borderRadius: "50%",
            marginTop: 54,
            display: "grid",
            placeItems: "center",
            fontSize: "3rem",
            background:
              "radial-gradient(circle at 30% 24%, #fff6dc, #d8a74d 42%, #6b421f 78%)",
            boxShadow:
              "0 20px 38px rgba(0,0,0,0.28), inset 0 3px 8px rgba(255,255,255,0.85), inset 0 -8px 18px rgba(83,48,18,0.45)",
          }}>
            🏛️
          </div>
          <h1 style={{ marginTop: 28, fontSize: "2rem", lineHeight: 1.2 }}>
            AI PMO<br />管理工作台
          </h1>
          <p style={{ marginTop: 16, color: "rgba(255,244,223,0.78)", lineHeight: 1.8, fontSize: "0.95rem" }}>
            像打开一本熟悉的项目台账：飞书承载业务数据，AI帮助你看清风险、进度和经营状态。
          </p>
          <div style={{
            marginTop: 34,
            padding: "14px 16px",
            borderRadius: 18,
            background: "rgba(255,244,223,0.12)",
            border: "1px solid rgba(255,244,223,0.18)",
            boxShadow: "inset 0 2px 6px rgba(0,0,0,0.16)",
            color: "rgba(255,244,223,0.82)",
            fontSize: "0.84rem",
            lineHeight: 1.7,
          }}>
            支持邮箱或手机号登录。新用户请先提交申请，由管理员审核后发放一次性注册码。
          </div>
        </aside>

        <div style={{
          position: "relative",
          padding: "42px 44px",
          display: "flex",
          alignItems: "center",
        }}>
          <div style={{
            width: "100%",
            borderRadius: 24,
            padding: "34px 32px",
            background:
              "linear-gradient(180deg, rgba(255,252,244,0.98), rgba(238,223,196,0.94))",
            border: "1px solid rgba(124,86,43,0.22)",
            boxShadow:
              "0 18px 34px rgba(95,62,29,0.18), inset 0 2px 1px rgba(255,255,255,0.95), inset 0 -10px 22px rgba(146,104,55,0.12)",
          }}>
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

            <div style={{ display: "grid", gap: 16, marginTop: 28 }}>
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
                onClick={submit}
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
            </div>

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

            <div style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              marginTop: 22,
              fontSize: "0.86rem",
            }}>
              <Link href="/auth/apply" style={{ color: "#8a5724", fontWeight: 700 }}>申请使用</Link>
              <Link href="/auth/register" style={{ color: "#8a5724", fontWeight: 700 }}>已有注册码，去注册</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
