import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

const ENVELOPE_VERSION = 1;
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;

export type CredentialEnvironment = Record<string, string | undefined>;

export class CredentialEncryptionConfigError extends Error {
  constructor() {
    super("敏感配置加密服务未配置");
    this.name = "CredentialEncryptionConfigError";
  }
}

export class CredentialDecryptionError extends Error {
  constructor() {
    super("敏感配置解密失败");
    this.name = "CredentialDecryptionError";
  }
}

export interface EncryptedCredential {
  encrypted: string;
  keyVersion: number;
}

export function aiApiKeyCredentialContext(userId: string): string {
  return `user_ai_settings:${userId}:api_key`;
}

export function feishuAppSecretCredentialContext(userId: string): string {
  return `user_feishu_connections:${userId}:app_secret`;
}

export function feishuBaseTokenCredentialContext(userId: string): string {
  return `user_feishu_connections:${userId}:base_token`;
}

export function organizationFeishuAppSecretCredentialContext(orgId: string): string {
  return `organization_feishu_connections:${orgId}:app_secret`;
}

export function organizationFeishuBaseTokenCredentialContext(orgId: string): string {
  return `organization_feishu_connections:${orgId}:base_token`;
}

export interface StoredCredentialInput {
  encrypted?: string | null;
  plaintext?: string | null;
  context: string;
  environment?: CredentialEnvironment;
}

export type StoredCredentialResolution =
  | { value: string; source: "encrypted"; keyVersion: number }
  | { value: string; source: "legacy_plaintext"; keyVersion: null }
  | { value: null; source: "missing"; keyVersion: null };

function positiveVersion(value: string | undefined): number {
  const parsed = Number(value || "1");
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 9999) {
    throw new CredentialEncryptionConfigError();
  }
  return parsed;
}

function currentKeyVersion(environment: CredentialEnvironment): number {
  return positiveVersion(environment.CREDENTIAL_ENCRYPTION_KEY_VERSION);
}

function rootSecretForVersion(environment: CredentialEnvironment, version: number): string {
  const versioned = environment[`CREDENTIAL_ENCRYPTION_KEY_V${version}`]?.trim();
  const currentVersion = currentKeyVersion(environment);
  const current = version === currentVersion ? environment.CREDENTIAL_ENCRYPTION_KEY?.trim() : "";
  const sessionSecret = environment.AUTH_SESSION_SECRET?.trim();
  const rootSecret = versioned || current || sessionSecret;
  if (!rootSecret || rootSecret.length < 16) throw new CredentialEncryptionConfigError();
  return rootSecret;
}

function keyForVersion(environment: CredentialEnvironment, version: number): Buffer {
  return scryptSync(
    rootSecretForVersion(environment, version),
    `ai-pmo/credential-envelope/v${ENVELOPE_VERSION}/key-${version}`,
    KEY_LENGTH,
  );
}

function aad(context: string, keyVersion: number): Buffer {
  const normalized = context.trim();
  if (!normalized) throw new CredentialEncryptionConfigError();
  return Buffer.from(`cred:v${ENVELOPE_VERSION}:k${keyVersion}:${normalized}`, "utf8");
}

function base64url(value: Buffer): string {
  return value.toString("base64url");
}

function fromBase64url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new CredentialDecryptionError();
  return Buffer.from(value, "base64url");
}

export function encryptCredential(
  plaintext: string,
  context: string,
  environment: CredentialEnvironment = process.env,
): EncryptedCredential {
  const value = plaintext.trim();
  if (!value) throw new CredentialEncryptionConfigError();
  const keyVersion = currentKeyVersion(environment);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyForVersion(environment, keyVersion), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  cipher.setAAD(aad(context, keyVersion));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: `cred:v${ENVELOPE_VERSION}:k${keyVersion}:${base64url(iv)}:${base64url(tag)}:${base64url(ciphertext)}`,
    keyVersion,
  };
}

export function decryptCredential(
  encrypted: string,
  context: string,
  environment: CredentialEnvironment = process.env,
): string {
  try {
    const parts = encrypted.split(":");
    if (parts.length !== 6 || parts[0] !== "cred" || parts[1] !== `v${ENVELOPE_VERSION}`) {
      throw new CredentialDecryptionError();
    }
    const keyVersionMatch = /^k([1-9][0-9]{0,3})$/.exec(parts[2]);
    if (!keyVersionMatch) throw new CredentialDecryptionError();
    const keyVersion = Number(keyVersionMatch[1]);
    const iv = fromBase64url(parts[3]);
    const tag = fromBase64url(parts[4]);
    const ciphertext = fromBase64url(parts[5]);
    if (iv.length !== IV_LENGTH || tag.length !== AUTH_TAG_LENGTH || ciphertext.length < 1) {
      throw new CredentialDecryptionError();
    }
    const decipher = createDecipheriv(ALGORITHM, keyForVersion(environment, keyVersion), iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAAD(aad(context, keyVersion));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof CredentialEncryptionConfigError) throw error;
    throw new CredentialDecryptionError();
  }
}

export function resolveStoredCredential(input: StoredCredentialInput): StoredCredentialResolution {
  const encrypted = input.encrypted?.trim();
  if (encrypted) {
    const keyVersionMatch = /^cred:v1:k([1-9][0-9]{0,3}):/.exec(encrypted);
    if (!keyVersionMatch) throw new CredentialDecryptionError();
    return {
      value: decryptCredential(encrypted, input.context, input.environment),
      source: "encrypted",
      keyVersion: Number(keyVersionMatch[1]),
    };
  }
  const legacy = input.plaintext?.trim();
  if (legacy) return { value: legacy, source: "legacy_plaintext", keyVersion: null };
  return { value: null, source: "missing", keyVersion: null };
}

export function maskedCredential(last4?: string | null): string {
  const suffix = last4?.trim().slice(-4) || "";
  return suffix ? `••••${suffix}` : "";
}
