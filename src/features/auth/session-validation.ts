import { hashSessionToken } from "./password.ts";
import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "./storage.ts";

export async function validateSessionToken(token: string | null | undefined): Promise<AppUser | null> {
  if (!token || !isAuthStorageConfigured()) return null;
  const { data, error } = await getAuthSupabase()
    .from("app_sessions")
    .select("id,expires_at,revoked_at,app_users(id,email,phone,name,role,status)")
    .eq("token_hash", hashSessionToken(token))
    .maybeSingle();
  if (error || !data || data.revoked_at || new Date(data.expires_at).getTime() < Date.now()) return null;
  const user = Array.isArray(data.app_users) ? data.app_users[0] : data.app_users;
  if (!user || user.status !== "active") return null;
  return user as AppUser;
}

