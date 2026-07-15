#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [projectRef, queryFile] = process.argv.slice(2);
if (!projectRef || !queryFile) throw new Error("用法：node scripts/query-supabase-management.mjs <project-ref> <query.sql>");
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim() || execFileSync("security", ["find-generic-password", "-s", "Supabase CLI", "-a", "supabase", "-w"], { encoding: "utf8" }).trim();
const query = readFileSync(resolve(queryFile), "utf8");
const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
const payload = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`Supabase Management API ${response.status}: ${payload.message || payload.error || "数据库查询失败"}`);
console.log(JSON.stringify(payload, null, 2));
