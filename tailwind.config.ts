import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "hsl(var(--bg) / <alpha-value>)",
        surface: "hsl(var(--surface) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        fg: "hsl(var(--fg) / <alpha-value>)",
        muted: "hsl(var(--muted) / <alpha-value>)",
        primary: { DEFAULT: "hsl(var(--primary) / <alpha-value>)", fg: "hsl(var(--primary-fg) / <alpha-value>)" },
        accent: "hsl(var(--accent) / <alpha-value>)",
      },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
      boxShadow: { soft: "0 1px 2px rgba(0,0,0,.04), 0 8px 24px -14px rgba(0,0,0,.18)" },
    },
  },
  plugins: [],
};
export default config;