"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  assessMigrationReadiness,
  migrationDataObjects,
  migrationReadinessAreas,
  migrationStages,
  type MigrationAreaId,
} from "@/features/migration/readiness";

const levelColor = {
  "not-ready": "var(--red)",
  "trial-ready": "var(--amber)",
  "pilot-ready": "var(--accent2)",
  "migration-ready": "var(--green)",
};

export default function MigrationCenterPage() {
  const [selectedAreaIds, setSelectedAreaIds] = useState<MigrationAreaId[]>([
    "process-coverage",
    "data-portability",
    "security",
  ]);

  const result = useMemo(() => assessMigrationReadiness(selectedAreaIds), [selectedAreaIds]);

  function toggleArea(id: MigrationAreaId) {
    setSelectedAreaIds(current =>
      current.includes(id) ? current.filter(item => item !== id) : [...current, id]
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", padding: "28px 32px" }}>
      <div style={{ maxWidth: 1220, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 22 }}>
          <div>
            <Link href="/" style={{ color: "var(--accent2)", textDecoration: "none", fontSize: "0.86rem" }}>← 返回首页</Link>
            <h1 style={{ fontSize: "1.9rem", fontWeight: 850, marginTop: 12 }}>迁移与数据接入中心</h1>
            <p style={{ color: "var(--text2)", lineHeight: 1.7, marginTop: 8, maxWidth: 760 }}>
              面向竞品A忠实用户的迁移工作台：先确认流程不断点、数据可迁移、AI可信、权限安全，再决定是否进入试点或正式切换。
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link href="/integration-center" className="btn-secondary" style={{ textDecoration: "none" }}>数据与集成</Link>
            <Link href="/dashboard" className="btn-secondary" style={{ textDecoration: "none" }}>项目看板导入</Link>
            <Link href="/templates" className="btn-secondary" style={{ textDecoration: "none" }}>模板中心</Link>
          </div>
        </div>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(280px, 0.9fr) minmax(0, 1.5fr)", gap: 16, alignItems: "start", marginBottom: 18 }}>
          <div className="card" style={{ position: "sticky", top: 18 }}>
            <div className="section-title">迁移成熟度</div>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 16, alignItems: "center" }}>
              <div
                aria-label={`迁移成熟度评分 ${result.score}`}
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  border: `10px solid ${levelColor[result.level]}55`,
                  background: `radial-gradient(circle, ${levelColor[result.level]}22, transparent 66%)`,
                  color: levelColor[result.level],
                  fontSize: "1.7rem",
                  fontWeight: 900,
                }}
              >
                {result.score}
              </div>
              <div>
                <strong style={{ fontSize: "1.15rem", color: levelColor[result.level] }}>{result.levelName}</strong>
                <p style={{ color: "var(--text2)", lineHeight: 1.7, marginTop: 8 }}>{result.summary}</p>
              </div>
            </div>
            <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
              {result.recommendedNextActions.map(action => (
                <div key={action} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, color: "var(--accent2)", fontSize: "0.84rem", lineHeight: 1.6 }}>
                  {action}
                </div>
              ))}
            </div>
            <p style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6, marginTop: 14 }}>
              评分用于迁移决策，不写入数据库。后续可接入真实导入日志、字段映射结果和用户试点评分。
            </p>
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
              <div>
                <div className="section-title">永久迁移条件检查</div>
                <p style={{ color: "var(--text2)", fontSize: "0.84rem", lineHeight: 1.6 }}>
                  勾选已经被真实项目验证过的条件，系统会给出当前迁移阶段建议。
                </p>
              </div>
              <span className="tag tag-blue">{selectedAreaIds.length}/{migrationReadinessAreas.length} 已验证</span>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {migrationReadinessAreas.map(area => {
                const checked = selectedAreaIds.includes(area.id);
                return (
                  <label
                    key={area.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto",
                      gap: 12,
                      alignItems: "start",
                      border: `1px solid ${checked ? "rgba(56,189,248,0.48)" : "var(--border)"}`,
                      background: checked ? "rgba(56,189,248,0.08)" : "var(--surface2)",
                      borderRadius: 12,
                      padding: 14,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleArea(area.id)}
                      style={{ marginTop: 4 }}
                      aria-label={`是否已验证${area.name}`}
                    />
                    <span>
                      <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <strong>{area.name}</strong>
                        <span className="tag">{area.owner}</span>
                        <span className="tag tag-blue">{area.weight}分</span>
                      </span>
                      <span style={{ display: "block", color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.65, marginTop: 8 }}>
                        {area.whyItMatters}
                      </span>
                      <span style={{ display: "block", color: "var(--green)", fontSize: "0.82rem", lineHeight: 1.65, marginTop: 8 }}>
                        用户迁移证据：{area.userProof}
                      </span>
                      <span style={{ display: "block", color: "var(--accent2)", fontSize: "0.82rem", lineHeight: 1.65, marginTop: 8 }}>
                        下一步：{area.nextAction}
                      </span>
                    </span>
                    <span className={checked ? "tag tag-green" : "tag tag-amber"}>{checked ? "已验证" : "待验证"}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </section>

        <section className="card" style={{ marginBottom: 18 }}>
          <div className="section-title">迁移阶段门</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {migrationStages.map(stage => (
              <article key={stage.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
                <h2 style={{ fontSize: "0.98rem", fontWeight: 800 }}>{stage.name}</h2>
                <p style={{ color: "var(--text2)", lineHeight: 1.65, fontSize: "0.82rem", marginTop: 8 }}>{stage.objective}</p>
                <div style={{ marginTop: 12 }}>
                  <strong style={{ fontSize: "0.78rem", color: "var(--text)" }}>输入</strong>
                  <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.78rem", marginTop: 4 }}>{stage.inputs.join("、")}</p>
                </div>
                <div style={{ marginTop: 10 }}>
                  <strong style={{ fontSize: "0.78rem", color: "var(--text)" }}>输出</strong>
                  <p style={{ color: "var(--green)", lineHeight: 1.6, fontSize: "0.78rem", marginTop: 4 }}>{stage.outputs.join("、")}</p>
                </div>
                <p style={{ color: "var(--accent2)", lineHeight: 1.6, fontSize: "0.78rem", marginTop: 10 }}>阶段门：{stage.gate}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
            <div>
              <div className="section-title">需要迁移的数据对象</div>
              <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.84rem" }}>
                用这张清单向竞品A导出数据、向飞书补字段、向模板中心补导入模板。
              </p>
            </div>
            <span className="tag tag-purple">字段均要求中文口径</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr style={{ color: "var(--text2)", textAlign: "left", fontSize: "0.78rem" }}>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>数据对象</th>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>来源</th>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>关键字段</th>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>进入模块</th>
                  <th style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>质量检查</th>
                </tr>
              </thead>
              <tbody>
                {migrationDataObjects.map(object => (
                  <tr key={object.name}>
                    <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", fontWeight: 800 }}>{object.name}</td>
                    <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)" }}><span className="tag">{object.source}</span></td>
                    <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.6 }}>{object.requiredFields.join("、")}</td>
                    <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", color: "var(--accent2)", fontSize: "0.8rem", lineHeight: 1.6 }}>{object.targetModule}</td>
                    <td style={{ padding: "12px 8px", borderBottom: "1px solid var(--border)", color: "var(--green)", fontSize: "0.8rem", lineHeight: 1.6 }}>{object.qualityChecks.join("；")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
