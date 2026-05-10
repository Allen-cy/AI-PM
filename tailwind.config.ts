import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0a0e17",
        surface: "#131a26",
        surface2: "#1a2332",
        border: "#253049",
        text: "#e2e8f0",
        text2: "#94a3b8",
        accent: "#3b82f6",
        accent2: "#60a5fa",
        green: "#10b981",
        amber: "#f59e0b",
        red: "#ef4444",
        purple: "#8b5cf6",
        cyan: "#06b6d4",
        feishu: "#3370ff",
      },
      borderRadius: {
        DEFAULT: "12px",
      },
    },
  },
  plugins: [],
} satisfies Config;