"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useState } from "react";
import styles from "./register.module.css";

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", code: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const update = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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

  const isSuccess = message === "注册成功，可以登录系统。";

  return (
    <main className={styles.page}>
      <div className={styles.orbOne} aria-hidden="true" />
      <div className={styles.orbTwo} aria-hidden="true" />
      <div className={styles.orbThree} aria-hidden="true" />

      <section className={styles.shell} aria-labelledby="register-title">
        <div className={styles.introPanel}>
          <Link href="/" className={styles.backLink}>← 返回首页</Link>
          <div className={styles.badge}>AI PMO · 邀请注册</div>
          <h1 id="register-title" className={styles.title}>使用注册码注册</h1>
          <p className={styles.description}>
            管理员审核后会发放一次性注册码。完成注册后，你可以进入项目管理驾驶舱、知识库与业务数据看板。
          </p>
          <div className={styles.noticeCard}>
            <span className={styles.noticeIcon} aria-hidden="true">✦</span>
            <div>
              <strong>注册规则</strong>
              <p>注册码仅可使用一次。密码至少 6 位，必须同时包含英文字母和数字。</p>
            </div>
          </div>
        </div>

        <form className={styles.formPanel} onSubmit={submit}>
          <div className={styles.formHeader}>
            <span className={styles.formEyebrow}>Account setup</span>
            <h2>创建你的账号</h2>
            <p>请确保邮箱和手机号码与申请信息一致。</p>
          </div>

          <div className={styles.fieldGrid}>
            <label className={styles.field} htmlFor="name">
              <span>用户名称</span>
              <input
                id="name"
                className={styles.input}
                placeholder="请输入用户名称"
                value={form.name}
                autoComplete="name"
                onChange={event => update("name", event.target.value)}
              />
            </label>

            <label className={styles.field} htmlFor="email">
              <span>邮箱</span>
              <input
                id="email"
                className={styles.input}
                type="email"
                placeholder="name@example.com"
                value={form.email}
                autoComplete="email"
                onChange={event => update("email", event.target.value)}
              />
            </label>

            <label className={styles.field} htmlFor="phone">
              <span>手机号码</span>
              <input
                id="phone"
                className={styles.input}
                type="tel"
                placeholder="请输入手机号码"
                value={form.phone}
                autoComplete="tel"
                onChange={event => update("phone", event.target.value)}
              />
            </label>

            <label className={styles.field} htmlFor="password">
              <span>密码</span>
              <input
                id="password"
                className={styles.input}
                type="password"
                placeholder="至少6位，包含字母和数字"
                value={form.password}
                autoComplete="new-password"
                onChange={event => update("password", event.target.value)}
              />
            </label>

            <label className={styles.field} htmlFor="code">
              <span>注册码</span>
              <input
                id="code"
                className={`${styles.input} ${styles.codeInput}`}
                placeholder="请输入一次性注册码"
                value={form.code}
                autoComplete="one-time-code"
                onChange={event => update("code", event.target.value.toUpperCase())}
              />
            </label>
          </div>

          <button className={styles.submitButton} type="submit" disabled={loading || isSuccess}>
            {loading ? "注册中..." : isSuccess ? "注册已完成" : "创建账号"}
          </button>
        </form>

        {message && (
          <div className={isSuccess ? styles.successMessage : styles.errorMessage} role="status" aria-live="polite">
            {message}
          </div>
        )}

        <div className={styles.footerLinks}>
          <Link href="/auth/apply">没有注册码，先申请</Link>
          <Link href="/auth/login">去登录</Link>
        </div>
      </section>
    </main>
  );
}
