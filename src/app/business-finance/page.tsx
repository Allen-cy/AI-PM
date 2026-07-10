"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  businessContextSearchParams,
  readStoredBusinessContext,
  readStoredDataClass,
  writeStoredBusinessContext,
  type StoredBusinessContext,
} from "@/features/operating-model/client-context";

type Baseline = {
  id: string;
  project_id: string;
  benefit_name: string;
  metric_key: string;
  target_value: number;
  forecast_value: number;
  actual_value: number;
  realization_due_date: string;
  g6_review_due_date: string;
  exit_criteria: string;
  g6_reviewed_at: string | null;
  g6_outcome: string | null;
  benefit_owner_user_id: string;
  status: string;
};
type Decision = {
  benefit_baseline_id?: string;
  benefit_review_id?: string;
  reviewer_business_role: string;
  decision: string;
  comment: string;
  decided_at: string;
};
type Review = {
  id: string;
  benefit_baseline_id: string;
  review_gate: string;
  snapshot_at: string;
  forecast_value: number;
  actual_value: number;
  variance: number;
  conclusion: string;
  review_outcome: string;
  action_required: boolean;
  action_item_id: string | null;
  status: string;
  evidence: Array<Record<string, unknown>>;
};
type ActionItem = {
  id: string;
  source_type?: string;
  source_id: string;
  title: string;
  owner_user_id: string;
  owner: string;
  due_date: string;
  status: string;
  priority: string;
  acceptance_criteria: string;
  evidence: Array<Record<string, unknown>>;
  close_evidence: string | null;
};
type Handover = {
  id: string;
  exit_review_id: string;
  benefit_baseline_id: string;
  from_owner_user_id: string;
  to_owner_user_id: string;
  due_date: string;
  acceptance_criteria: string;
  evidence: Array<Record<string, unknown>>;
  status: string;
  action_item_id: string;
};
type Scenario = {
  id: string;
  name: string;
  scenario_type: string;
  status: string;
  assumptions: Record<string, unknown>;
  results: Record<string, number>;
};
type ImpactPackage = {
  id: string;
  scenario_id: string;
  status: string;
  impact_summary: string;
  proposed_changes: Record<string, unknown>;
  action_item_id: string;
};
type Assignee = { user_id: string; name: string; business_role: string };
type Payload = {
  context: { actorUserId: string; businessRole: string; subjectScope: string };
  view: {
    summary: Record<string, number>;
    projects: Array<{
      id: string;
      name: string;
      projectLevel?: string | null;
      contractAmount: number;
      actualCost: number;
      forecastMargin: number;
      collected: number;
      receivable: number;
      cashNext90Days: number;
      benefitGap: number;
    }>;
  };
  benefits: Baseline[];
  baselineDecisions: Decision[];
  reviews: Review[];
  reviewDecisions: Decision[];
  benefitActions: ActionItem[];
  handovers: Handover[];
  handoverActions: ActionItem[];
  scenarios: Scenario[];
  impactPackages: ImpactPackage[];
  scenarioActions: ActionItem[];
  assigneeOptions: Assignee[];
  benefitCoverage: {
    requiredProjects: number;
    coveredProjects: number;
    coverageRate: number;
    gaps: Array<{
      projectId: string;
      projectName: string;
      projectLevel: string;
      missing: string[];
    }>;
  };
  scenarioReadiness: {
    ready: boolean;
    projectCount: number;
    gaps: Array<{ projectId: string; projectName: string; missing: string[] }>;
  };
};

