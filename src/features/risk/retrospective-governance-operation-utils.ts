export function maskFeishuReceiveId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}***`;
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}

export function reminderLogKey(reminderId: string, snapshotDate: string): string {
  return `${snapshotDate}:${reminderId}`;
}
