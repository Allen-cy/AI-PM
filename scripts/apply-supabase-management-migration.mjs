#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const [projectRef, migrationFile] = process.argv.slice(2);
if (!projectRef || !migrationFile) {
  throw new Error("用法：node scripts/apply-supabase-management-migration.mjs <project-ref> <migration.sql>");
}

const absoluteFile = resolve(migrationFile);
const filename = basename(absoluteFile);
const match = filename.match(/^(\d+)_([a-z0-9_]+)\.sql$/i);
if (!match) throw new Error("迁移文件名必须为 <version>_<name>.sql。");
const [, version, name] = match;
const query = readFileSync(absoluteFile, "utf8");

function accessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  return execFileSync("security", ["find-generic-password", "-s", "Supabase CLI", "-a", "supabase", "-w"], { encoding: "utf8" }).trim();
}

async function execute(sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Supabase Management API ${response.status}: ${payload.message || payload.error || "数据库请求失败"}`);
  return payload;
}

const existing = await execute(`select exists(select 1 from supabase_migrations.schema_migrations where version='${version}') as applied`);
if (existing?.[0]?.applied) {
  console.log(JSON.stringify({ status: "already_applied", project_ref: projectRef, version, name }));
  process.exit(0);
}

await execute(query);
const encoded = Buffer.from(query, "utf8").toString("base64");
await execute(`insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','${name}',array[convert_from(decode('${encoded}','base64'),'utf8')]) on conflict(version) do nothing`);
console.log(JSON.stringify({ status: "applied", project_ref: projectRef, version, name }));
