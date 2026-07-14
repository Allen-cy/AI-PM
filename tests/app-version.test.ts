import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { isPublicRequestPath, resolveRequestAccess } from "../src/features/auth/api-access.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("V6.3.1 release derives browser version metadata from package.json", () => {
  const packageMetadata = JSON.parse(read("package.json")) as { version: string };
  const packageLock = JSON.parse(read("package-lock.json")) as {
    version: string;
    packages: Record<string, { version?: string }>;
  };
  const nextConfig = read("next.config.ts");

  assert.equal(packageMetadata.version, "6.3.1");
  assert.equal(packageLock.version, packageMetadata.version);
  assert.equal(packageLock.packages[""]?.version, packageMetadata.version);
  assert.match(nextConfig, /packageMetadata\.version/);
  assert.match(nextConfig, /VERCEL_GIT_COMMIT_SHA/);
  assert.match(nextConfig, /NEXT_PUBLIC_APP_VERSION/);
  assert.match(nextConfig, /NEXT_PUBLIC_GIT_COMMIT_SHA/);
});

test("version resolver normalizes the public version and short commit label", async () => {
  const moduleUrl = new URL("../src/lib/app-version.ts", import.meta.url);
  assert.equal(existsSync(moduleUrl), true, "src/lib/app-version.ts must provide the shared version contract");
  if (!existsSync(moduleUrl)) return;

  const { resolveAppVersion } = await import(moduleUrl.href) as {
    resolveAppVersion: (environment: Record<string, string | undefined>) => {
      version: string;
      commit: string;
      label: string;
    };
  };

  assert.deepEqual(resolveAppVersion({
    NEXT_PUBLIC_APP_VERSION: "6.3.1",
    NEXT_PUBLIC_GIT_COMMIT_SHA: "0123456789abcdef",
  }), {
    version: "6.3.1",
    commit: "0123456",
    label: "V6.3.1 · 0123456",
  });

  assert.deepEqual(resolveAppVersion({}), {
    version: "0.0.0",
    commit: "local",
    label: "V0.0.0 · local",
  });
});

test("homepage and version API consume the shared build label without stale hardcoding", () => {
  const home = read("src/app/page.tsx");
  const routeUrl = new URL("../src/app/api/version/route.ts", import.meta.url);

  assert.doesNotMatch(home, /\bV\d+\.\d+\.\d+\b/);
  assert.match(home, /APP_VERSION_INFO\.label/);
  assert.equal(existsSync(routeUrl), true, "GET /api/version must exist for deployment acceptance");
  if (!existsSync(routeUrl)) return;

  const route = readFileSync(routeUrl, "utf8");
  assert.match(route, /APP_VERSION_INFO/);
  assert.match(route, /Cache-Control["']?\s*:\s*["']no-store/);
  assert.match(route, /VERCEL_ENV/);
  assert.match(route, /VERCEL_GIT_COMMIT_REF/);
  assert.equal(isPublicRequestPath("/api/version"), true);
  assert.equal(resolveRequestAccess({
    authRequired: true,
    pathname: "/api/version",
    hasSessionCookie: false,
  }), "next");
});

test("README leads with the V6.3.1 release instead of V6.3.0", () => {
  const readme = read("README.md");
  const v631 = readme.indexOf("## AI-PMO System V6.3.1");
  const v630 = readme.indexOf("## AI-PMO System V6.3.0");
  const v620 = readme.indexOf("## AI-PMO System V6.2.0");

  assert.notEqual(v630, -1);
  assert.notEqual(v620, -1);
  assert.ok(v631 >= 0 && v631 < v630, "V6.3.1 release notes must appear before V6.3.0");
  assert.ok(v630 < v620, "V6.3.0 release notes must remain before V6.2.0");
});
