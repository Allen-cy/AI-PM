#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const [projectRef] = process.argv.slice(2);
const summaryOnly = process.argv.includes("--summary");
if (!projectRef) throw new Error("用法：node scripts/audit-supabase-advisors.mjs <project-ref>");
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim() || execFileSync("security", ["find-generic-password", "-s", "Supabase CLI", "-a", "supabase", "-w"], { encoding: "utf8" }).trim();
const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/advisors/security`, { headers: { Authorization: `Bearer ${token}` } });
const payload = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`Supabase Advisor API ${response.status}: ${payload.message || payload.error || "安全顾问读取失败"}`);
const entries = Array.isArray(payload) ? payload : Array.isArray(payload.lints) ? payload.lints : [];
const normalized = entries.map(item => ({ level: String(item.level || item.severity || "unknown").toUpperCase(), name: String(item.name || item.title || item.code || "unnamed"), detail: String(item.detail || item.description || item.message || "").slice(0, 240) }));
const counts = normalized.reduce((result, item) => ({ ...result, [item.level]: (result[item.level] || 0) + 1 }), {});
const v633Pattern = /project_control|project_issues|project_changes|unified_action_items|issue_change_events|begin_v633|finish_v633|apply_project_issue_change/i;
const v633Findings = normalized.filter(item => v633Pattern.test(`${item.name} ${item.detail}`));
const findingTypes = normalized.reduce((result, item) => {
  const key = `${item.level}:${item.name}`;
  result[key] = (result[key] || 0) + 1;
  return result;
}, {});
const output = summaryOnly
  ? { project_ref: projectRef, counts, v633_findings: v633Findings, finding_types: findingTypes }
  : { project_ref: projectRef, counts, v633_findings: v633Findings, findings: normalized };
console.log(JSON.stringify(output, null, 2));
