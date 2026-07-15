#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const value = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : ""; };
const checkOnly = args.includes("--check");
const vault = value("--vault") || process.env.AI_PMO_VAULT_PATH || "/Volumes/创见/My坚果云260122/AI-PMO-SYS";
const version = (value("--version") || JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version).replace(/^V/i, "");
const vaultRelease = value("--vault-release");
const nextVersion = value("--next-version");
const recordName = value("--record") || `09-产品与集成/AI-PM-V${version}实施记录.md`;
const required = ["README.md", "STATE.yaml", "Task_Log.md", "log.md", "product_life.md", recordName];

if (!existsSync(vault)) throw new Error(`VAULT_NOT_FOUND:${vault}`);

function read(relative) { const path = join(vault, relative); if (!existsSync(path)) throw new Error(`VAULT_RELEASE_FILE_MISSING:${relative}`); return readFileSync(path, "utf8"); }
function write(relative, content) { if (checkOnly) return; writeFileSync(join(vault, relative), content, "utf8"); }
function replaceRequired(content, pattern, replacement, label) { if (!pattern.test(content)) throw new Error(`VAULT_SYNC_PATTERN_MISSING:${label}`); return content.replace(pattern, replacement); }

if (!checkOnly) {
  if (!vaultRelease || !nextVersion) throw new Error("VAULT_RELEASE_AND_NEXT_VERSION_REQUIRED");
  let state = read("STATE.yaml");
  state = replaceRequired(state, /^updated_at:.*$/m, `updated_at: "${new Date().toISOString()}"`, "state.updated_at");
  state = replaceRequired(state, /^release_version:.*$/m, `release_version: "${vaultRelease}"`, "state.release_version");
  state = replaceRequired(state, /^ai_pm_production_version:.*$/m, `ai_pm_production_version: "${version}"`, "state.production");
  state = replaceRequired(state, /^ai_pm_target_version:.*$/m, `ai_pm_target_version: "${nextVersion.replace(/^V/i, "")}"`, "state.target");
  write("STATE.yaml", state);

  let readme = read("README.md");
  readme = replaceRequired(readme, /^version:.*$/m, `version: ${vaultRelease}`, "readme.release");
  readme = replaceRequired(readme, /^ai_pm_production_version:.*$/m, `ai_pm_production_version: V${version}`, "readme.production");
  readme = replaceRequired(readme, /^ai_pm_target_version:.*$/m, `ai_pm_target_version: V${nextVersion.replace(/^V/i, "")}`, "readme.target");
  write("README.md", readme);
}

const checks = required.map(relative => ({ relative, content: read(relative) }));
const productionToken = `V${version}`;
for (const relative of ["README.md", "Task_Log.md", "log.md", "product_life.md", recordName]) {
  const item = checks.find(entry => entry.relative === relative);
  if (!item?.content.includes(productionToken)) throw new Error(`VAULT_RELEASE_VERSION_MISSING:${relative}:${productionToken}`);
}
const state = checks.find(entry => entry.relative === "STATE.yaml")?.content || "";
if (!new RegExp(`ai_pm_production_version:\\s*[\"']?${version.replaceAll(".", "\\.")}`).test(state)) throw new Error(`VAULT_STATE_VERSION_MISMATCH:${version}`);
if (/215/.test(read("README.md")) === false) throw new Error("VAULT_215_READONLY_BOUNDARY_MISSING");
console.log(JSON.stringify({ status: "passed", mode: checkOnly ? "check" : "sync_and_check", vault, version, files: required.length, preserved_boundary: "215 intentional duplicate groups untouched" }));
