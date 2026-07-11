export interface AppVersionInfo {
  version: string;
  commit: string;
  label: string;
}

type VersionEnvironment = Record<string, string | undefined>;

function normalizeVersion(value?: string): string {
  const normalized = value?.trim();
  return normalized && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(normalized)
    ? normalized
    : "0.0.0";
}

function normalizeCommit(value?: string): string {
  const normalized = value?.trim();
  return normalized && /^[0-9a-f]{7,40}$/i.test(normalized)
    ? normalized.slice(0, 7).toLowerCase()
    : "local";
}

export function resolveAppVersion(environment: VersionEnvironment): AppVersionInfo {
  const version = normalizeVersion(environment.NEXT_PUBLIC_APP_VERSION);
  const commit = normalizeCommit(environment.NEXT_PUBLIC_GIT_COMMIT_SHA);
  return {
    version,
    commit,
    label: `V${version} · ${commit}`,
  };
}

export const APP_VERSION_INFO = resolveAppVersion({
  NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
  NEXT_PUBLIC_GIT_COMMIT_SHA: process.env.NEXT_PUBLIC_GIT_COMMIT_SHA,
});
