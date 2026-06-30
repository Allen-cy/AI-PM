"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface RegistrationRequest {
  id: string;
  email: string;
  phone: string;
  name: string;
  reason: string | null;
  status: string;
  created_at: string;
  last_delivery_status: string | null;
}

export default function RegistrationRequestsPage() {
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const loadRequests = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/registration-requests");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "读取申请失败");
      setRequests(data.requests || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取申请失败");
    } finally {
      setLoading(false);
    }
  };

  const approve = async (id: string) => {
    setApprovingId(id);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/registration-requests/${id}/approve`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "审批失败");
      setMessage(data.emailSent ? "已审批，并已发送注册码邮件。" : "已审批，但邮件服务未配置，请先配置 SMTP 后重新发码。");
      await loadRequests();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "审批失败");
    } finally {
      setApprovingId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function loadInitialRequests() {
      try {
        const response = await fetch("/api/admin/registration-requests");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "读取申请失败");
        if (!cancelled) setRequests(data.requests || []);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "读取申请失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadInitialRequests();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <Link href="/" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.85rem" }}>← 返回首页</Link>
            <h1 style={{ marginTop: 12, fontSize: "1.7rem" }}>注册申请审核</h1>
            <p style={{ color: "var(--text2)", fontSize: "0.9rem" }}>审批后系统生成一次性注册码，并通过邮件发送给申请人。</p>
          </div>
          <button className="btn-secondary" onClick={loadRequests} disabled={loading}>
            刷新
          </button>
        </div>

        {message && (
          <div style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 8,
            background: message.includes("失败") || message.includes("FORBIDDEN") ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
            color: message.includes("失败") || message.includes("FORBIDDEN") ? "var(--red)" : "var(--green)",
          }}>
            {message}
          </div>
        )}

        <div className="card" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["申请人", "邮箱", "手机", "申请原因", "状态", "邮件", "操作"].map(header => (
                  <th key={header} style={{ textAlign: "left", padding: "10px 12px", color: "var(--text2)" }}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map(item => (
                <tr key={item.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px" }}>{item.name}</td>
                  <td style={{ padding: "12px" }}>{item.email}</td>
                  <td style={{ padding: "12px" }}>{item.phone}</td>
                  <td style={{ padding: "12px", color: "var(--text2)" }}>{item.reason || "-"}</td>
                  <td style={{ padding: "12px" }}>
                    <span className="tag">{item.status}</span>
                  </td>
                  <td style={{ padding: "12px", color: "var(--text2)" }}>{item.last_delivery_status || "-"}</td>
                  <td style={{ padding: "12px" }}>
                    <button className="btn-primary" onClick={() => approve(item.id)} disabled={approvingId === item.id || item.status === "registered"}>
                      {approvingId === item.id ? "处理中..." : "同意并发码"}
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && requests.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 24, color: "var(--text2)", textAlign: "center" }}>暂无申请</td>
                </tr>
              )}
            </tbody>
          </table>
          {loading && <div style={{ padding: 24, color: "var(--text2)" }}>加载中...</div>}
        </div>
      </div>
    </main>
  );
}
