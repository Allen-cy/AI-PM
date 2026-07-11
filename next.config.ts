import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";
import packageMetadata from "./package.json";

function resolveGitCommitSha(): string {
  const vercelCommit = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (vercelCommit) return vercelCommit;

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "local";
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: packageMetadata.version,
    NEXT_PUBLIC_GIT_COMMIT_SHA: resolveGitCommitSha(),
  },
  // turbopack: {
  //   root: "/Users/allen/CodeBuddy/ai-pm-system",
  // },
};

export default nextConfig;
