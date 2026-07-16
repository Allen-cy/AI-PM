export interface HomeClockLabel {
  greeting: string;
  dateLabel: string;
}

export const INITIAL_HOME_CLOCK: HomeClockLabel = {
  greeting: "👋 欢迎回来，正在读取当前时间",
  dateLabel: "—",
};

export function buildHomeClock(now: Date): HomeClockLabel {
  const hour = now.getHours();
  const greeting = hour < 12
    ? "☀️ 早上好，开启高效的一天"
    : hour < 18
      ? "🌤️ 下午好，保持专注"
      : "🌙 晚上好，整理一天收获";
  return {
    greeting,
    dateLabel: now.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }),
  };
}
