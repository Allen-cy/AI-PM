#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const [projectRef, migrationFile] = process.argv.slice(2);
if (!projectRef || !migrationFile) throw new Error("用法：node scripts/validate-supabase-management-migration.mjs <project-ref> <migration.sql>");
const absoluteFile = resolve(migrationFile);
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim()
  || execFileSync("security", ["find-generic-password", "-s", "Supabase CLI", "-a", "supabase", "-w"], { encoding: "utf8" }).trim();
const query = `begin;\n${readFileSync(absoluteFile, "utf8")}\nrollback;`;
const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
const payload = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`Supabase Management API ${response.status}: ${payload.message || payload.error || "迁移验证失败"}`);
console.log(JSON.stringify({ status: "valid", project_ref: projectRef, migration: basename(absoluteFile), rolled_back: true }));
