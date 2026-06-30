import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';

const ITERATIONS = 120_000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return `pbkdf2_${DIGEST}$${ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [algorithm, iterationsRaw, salt, hash] = storedHash.split('$');
  if (algorithm !== `pbkdf2_${DIGEST}` || !iterationsRaw || !salt || !hash) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isInteger(iterations) || iterations < 1) return false;
  const computed = pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === computed.length && timingSafeEqual(expected, computed);
}

export function generateRegistrationCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
}

export function hashRegistrationCode(code: string) {
  const pepper = process.env.REGISTRATION_CODE_PEPPER || process.env.AUTH_SESSION_SECRET || 'local-dev-pepper';
  return createHash('sha256').update(`${pepper}:${code.trim().toUpperCase()}`).digest('hex');
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string) {
  const secret = process.env.AUTH_SESSION_SECRET || 'local-dev-session-secret';
  return createHash('sha256').update(`${secret}:${token}`).digest('hex');
}