const ALLOWED = new Set([
  "operations",
  "pmo",
  "ceo",
  "finance",
  "business_owner",
  "sponsor",
]);
const REVIEWERS = new Set(["pmo", "finance", "business_owner"]);
const SCENARIO_REVIEWERS = new Set(["pmo", "finance", "ceo"]);
const money = (value: number) =>
  `¥${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
const statusLabel: Record<string, string> = {
  draft: "草稿",
  approved: "已批准",
  tracking: "跟踪中",
  at_risk: "有风险",
  realized: "已实现",
  not_realized: "未实现",
  exit_pending: "待退出移交",
  retired: "已退出",
  submitted: "待三方复核",
  rejected: "已驳回",
  closed: "已闭环",
  assigned: "待接受",
  proposed: "待接收",
  accepted: "已接受",
  in_progress: "执行中",
  evidence_submitted: "待验收",
  completed: "已完成",
  cancelled: "已取消",
  pending_application: "待应用",
  under_review: "评审中",
  approved_for_application: "待验收应用证据",
  applied: "已按证据确认",
};
const roleLabel: Record<string, string> = {
  business_owner: "业务Owner",
  finance: "财务",
  pmo: "PMO",
  operations: "运营",
  ceo: "CEO",
};
const today = () => new Date().toISOString().slice(0, 10);

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="section-title" style={{ marginBottom: 10 }}>
      {children}
    </div>
  );
}

export default function BusinessFinancePage() {
  const [context, setContext] = useState<StoredBusinessContext | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [benefit, setBenefit] = useState({
    project_id: "",
    benefit_name: "",
    benefit_type: "strategic",
    metric_key: "",
    baseline_version: "v1",
    baseline_value: "0",
    target_value: "",
    forecast_value: "",
    actual_value: "0",
    realization_due_date: "",
    g6_review_due_date: "",
    exit_criteria: "",
    benefit_owner_user_id: "",
  });
  const [review, setReview] = useState({
    baseline_id: "",
    review_gate: "monthly",
    snapshot_at: today(),
    forecast_value: "",
    actual_value: "",
    conclusion: "",
    evidence_note: "",
    action_owner_user_id: "",
    action_due_date: "",
    action_acceptance_criteria: "",
    handover_owner_user_id: "",
    handover_due_date: "",
    handover_acceptance_criteria: "",
  });
  const [scenario, setScenario] = useState({
    name: "",
    scenario_type: "combined",
    delay_days: "0",
    added_monthly_cost: "0",
    scope_revenue_change: "0",
    paused: false,
  });
  const [scenarioConfirm, setScenarioConfirm] = useState({
    impact_owner_user_id: "",
    impact_due_date: "",
    acceptance_criteria: "",
    impact_summary: "",
  });
  const [comments, setComments] = useState<Record<string, string>>({});
  const [actionEvidence, setActionEvidence] = useState<Record<string, string>>(
    {},
  );

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/context/current", {
        cache: "no-store",
      });
      const body = (await response.json()) as {
        available_contexts?: Array<{
          id: string;
          businessRole: string;
          orgId: string;
          subjectScope: string;
          subjectId: string;
          status: string;
        }>;
      };
      const stored = readStoredBusinessContext();
      const selected =
        body.available_contexts?.find(
          (item) =>
            item.id === stored?.assignmentId &&
            item.status === "active" &&
            ALLOWED.has(item.businessRole),
        ) ??
        body.available_contexts?.find(
          (item) => item.status === "active" && ALLOWED.has(item.businessRole),
        );
      if (!selected)
        throw new Error("当前账号没有运营、财务、PMO、CEO或业务负责人角色。");
      const active = {
        assignmentId: selected.id,
        businessRole: selected.businessRole,
        orgId: selected.orgId,
        subjectScope: selected.subjectScope,
        subjectId: selected.subjectId,
      };
      writeStoredBusinessContext(active);
      setContext(active);
      const query = businessContextSearchParams(active, readStoredDataClass());
      const result = await fetch(`/api/business-finance?${query.toString()}`, {
        cache: "no-store",
      });
      const payload = await result.json();
      if (!result.ok)
        throw new Error(payload.detail || payload.error || "业财数据加载失败");
      const next = payload as Payload;
      setData(next);
      const defaultOwner = next.assigneeOptions[0]?.user_id || "";
      setBenefit((previous) => ({
        ...previous,
        project_id: previous.project_id || next.view.projects[0]?.id || "",
        benefit_owner_user_id: previous.benefit_owner_user_id || defaultOwner,
      }));
      setReview((previous) => ({
        ...previous,
        baseline_id:
          previous.baseline_id ||
          next.benefits.find((item) =>
            [
              "tracking",
              "at_risk",
              "approved",
              "realized",
              "not_realized",
            ].includes(item.status),
          )?.id ||
          "",
        action_owner_user_id: previous.action_owner_user_id || defaultOwner,
        handover_owner_user_id: previous.handover_owner_user_id || defaultOwner,
      }));
      setScenarioConfirm((previous) => ({
        ...previous,
        impact_owner_user_id: previous.impact_owner_user_id || defaultOwner,
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "业财数据加载失败");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save(operation: string, payload: Record<string, unknown>) {
    if (!context) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const query = businessContextSearchParams(context, readStoredDataClass());
      const response = await fetch(
        `/api/business-finance?${query.toString()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operation, ...payload }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.detail || body.error || "保存失败");
      setMessage("操作已保存，状态、责任和审计链已同步更新。");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const selectedBaseline = useMemo(
    () => data?.benefits.find((item) => item.id === review.baseline_id),
    [data?.benefits, review.baseline_id],
  );
  const reviewMeasuredValue =
    review.review_gate === "G6" || review.review_gate === "exit"
      ? Number(review.actual_value)
      : Number(review.forecast_value);
  const correctiveActionRequired = Boolean(
    selectedBaseline &&
    Number.isFinite(reviewMeasuredValue) &&
    reviewMeasuredValue < Number(selectedBaseline.target_value),
  );
  const exitHandoverRequired = review.review_gate === "exit";
  const exitGateBlocked =
    exitHandoverRequired && !selectedBaseline?.g6_reviewed_at;
  const labels: Record<string, string> = {
    contractAmount: "合同额",
    actualCost: "实际成本",
    forecastMargin: "预测毛利",
    collected: "已回款",
    receivable: "应收",
    cashNext90Days: "未来90天现金",
    benefitTarget: "收益目标",
    benefitForecast: "收益预测",
  };

  const assigneeSelect = (value: string, change: (value: string) => void) => (
    <select
      className="input"
      value={value}
      onChange={(event) => change(event.target.value)}
    >
      <option value="">选择责任人</option>
      {data?.assigneeOptions.map((item) => (
        <option
          key={`${item.user_id}-${item.business_role}`}
          value={item.user_id}
        >
          {item.name} · {roleLabel[item.business_role] || item.business_role}
        </option>
      ))}
    </select>
  );

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header
        style={{
          padding: "15px 28px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          alignItems: "center",
        }}
      >
        <Link
          href="/"
          style={{ color: "var(--text2)", textDecoration: "none" }}
        >
          ← 返回首页
        </Link>
        <strong style={{ color: "var(--green)" }}>
          业财一体化与收益实现中心
        </strong>
        <span className="tag tag-green">合同→成本→验收→回款→收益</span>
      </header>
      <div style={{ maxWidth: 1480, margin: "0 auto", padding: 28 }}>
        {(error || message) && (
          <section
            className="card"
            style={{
              marginBottom: 16,
              color: error ? "var(--red)" : "var(--green)",
            }}
          >
            {error || message}
          </section>
        )}
        {data && (
          <>
            <section
              className="card"
              style={{
                marginBottom: 16,
                borderLeft: "4px solid var(--accent2)",
              }}
            >
              <strong>收益闭环规则</strong>
              <p
                style={{ color: "var(--text2)", marginTop: 6, lineHeight: 1.7 }}
              >
                收益基线须由业务Owner、财务、PMO三方人工复核；月度复核、季度复核、G6价值复核和退出复核均须录入预测、实际、结论与证据。未达标时必须责任到人、到期日和验收标准，系统才接受提交。
              </p>
            </section>
            <section className="card" style={{ marginBottom: 16 }}>
              <CardTitle>🧭 S/A项目收益覆盖</CardTitle>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <strong style={{ fontSize: "1.35rem" }}>
                  {data.benefitCoverage.coverageRate}%
                </strong>
                <span className="tag tag-blue">
                  已覆盖 {data.benefitCoverage.coveredProjects} / 应覆盖{" "}
                  {data.benefitCoverage.requiredProjects}
                </span>
                <span style={{ color: "var(--text2)", fontSize: ".82rem" }}>
                  覆盖要求：收益基线、收益Owner、G6复核日、退出标准全部齐备。
                </span>
              </div>
              {data.benefitCoverage.gaps.length > 0 && (
                <div style={{ marginTop: 10, display: "grid", gap: 7 }}>
                  {data.benefitCoverage.gaps.map((gap) => (
                    <div
                      key={gap.projectId}
                      style={{
                        padding: 9,
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                      }}
                    >
                      <strong>
                        {gap.projectName} · {gap.projectLevel}级
                      </strong>
                      <span style={{ marginLeft: 8, color: "var(--red)" }}>
                        缺少：{gap.missing.join("、")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))",
                gap: 11,
              }}
            >
              {Object.entries(data.view.summary).map(([key, value]) => (
                <div className="stat-card" key={key}>
                  <div className="stat-num" style={{ fontSize: "1.25rem" }}>
                    {money(value)}
                  </div>
                  <div className="stat-label">{labels[key] || key}</div>
                </div>
              ))}
            </section>
            <section
              className="card"
              style={{ marginTop: 16, overflow: "auto" }}
            >
              <CardTitle>📈 项目业财与收益明细</CardTitle>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: ".82rem",
                }}
              >
                <thead>
                  <tr>
                    {[
                      "项目",
                      "合同额",
                      "成本",
                      "预测毛利",
                      "已回款",
                      "应收",
                      "90天现金",
                      "收益缺口",
                    ].map((item) => (
                      <th
                        key={item}
                        style={{
                          textAlign: "left",
                          padding: 9,
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        {item}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.view.projects.map((project) => (
                    <tr key={project.id}>
                      <td
                        style={{
                          padding: 9,
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        <Link
                          href={`/projects/${project.id}?role=${context?.businessRole}&data_class=${readStoredDataClass()}`}
                          style={{ color: "var(--accent2)" }}
                        >
                          {project.name}
                        </Link>
                      </td>
                      {[
                        project.contractAmount,
                        project.actualCost,
                        project.forecastMargin,
                        project.collected,
                        project.receivable,
                        project.cashNext90Days,
                        project.benefitGap,
                      ].map((value, index) => (
                        <td
                          key={index}
                          style={{
                            padding: 9,
                            borderBottom: "1px solid var(--border)",
                          }}
                        >
                          {money(value)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(380px,1fr))",
                gap: 16,
                marginTop: 16,
              }}
            >
              <div className="card">
                <CardTitle>🎯 登记收益基线</CardTitle>
                <select
                  className="input"
                  value={benefit.project_id}
                  onChange={(event) =>
                    setBenefit({ ...benefit, project_id: event.target.value })
                  }
                >
                  {data.view.projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                      {project.projectLevel
                        ? ` · ${project.projectLevel}级`
                        : ""}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  style={{ marginTop: 8 }}
                  placeholder="收益名称"
                  value={benefit.benefit_name}
                  onChange={(event) =>
                    setBenefit({ ...benefit, benefit_name: event.target.value })
                  }
                />
                <input
                  className="input"
                  style={{ marginTop: 8 }}
                  placeholder="指标键（如 annual_saving）"
                  value={benefit.metric_key}
                  onChange={(event) =>
                    setBenefit({ ...benefit, metric_key: event.target.value })
                  }
                />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  <input
                    className="input"
                    type="number"
                    placeholder="收益目标"
                    value={benefit.target_value}
                    onChange={(event) =>
                      setBenefit({
                        ...benefit,
                        target_value: event.target.value,
                      })
                    }
                  />
                  <input
                    className="input"
                    type="number"
                    placeholder="收益预测"
                    value={benefit.forecast_value}
                    onChange={(event) =>
                      setBenefit({
                        ...benefit,
                        forecast_value: event.target.value,
                      })
                    }
                  />
                  <label>
                    <span className="label">收益实现截止日</span>
                    <input
                      className="input"
                      type="date"
                      value={benefit.realization_due_date}
                      onChange={(event) =>
                        setBenefit({
                          ...benefit,
                          realization_due_date: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span className="label">G6价值复核日</span>
                    <input
                      className="input"
                      type="date"
                      value={benefit.g6_review_due_date}
                      onChange={(event) =>
                        setBenefit({
                          ...benefit,
                          g6_review_due_date: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <textarea
                  className="input"
                  style={{ marginTop: 8, minHeight: 62 }}
                  placeholder="退出标准：明确什么条件下暂停、终止或转向（必填）"
                  value={benefit.exit_criteria}
                  onChange={(event) =>
                    setBenefit({
                      ...benefit,
                      exit_criteria: event.target.value,
                    })
                  }
                />
                <div style={{ marginTop: 8 }}>
                  {assigneeSelect(benefit.benefit_owner_user_id, (value) =>
                    setBenefit({ ...benefit, benefit_owner_user_id: value }),
                  )}
                </div>
                <button
                  className="btn-primary"
                  style={{ marginTop: 10 }}
                  disabled={
                    saving ||
                    !benefit.project_id ||
                    !benefit.benefit_name ||
                    !benefit.metric_key ||
                    !benefit.target_value ||
                    !benefit.realization_due_date ||
                    !benefit.g6_review_due_date ||
                    !benefit.exit_criteria ||
                    !benefit.benefit_owner_user_id
                  }
                  onClick={() => void save("create_benefit_baseline", benefit)}
                >
                  登记草稿
                </button>
              </div>
              <div className="card">
                <CardTitle>
                  🧾 月度复核 / 季度复核 / G6价值复核 / 退出复核
                </CardTitle>
                <select
                  className="input"
                  value={review.baseline_id}
                  onChange={(event) => {
                    const baseline = data.benefits.find(
                      (item) => item.id === event.target.value,
                    );
                    setReview({
                      ...review,
                      baseline_id: event.target.value,
                      forecast_value: String(baseline?.forecast_value ?? ""),
                      actual_value: String(baseline?.actual_value ?? ""),
                    });
                  }}
                >
                  <option value="">选择收益基线</option>
                  {data.benefits
                    .filter((item) =>
                      [
                        "approved",
                        "tracking",
                        "at_risk",
                        "realized",
                        "not_realized",
                      ].includes(item.status),
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.benefit_name} ·{" "}
                        {statusLabel[item.status] || item.status}
                      </option>
                    ))}
                </select>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2,1fr)",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  <select
                    className="input"
                    value={review.review_gate}
                    onChange={(event) =>
                      setReview({ ...review, review_gate: event.target.value })
                    }
                  >
                    <option value="monthly">月度复核</option>
                    <option value="quarterly">季度复核</option>
                    <option value="G6">G6价值复核</option>
                    <option value="exit">退出复核</option>
                  </select>
                  <input
                    className="input"
                    type="date"
                    value={review.snapshot_at}
                    onChange={(event) =>
                      setReview({ ...review, snapshot_at: event.target.value })
                    }
                  />
                  <input
                    className="input"
                    type="number"
                    placeholder="最新预测值"
                    value={review.forecast_value}
                    onChange={(event) =>
                      setReview({
                        ...review,
                        forecast_value: event.target.value,
                      })
                    }
                  />
                  <input
                    className="input"
                    type="number"
                    placeholder="最新实际值"
                    value={review.actual_value}
                    onChange={(event) =>
                      setReview({ ...review, actual_value: event.target.value })
                    }
                  />
                </div>
                <textarea
                  className="input"
                  style={{ marginTop: 8, minHeight: 72 }}
                  placeholder="人工结论：说明变化、判断和待确认事项"
                  value={review.conclusion}
                  onChange={(event) =>
                    setReview({ ...review, conclusion: event.target.value })
                  }
                />
                <textarea
                  className="input"
                  style={{ marginTop: 8, minHeight: 60 }}
                  placeholder="证据说明或证据链接（必填）"
                  value={review.evidence_note}
                  onChange={(event) =>
                    setReview({ ...review, evidence_note: event.target.value })
                  }
                />
                {correctiveActionRequired && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 10,
                      background: "rgba(239,68,68,.08)",
                      borderRadius: 10,
                    }}
                  >
                    <strong style={{ color: "var(--red)" }}>
                      未达标，必须生成纠偏行动项
                    </strong>
                    <div style={{ marginTop: 8 }}>
                      {assigneeSelect(review.action_owner_user_id, (value) =>
                        setReview({ ...review, action_owner_user_id: value }),
                      )}
                    </div>
                    <input
                      className="input"
                      style={{ marginTop: 8 }}
                      type="date"
                      value={review.action_due_date}
                      onChange={(event) =>
                        setReview({
                          ...review,
                          action_due_date: event.target.value,
                        })
                      }
                    />
                    <textarea
                      className="input"
                      style={{ marginTop: 8, minHeight: 60 }}
                      placeholder="行动项验收标准"
                      value={review.action_acceptance_criteria}
                      onChange={(event) =>
                        setReview({
                          ...review,
                          action_acceptance_criteria: event.target.value,
                        })
                      }
                    />
                  </div>
                )}
                {exitHandoverRequired && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: 10,
                      background: "rgba(59,130,246,.08)",
                      borderRadius: 10,
                    }}
                  >
                    <strong>退出移交（必填）</strong>
                    {exitGateBlocked && (
                      <p style={{ color: "var(--red)", marginTop: 6 }}>
                        尚未完成并通过G6价值复核，不能提交退出复核。
                      </p>
                    )}
                    <div style={{ marginTop: 8 }}>
                      {assigneeSelect(review.handover_owner_user_id, (value) =>
                        setReview({ ...review, handover_owner_user_id: value }),
                      )}
                    </div>
                    <input
                      className="input"
                      style={{ marginTop: 8 }}
                      type="date"
                      value={review.handover_due_date}
                      onChange={(event) =>
                        setReview({
                          ...review,
                          handover_due_date: event.target.value,
                        })
                      }
                    />
                    <textarea
                      className="input"
                      style={{ marginTop: 8, minHeight: 60 }}
                      placeholder="移交验收标准：接收人需要确认的资料、指标和后续责任"
                      value={review.handover_acceptance_criteria}
                      onChange={(event) =>
                        setReview({
                          ...review,
                          handover_acceptance_criteria: event.target.value,
                        })
                      }
                    />
                  </div>
                )}
                <button
                  className="btn-primary"
                  style={{ marginTop: 10 }}
                  disabled={
                    saving ||
                    !review.baseline_id ||
                    !review.forecast_value ||
                    !review.actual_value ||
                    !review.conclusion ||
                    !review.evidence_note ||
                    exitGateBlocked ||
                    (correctiveActionRequired &&
                      (!review.action_owner_user_id ||
                        !review.action_due_date ||
                        !review.action_acceptance_criteria)) ||
                    (exitHandoverRequired &&
                      (!review.handover_owner_user_id ||
                        !review.handover_due_date ||
                        !review.handover_acceptance_criteria))
                  }
                  onClick={() =>
                    void save("submit_benefit_review", {
                      ...review,
                      evidence: [
                        { type: "user_input", content: review.evidence_note },
                      ],
                    })
                  }
                >
                  提交复核
                </button>
              </div>
            </section>

            <section className="card" style={{ marginTop: 16 }}>
              <CardTitle>✅ 收益基线与三方人工复核</CardTitle>
              {data.benefits.length === 0 ? (
                <p style={{ color: "var(--text2)" }}>暂无收益基线。</p>
              ) : (
                data.benefits.map((item) => {
                  const decisions = data.baselineDecisions.filter(
                    (decision) => decision.benefit_baseline_id === item.id,
                  );
                  return (
                    <article
                      key={item.id}
                      style={{
                        padding: 12,
                        background: "var(--surface2)",
                        borderRadius: 10,
                        marginTop: 9,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <div>
                          <strong>{item.benefit_name}</strong>
                          <div
                            style={{
                              color: "var(--text2)",
                              fontSize: ".78rem",
                              marginTop: 5,
                            }}
                          >
                            目标 {money(item.target_value)} · 预测{" "}
                            {money(item.forecast_value)} · 实际{" "}
                            {money(item.actual_value)} · 实现截止{" "}
                            {item.realization_due_date} · G6复核{" "}
                            {item.g6_review_due_date}
                          </div>
                          <div
                            style={{
                              color: "var(--text2)",
                              fontSize: ".78rem",
                              marginTop: 4,
                            }}
                          >
                            退出标准：{item.exit_criteria} · G6状态：
                            {item.g6_reviewed_at
                              ? item.g6_outcome === "not_realized"
                                ? "未实现"
                                : "已实现"
                              : "待复核"}
                          </div>
                        </div>
                        <span className="tag tag-blue">
                          {statusLabel[item.status] || item.status}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                          marginTop: 9,
                        }}
                      >
                        {["business_owner", "finance", "pmo"].map((role) => {
                          const decision = decisions.find(
                            (entry) => entry.reviewer_business_role === role,
                          );
                          return (
                            <span className="tag" key={role}>
                              {roleLabel[role]}：
                              {decision
                                ? decision.decision === "approve"
                                  ? "已同意"
                                  : "已驳回"
                                : "待复核"}
                            </span>
                          );
                        })}
                      </div>
                      {item.status === "draft" &&
                        REVIEWERS.has(context?.businessRole || "") && (
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 8,
                              marginTop: 10,
                            }}
                          >
                            <input
                              className="input"
                              style={{ flex: 1, minWidth: 220 }}
                              placeholder="复核意见（必填）"
                              value={comments[`baseline-${item.id}`] || ""}
                              onChange={(event) =>
                                setComments({
                                  ...comments,
                                  [`baseline-${item.id}`]: event.target.value,
                                })
                              }
                            />
                            <button
                              className="btn-primary"
                              disabled={
                                saving || !comments[`baseline-${item.id}`]
                              }
                              onClick={() =>
                                void save("review_benefit_baseline", {
                                  baseline_id: item.id,
                                  decision: "approve",
                                  comment: comments[`baseline-${item.id}`],
                                })
                              }
                            >
                              同意
                            </button>
                            <button
                              className="btn-secondary"
                              disabled={
                                saving || !comments[`baseline-${item.id}`]
                              }
                              onClick={() =>
                                void save("review_benefit_baseline", {
                                  baseline_id: item.id,
                                  decision: "reject",
                                  comment: comments[`baseline-${item.id}`],
                                })
                              }
                            >
                              驳回
                            </button>
                          </div>
                        )}
                      {item.status === "approved" &&
                        ["pmo", "business_owner"].includes(
                          context?.businessRole || "",
                        ) && (
                          <button
                            className="btn-primary"
                            style={{ marginTop: 10 }}
                            disabled={saving}
                            onClick={() =>
                              void save("start_benefit_tracking", {
                                baseline_id: item.id,
                              })
                            }
                          >
                            启动收益跟踪
                          </button>
                        )}
                    </article>
                  );
                })
              )}
            </section>

            <section className="card" style={{ marginTop: 16 }}>
              <CardTitle>🔄 收益复核与纠偏行动闭环</CardTitle>
              {data.reviews.length === 0 ? (
                <p style={{ color: "var(--text2)" }}>暂无复核记录。</p>
              ) : (
                data.reviews.map((item) => {
                  const decisions = data.reviewDecisions.filter(
                    (decision) => decision.benefit_review_id === item.id,
                  );
                  const action = data.benefitActions.find(
                    (entry) => entry.id === item.action_item_id,
                  );
                  const commentKey = `review-${item.id}`;
                  return (
                    <article
                      key={item.id}
                      style={{
                        padding: 12,
                        background: "var(--surface2)",
                        borderRadius: 10,
                        marginTop: 9,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <div>
                          <strong>
                            {item.review_gate === "G6"
                              ? "G6价值复核"
                              : item.review_gate === "monthly"
                                ? "月度复核"
                                : item.review_gate === "quarterly"
                                  ? "季度复核"
                                  : "退出复核"}
                          </strong>
                          <p
                            style={{
                              color: "var(--text2)",
                              fontSize: ".78rem",
                              marginTop: 5,
                            }}
                          >
                            {item.conclusion} · 预测{" "}
                            {money(item.forecast_value)} · 实际{" "}
                            {money(item.actual_value)} · 差异{" "}
                            {money(item.variance)}
                          </p>
                        </div>
                        <span className="tag tag-blue">
                          {statusLabel[item.status] || item.status}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                          marginTop: 8,
                        }}
                      >
                        {["business_owner", "finance", "pmo"].map((role) => {
                          const decision = decisions.find(
                            (entry) => entry.reviewer_business_role === role,
                          );
                          return (
                            <span className="tag" key={role}>
                              {roleLabel[role]}：
                              {decision
                                ? decision.decision === "approve"
                                  ? "已同意"
                                  : "已驳回"
                                : "待复核"}
                            </span>
                          );
                        })}
                      </div>
                      {item.status === "submitted" &&
                        REVIEWERS.has(context?.businessRole || "") && (
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 8,
                              marginTop: 9,
                            }}
                          >
                            <input
                              className="input"
                              style={{ flex: 1, minWidth: 220 }}
                              placeholder="复核意见（必填）"
                              value={comments[commentKey] || ""}
                              onChange={(event) =>
                                setComments({
                                  ...comments,
                                  [commentKey]: event.target.value,
                                })
                              }
                            />
                            <button
                              className="btn-primary"
                              disabled={saving || !comments[commentKey]}
                              onClick={() =>
                                void save("decide_benefit_review", {
                                  review_id: item.id,
                                  decision: "approve",
                                  comment: comments[commentKey],
                                })
                              }
                            >
                              同意
                            </button>
                            <button
                              className="btn-secondary"
                              disabled={saving || !comments[commentKey]}
                              onClick={() =>
                                void save("decide_benefit_review", {
                                  review_id: item.id,
                                  decision: "reject",
                                  comment: comments[commentKey],
                                })
                              }
                            >
                              驳回
                            </button>
                          </div>
                        )}
                      {action && (
                        <div
                          style={{
                            marginTop: 10,
                            padding: 10,
                            border: "1px solid var(--border)",
                            borderRadius: 9,
                          }}
                        >
                          <strong>行动项：{action.title}</strong>
                          <p
                            style={{
                              color: "var(--text2)",
                              fontSize: ".78rem",
                              marginTop: 5,
                            }}
                          >
                            责任人 {action.owner} · 截止 {action.due_date} ·
                            状态 {statusLabel[action.status] || action.status}
                            <br />
                            验收标准：{action.acceptance_criteria}
                          </p>
                          <textarea
                            className="input"
                            style={{ marginTop: 8, minHeight: 54 }}
                            placeholder={
                              action.status === "in_progress"
                                ? "提交执行证据（必填）"
                                : "操作说明 / 验收意见"
                            }
                            value={actionEvidence[action.id] || ""}
                            onChange={(event) =>
                              setActionEvidence({
                                ...actionEvidence,
                                [action.id]: event.target.value,
                              })
                            }
                          />
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 8,
                              marginTop: 8,
                            }}
                          >
                            {["assigned", "rejected"].includes(action.status) &&
                              action.owner_user_id ===
                                data.context.actorUserId && (
                                <button
                                  className="btn-primary"
                                  disabled={saving}
                                  onClick={() =>
                                    void save("transition_benefit_action", {
                                      action_id: action.id,
                                      transition: "accept",
                                      comment:
                                        actionEvidence[action.id] || "接受任务",
                                    })
                                  }
                                >
                                  接受任务
                                </button>
                              )}
                            {action.status === "accepted" &&
                              action.owner_user_id ===
                                data.context.actorUserId && (
                                <button
                                  className="btn-primary"
                                  disabled={saving}
                                  onClick={() =>
                                    void save("transition_benefit_action", {
                                      action_id: action.id,
                                      transition: "start",
                                      comment:
                                        actionEvidence[action.id] || "开始执行",
                                    })
                                  }
                                >
                                  开始执行
                                </button>
                              )}
                            {action.status === "in_progress" &&
                              action.owner_user_id ===
                                data.context.actorUserId && (
                                <button
                                  className="btn-primary"
                                  disabled={
                                    saving || !actionEvidence[action.id]
                                  }
                                  onClick={() =>
                                    void save("transition_benefit_action", {
                                      action_id: action.id,
                                      transition: "submit_evidence",
                                      evidence: [
                                        {
                                          type: "user_input",
                                          content: actionEvidence[action.id],
                                        },
                                      ],
                                    })
                                  }
                                >
                                  提交证据
                                </button>
                              )}
                            {action.status === "evidence_submitted" &&
                              REVIEWERS.has(context?.businessRole || "") && (
                                <>
                                  <button
                                    className="btn-primary"
                                    disabled={saving}
                                    onClick={() =>
                                      void save("transition_benefit_action", {
                                        action_id: action.id,
                                        transition: "close",
                                        comment:
                                          actionEvidence[action.id] ||
                                          "验收通过",
                                      })
                                    }
                                  >
                                    验收关闭
                                  </button>
                                  <button
                                    className="btn-secondary"
                                    disabled={
                                      saving || !actionEvidence[action.id]
                                    }
                                    onClick={() =>
                                      void save("transition_benefit_action", {
                                        action_id: action.id,
                                        transition: "review_reject",
                                        comment: actionEvidence[action.id],
                                      })
                                    }
                                  >
                                    退回整改
                                  </button>
                                </>
                              )}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </section>

            <section className="card" style={{ marginTop: 16 }}>
              <CardTitle>🤝 退出移交闭环</CardTitle>
              {data.handovers.length === 0 ? (
                <p style={{ color: "var(--text2)" }}>暂无待处理退出移交。</p>
              ) : (
                data.handovers.map((handover) => {
                  const action = data.handoverActions.find(
                    (item) => item.id === handover.action_item_id,
                  );
                  const baseline = data.benefits.find(
                    (item) => item.id === handover.benefit_baseline_id,
                  );
                  if (!action) return null;
                  const note = actionEvidence[action.id] || "";
                  return (
                    <article
                      key={handover.id}
                      style={{
                        padding: 12,
                        background: "var(--surface2)",
                        borderRadius: 10,
                        marginTop: 9,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <div>
                          <strong>
                            {baseline?.benefit_name || "收益事项"} · 退出移交
                          </strong>
                          <p
                            style={{
                              color: "var(--text2)",
                              fontSize: ".8rem",
                              marginTop: 5,
                            }}
                          >
                            接收人 {action.owner} · 截止 {handover.due_date}
                            <br />
                            验收标准：{handover.acceptance_criteria}
                          </p>
                        </div>
                        <span className="tag tag-blue">
                          {statusLabel[handover.status] || handover.status}
                        </span>
                      </div>
                      <textarea
                        className="input"
                        style={{ marginTop: 8, minHeight: 58 }}
                        placeholder={
                          handover.status === "in_progress"
                            ? "提交移交证据（必填）"
                            : "接收说明 / 验收意见"
                        }
                        value={note}
                        onChange={(event) =>
                          setActionEvidence({
                            ...actionEvidence,
                            [action.id]: event.target.value,
                          })
                        }
                      />
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 8,
                          marginTop: 8,
                        }}
                      >
                        {["proposed", "rejected"].includes(handover.status) &&
                          handover.to_owner_user_id ===
                            data.context.actorUserId && (
                            <button
                              className="btn-primary"
                              disabled={saving}
                              onClick={() =>
                                void save("transition_benefit_handover", {
                                  handover_id: handover.id,
                                  transition: "accept",
                                  comment: note || "接收移交",
                                })
                              }
                            >
                              接收移交
                            </button>
                          )}
                        {handover.status === "accepted" &&
                          handover.to_owner_user_id ===
                            data.context.actorUserId && (
                            <button
                              className="btn-primary"
                              disabled={saving}
                              onClick={() =>
                                void save("transition_benefit_handover", {
                                  handover_id: handover.id,
                                  transition: "start",
                                  comment: note || "开始核验",
                                })
                              }
                            >
                              开始核验
                            </button>
                          )}
                        {handover.status === "in_progress" &&
                          handover.to_owner_user_id ===
                            data.context.actorUserId && (
                            <button
                              className="btn-primary"
                              disabled={saving || !note}
                              onClick={() =>
                                void save("transition_benefit_handover", {
                                  handover_id: handover.id,
                                  transition: "submit_evidence",
                                  evidence: [
                                    { type: "user_input", content: note },
                                  ],
                                })
                              }
                            >
                              提交移交证据
                            </button>
                          )}
                        {handover.status === "evidence_submitted" &&
                          REVIEWERS.has(context?.businessRole || "") && (
                            <>
                              <button
                                className="btn-primary"
                                disabled={saving}
                                onClick={() =>
                                  void save("transition_benefit_handover", {
                                    handover_id: handover.id,
                                    transition: "close",
                                    comment: note || "移交验收通过",
                                  })
                                }
                              >
                                验收并完成退出
                              </button>
                              <button
                                className="btn-secondary"
                                disabled={saving || !note}
                                onClick={() =>
                                  void save("transition_benefit_handover", {
                                    handover_id: handover.id,
                                    transition: "review_reject",
                                    comment: note,
                                  })
                                }
                              >
                                退回补充
                              </button>
                            </>
                          )}
                      </div>
                    </article>
                  );
                })
              )}
            </section>

            {data.context.subjectScope !== "project" && (
              <section
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(380px,1fr))",
                  gap: 16,
                  marginTop: 16,
                }}
              >
                <div className="card">
                  <CardTitle>🧮 组合情景分析</CardTitle>
                  {!data.scenarioReadiness.ready && (
                    <div
                      style={{
                        marginBottom: 10,
                        padding: 10,
                        borderRadius: 9,
                        background: "rgba(239,68,68,.08)",
                        color: "var(--red)",
                      }}
                    >
                      缺少真实基线，暂不能计算：
                      {data.scenarioReadiness.gaps
                        .map(
                          (gap) =>
                            `${gap.projectName}[${gap.missing.join("、")}]`,
                        )
                        .join("；") || "当前范围没有项目"}
                    </div>
                  )}
                  <input
                    className="input"
                    placeholder="情景名称"
                    value={scenario.name}
                    onChange={(event) =>
                      setScenario({ ...scenario, name: event.target.value })
                    }
                  />
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3,1fr)",
                      gap: 8,
                      marginTop: 8,
                    }}
                  >
                    <label>
                      <span className="label">延期天数</span>
                      <input
                        className="input"
                        type="number"
                        value={scenario.delay_days}
                        onChange={(event) =>
                          setScenario({
                            ...scenario,
                            delay_days: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      <span className="label">每月增量成本</span>
                      <input
                        className="input"
                        type="number"
                        value={scenario.added_monthly_cost}
                        onChange={(event) =>
                          setScenario({
                            ...scenario,
                            added_monthly_cost: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      <span className="label">范围收入变化</span>
                      <input
                        className="input"
                        type="number"
                        value={scenario.scope_revenue_change}
                        onChange={(event) =>
                          setScenario({
                            ...scenario,
                            scope_revenue_change: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <label
                    style={{
                      display: "flex",
                      gap: 8,
                      marginTop: 10,
                      color: "var(--text2)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={scenario.paused}
                      onChange={(event) =>
                        setScenario({
                          ...scenario,
                          paused: event.target.checked,
                        })
                      }
                    />
                    模拟暂停组合
                  </label>
                  <button
                    className="btn-primary"
                    style={{ marginTop: 10 }}
                    disabled={
                      saving || !scenario.name || !data.scenarioReadiness.ready
                    }
                    onClick={() => void save("create_scenario", scenario)}
                  >
                    计算并保存情景
                  </button>
                </div>
                <div className="card">
                  <CardTitle>📦 CEO确认边界</CardTitle>
                  <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>
                    CEO确认情景后仅形成<strong>待应用影响包</strong>
                    和明确行动项，不会静默修改项目、合同、成本或回款事实。后续必须由责任人评审并显式应用。
                  </p>
                </div>
              </section>
            )}

            {data.context.subjectScope !== "project" && (
              <section className="card" style={{ marginTop: 16 }}>
                <CardTitle>📋 情景评审与待应用影响包</CardTitle>
                {data.scenarios.length === 0 ? (
                  <p style={{ color: "var(--text2)" }}>尚无已保存情景。</p>
                ) : (
                  data.scenarios.map((item) => {
                    const impact = data.impactPackages.find(
                      (entry) => entry.scenario_id === item.id,
                    );
                    const action = impact
                      ? data.scenarioActions.find(
                          (entry) => entry.id === impact.action_item_id,
                        )
                      : undefined;
                    const actionNote = action
                      ? actionEvidence[action.id] || ""
                      : "";
                    return (
                      <article
                        key={item.id}
                        style={{
                          padding: 12,
                          background: "var(--surface2)",
                          borderRadius: 10,
                          marginTop: 8,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            justifyContent: "space-between",
                            gap: 12,
                          }}
                        >
                          <div>
                            <strong>{item.name}</strong>
                            <p
                              style={{
                                color: "var(--text2)",
                                fontSize: ".78rem",
                                marginTop: 5,
                              }}
                            >
                              {item.scenario_type} ·{" "}
                              {statusLabel[item.status] || item.status} · 毛利{" "}
                              {money(item.results.scenarioMargin || 0)} ·
                              90天现金{" "}
                              {money(item.results.scenarioCash90Days || 0)}
                            </p>
                          </div>
                          {impact ? (
                            <span className="tag tag-blue">
                              影响包：
                              {statusLabel[impact.status] || impact.status}
                            </span>
                          ) : (
                            <span className="tag">尚未确认</span>
                          )}
                        </div>
                        {context?.businessRole === "ceo" &&
                          item.status === "draft" && (
                            <div
                              style={{
                                marginTop: 10,
                                padding: 10,
                                border: "1px solid var(--border)",
                                borderRadius: 9,
                              }}
                            >
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns:
                                    "repeat(auto-fit,minmax(210px,1fr))",
                                  gap: 8,
                                }}
                              >
                                {assigneeSelect(
                                  scenarioConfirm.impact_owner_user_id,
                                  (value) =>
                                    setScenarioConfirm({
                                      ...scenarioConfirm,
                                      impact_owner_user_id: value,
                                    }),
                                )}
                                <input
                                  className="input"
                                  type="date"
                                  value={scenarioConfirm.impact_due_date}
                                  onChange={(event) =>
                                    setScenarioConfirm({
                                      ...scenarioConfirm,
                                      impact_due_date: event.target.value,
                                    })
                                  }
                                />
                              </div>
                              <textarea
                                className="input"
                                style={{ marginTop: 8, minHeight: 58 }}
                                placeholder="影响摘要：哪些假设需要进入正式评审"
                                value={scenarioConfirm.impact_summary}
                                onChange={(event) =>
                                  setScenarioConfirm({
                                    ...scenarioConfirm,
                                    impact_summary: event.target.value,
                                  })
                                }
                              />
                              <textarea
                                className="input"
                                style={{ marginTop: 8, minHeight: 58 }}
                                placeholder="应用行动项验收标准"
                                value={scenarioConfirm.acceptance_criteria}
                                onChange={(event) =>
                                  setScenarioConfirm({
                                    ...scenarioConfirm,
                                    acceptance_criteria: event.target.value,
                                  })
                                }
                              />
                              <button
                                className="btn-primary"
                                style={{ marginTop: 8 }}
                                disabled={
                                  saving ||
                                  !scenarioConfirm.impact_owner_user_id ||
                                  !scenarioConfirm.impact_due_date ||
                                  !scenarioConfirm.impact_summary ||
                                  !scenarioConfirm.acceptance_criteria
                                }
                                onClick={() =>
                                  void save("confirm_scenario", {
                                    scenario_id: item.id,
                                    ...scenarioConfirm,
                                  })
                                }
                              >
                                CEO确认并生成待应用影响包
                              </button>
                            </div>
                          )}
                        {impact && (
                          <>
                            <p
                              style={{
                                color: "var(--text2)",
                                marginTop: 8,
                                fontSize: ".8rem",
                              }}
                            >
                              {impact.impact_summary} · 业务事实未被自动修改
                            </p>
                            {action && (
                              <div
                                style={{
                                  marginTop: 10,
                                  padding: 10,
                                  border: "1px solid var(--border)",
                                  borderRadius: 9,
                                }}
                              >
                                <strong>统一行动项：{action.title}</strong>
                                <p
                                  style={{
                                    color: "var(--text2)",
                                    fontSize: ".78rem",
                                    marginTop: 5,
                                  }}
                                >
                                  责任人 {action.owner} · 截止 {action.due_date}{" "}
                                  · 状态{" "}
                                  {statusLabel[action.status] || action.status}
                                  <br />
                                  验收标准：{action.acceptance_criteria}
                                </p>
                                <textarea
                                  className="input"
                                  style={{ marginTop: 8, minHeight: 58 }}
                                  placeholder={
                                    action.status === "in_progress"
                                      ? "提交应用证据（必填）"
                                      : "执行说明 / 验收意见"
                                  }
                                  value={actionNote}
                                  onChange={(event) =>
                                    setActionEvidence({
                                      ...actionEvidence,
                                      [action.id]: event.target.value,
                                    })
                                  }
                                />
                                <div
                                  style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 8,
                                    marginTop: 8,
                                  }}
                                >
                                  {["assigned", "rejected"].includes(
                                    action.status,
                                  ) &&
                                    action.owner_user_id ===
                                      data.context.actorUserId && (
                                      <button
                                        className="btn-primary"
                                        disabled={saving}
                                        onClick={() =>
                                          void save(
                                            "transition_scenario_impact_action",
                                            {
                                              action_id: action.id,
                                              transition: "accept",
                                              comment:
                                                actionNote || "接受影响包评审",
                                            },
                                          )
                                        }
                                      >
                                        接受影响包
                                      </button>
                                    )}
                                  {action.status === "accepted" &&
                                    action.owner_user_id ===
                                      data.context.actorUserId && (
                                      <button
                                        className="btn-primary"
                                        disabled={saving}
                                        onClick={() =>
                                          void save(
                                            "transition_scenario_impact_action",
                                            {
                                              action_id: action.id,
                                              transition: "start",
                                              comment: actionNote || "开始执行",
                                            },
                                          )
                                        }
                                      >
                                        开始执行
                                      </button>
                                    )}
                                  {action.status === "in_progress" &&
                                    action.owner_user_id ===
                                      data.context.actorUserId && (
                                      <button
                                        className="btn-primary"
                                        disabled={saving || !actionNote}
                                        onClick={() =>
                                          void save(
                                            "transition_scenario_impact_action",
                                            {
                                              action_id: action.id,
                                              transition: "submit_evidence",
                                              evidence: [
                                                {
                                                  type: "user_input",
                                                  content: actionNote,
                                                },
                                              ],
                                            },
                                          )
                                        }
                                      >
                                        提交应用证据
                                      </button>
                                    )}
                                  {action.status === "evidence_submitted" &&
                                    SCENARIO_REVIEWERS.has(
                                      context?.businessRole || "",
                                    ) && (
                                      <>
                                        <button
                                          className="btn-primary"
                                          disabled={saving}
                                          onClick={() =>
                                            void save(
                                              "transition_scenario_impact_action",
                                              {
                                                action_id: action.id,
                                                transition: "close",
                                                comment:
                                                  actionNote ||
                                                  "应用证据验收通过",
                                              },
                                            )
                                          }
                                        >
                                          验收应用证据
                                        </button>
                                        <button
                                          className="btn-secondary"
                                          disabled={saving || !actionNote}
                                          onClick={() =>
                                            void save(
                                              "transition_scenario_impact_action",
                                              {
                                                action_id: action.id,
                                                transition: "review_reject",
                                                comment: actionNote,
                                              },
                                            )
                                          }
                                        >
                                          退回整改
                                        </button>
                                      </>
                                    )}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </article>
                    );
                  })
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
