export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone: string) {
  return phone.trim().replace(/[\s-]/g, '');
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function isReasonablePhone(phone: string) {
  const normalized = normalizePhone(phone);
  const mainlandChinaMobile = /^1[3-9]\d{9}$/;
  const internationalPhone = /^\+[1-9]\d{7,14}$/;
  return mainlandChinaMobile.test(normalized) || internationalPhone.test(normalized);
}

export function isValidPassword(password: string) {
  return password.length >= 6 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

export function isValidDisplayName(name: string) {
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 40;
}

export function validateRegistrationInput(input: {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  code?: string;
}) {
  if (!input.name || !isValidDisplayName(input.name)) return '用户名称必填，长度需为2-40个字符';
  if (!input.email || !isValidEmail(input.email)) return '邮箱格式不正确';
  if (!input.phone || !isReasonablePhone(input.phone)) return '手机号码格式不合理';
  if (!input.password || !isValidPassword(input.password)) return '密码至少6位，且必须同时包含英文字母和数字';
  if (!input.code || input.code.trim().length < 6) return '注册码不正确';
  return null;
}
