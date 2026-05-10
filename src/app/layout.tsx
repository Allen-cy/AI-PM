import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI项目管理助手",
  description: "AI辅助全流程项目管理 — WBS智能拆解 · 挣值分析 · 关键路径计算 · AI报告生成",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}