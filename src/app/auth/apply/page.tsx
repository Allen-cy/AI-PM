"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useState } from "react";
import styles from "../register/register.module.css";

export default function ApplyPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", reason: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const update = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
      setSubmitted(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "申请提交失败");
    } finally {
      setLoading(false);
    }
  };

  const isSuccess = message === "申请已提交，待管理员审核后会通过邮件发送注册码。";

  return (
    <main className={styles.page}>
      <div className={styles.orbOne} aria-hidden="true" />
      <div className={styles.orbTwo} aria-hidden="true" />
      <div className={styles.orbThree} aria-hidden="true" />

      <section className={styles.shell} aria-labelledby="apply-title">
        <div className={styles.introPanel}>
          <Link href="/" className={styles.backLink}>← 返回首页</Link>
          <div className={styles.badge}>AI PMO · 申请入口</div>
          <h1 id="apply-title" className={styles.title}>申请使用 AI PMO</h1>
          <p className={styles.description}>
            当前账号体系采用申请制。提交信息后，管理员会在注册审核入口处理申请，并向审核通过的邮箱发送一次性注册码。
          </p>
          <div className={styles.noticeCard}>
            <span className={styles.noticeIcon} aria-hidden="true">✦</span>
            <div>
              <strong>申请后会发生什么</strong>
              <p>申请提交后按钮会置灰，避免重复提交。审核通过后，你会收到注册码，再前往注册页创建账号。</p>
            </div>
          </div>
        </div>

        <form className={styles.formPanel} onSubmit={submit}>
          <div className={styles.formHeader}>
            <span className={styles.formEyebrow}>Access request</span>
            <h2>提交申请信息</h2>
            <p>请填写真实邮箱和手机号码，便于管理员核对并发送注册码。</p>
          </div>

          <div className={styles.fieldGrid}>
            <label className={styles.field} htmlFor="name">
              <span>姓名</span>
              <input
                id="name"
                className={styles.input}
                placeholder="请输入姓名"
                value={form.name}
                autoComplete="name"
                onChange={event => update("name", event.target.value)}
                disabled={submitted}
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
                disabled={submitted}
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
                disabled={submitted}
              />
            </label>

            <label className={styles.field} htmlFor="reason">
              <span>申请原因</span>
              <textarea
                id="reason"
                className={`${styles.input} ${styles.textarea}`}
                placeholder="申请原因，可选"
                rows={4}
                value={form.reason}
                onChange={event => update("reason", event.target.value)}
                disabled={submitted}
              />
            </label>
          </div>

          <button className={styles.submitButton} type="submit" disabled={loading || submitted}>
            {submitted ? "申请已提交，请等待审核" : loading ? "提交中..." : "提交申请"}
          </button>
        </form>

        {message && (
          <div className={isSuccess ? styles.successMessage : styles.errorMessage} role="status" aria-live="polite">
            {message}
          </div>
        )}

        <div className={styles.footerLinks}>
          <Link href="/auth/register">已有注册码，去注册</Link>
          <Link href="/auth/login">去登录</Link>
        </div>
      </section>
    </main>
  );
}
