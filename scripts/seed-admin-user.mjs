import { createHash, pbkdf2Sync, randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;
const phone = process.env.ADMIN_PHONE;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME || '系统管理员';

function hashPassword(rawPassword) {
  const iterations = 120_000;
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(rawPassword, salt, iterations, 32, 'sha256').toString('hex');
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

function assertEnv() {
  const missing = [];
  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!email) missing.push('ADMIN_EMAIL');
  if (!phone) missing.push('ADMIN_PHONE');
  if (!password) missing.push('ADMIN_PASSWORD');
  if (missing.length > 0) {
    throw new Error(`Missing env: ${missing.join(', ')}`);
  }
  if (password.length < 6 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('ADMIN_PASSWORD must be at least 6 chars and include letters + digits');
  }
}

assertEnv();

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const passwordFingerprint = createHash('sha256').update(password).digest('hex').slice(0, 8);
const { data: existing } = await supabase
  .from('app_users')
  .select('id')
  .or(`email.eq.${email},phone.eq.${phone}`)
  .maybeSingle();

if (existing) {
  const { error } = await supabase
    .from('app_users')
    .update({
      email,
      phone,
      name,
      role: 'admin',
      status: 'active',
      password_hash: hashPassword(password),
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id);
  if (error) throw error;
  console.log(`Admin user updated. password_fingerprint=${passwordFingerprint}`);
} else {
  const { error } = await supabase
    .from('app_users')
    .insert({
      email,
      phone,
      name,
      role: 'admin',
      status: 'active',
      password_hash: hashPassword(password),
    });
  if (error) throw error;
  console.log(`Admin user created. password_fingerprint=${passwordFingerprint}`);
}
