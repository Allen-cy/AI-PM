import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);

function read(path: string) {
  return readFileSync(new URL(path, ROOT), "utf8");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|js|jsx)$/.test(name) ? [path] : [];
  });
}

test("用户中心入口统一指向实际存在的 /account 路由", () => {
  const operationsCenter = read("src/features/operating-model/operations-center.ts");
  assert.match(operationsCenter, /actionHref:\s*"\/account"/);

  const staleLinks = sourceFiles(fileURLToPath(new URL("src/", ROOT)))
    .flatMap(path => {
      const source = readFileSync(path, "utf8");
      return source.includes('"/user-center"') || source.includes("'/user-center'") ? [path] : [];
    });
  assert.deepEqual(staleLinks, [], `仍存在失效 /user-center 入口: ${staleLinks.join(", ")}`);
});

test("375px 登录页切换为单列紧凑布局并让表单进入首屏", () => {
  const page = read("src/app/auth/login/page.tsx");
  const css = read("src/app/auth/login/page.module.css");

  assert.match(page, /import styles from "\.\/page\.module\.css"/);
  assert.match(page, /className=\{styles\.deskCard\}/);
  assert.match(page, /className=\{styles\.brandPanel\}/);
  assert.match(page, /className=\{styles\.formColumn\}/);
  assert.match(page, /className=\{styles\.formCard\}/);

  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /\.deskCard\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /\.brandEmblem[\s\S]*\.brandDescription[\s\S]*\.brandNote\s*\{[\s\S]*?display:\s*none/);
  assert.match(css, /\.formColumn\s*\{[\s\S]*?padding:\s*12px\s+0\s+0/);
  assert.match(css, /\.formCard\s*\{[\s\S]*?padding:\s*22px\s+18px/);
  assert.match(page, /<form[\s\S]*?onSubmit=\{submit\}/, "登录页应支持回车提交");
  assert.match(page, /type="submit"/, "登录按钮应是标准提交按钮");
});

test("1440px 桌面端保留双栏拟物化工作台结构", () => {
  const css = read("src/app/auth/login/page.module.css");
  assert.match(css, /\.deskCard\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*0\.95fr\)\s+minmax\(380px,\s*1\.05fr\)/);
  assert.match(css, /\.deskCard\s*\{[\s\S]*?max-width:\s*980px/);
  assert.match(css, /\.deskCard\s*\{[\s\S]*?min-height:\s*560px/);
});
