import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildHomeClock, INITIAL_HOME_CLOCK } from "../src/features/home/clock.ts";

test("V6.6.8 homepage clock starts from deterministic server and browser text", () => {
  assert.deepEqual(INITIAL_HOME_CLOCK, {
    greeting: "👋 欢迎回来，正在读取当前时间",
    dateLabel: "—",
  });
});

test("V6.6.8 homepage clock resolves morning afternoon and evening after hydration", () => {
  assert.match(buildHomeClock(new Date(2026, 6, 16, 8, 0, 0)).greeting, /早上好/);
  assert.match(buildHomeClock(new Date(2026, 6, 16, 14, 0, 0)).greeting, /下午好/);
  assert.match(buildHomeClock(new Date(2026, 6, 16, 20, 0, 0)).greeting, /晚上好/);
  assert.notEqual(buildHomeClock(new Date(2026, 6, 16, 8, 0, 0)).dateLabel, "—");
});

test("V6.6.8 homepage no longer renders a live Date directly into server markup", () => {
  const source = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /useState\(INITIAL_HOME_CLOCK\)/);
  assert.match(source, /requestAnimationFrame\(\(\) => setClock\(buildHomeClock\(new Date\(\)\)\)\)/);
  assert.doesNotMatch(source, /\{new Date\(\)\.toLocaleDateString/);
  assert.doesNotMatch(source, /const greeting = \(\(\) =>/);
});
