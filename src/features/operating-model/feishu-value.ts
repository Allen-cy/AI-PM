export function parseFeishuAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const unit = /亿/.test(raw) ? 100_000_000 : /万/.test(raw) ? 10_000 : 1;
  const normalized = raw.replace(/[,%￥¥亿元万\s]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed * unit : null;
}

