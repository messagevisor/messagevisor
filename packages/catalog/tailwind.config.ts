import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--mv-color-background)",
        surface: "var(--mv-color-surface)",
        elevated: "var(--mv-color-elevated)",
        border: "var(--mv-color-border)",
        text: "var(--mv-color-text)",
        muted: "var(--mv-color-muted)",
        faint: "var(--mv-color-faint)",
        placeholder: "var(--mv-color-placeholder)",
        primary: "var(--mv-color-primary)",
        success: "var(--mv-color-success)",
        warning: "var(--mv-color-warning)",
        danger: "var(--mv-color-danger)",
        header: "var(--mv-color-header)",
        "header-active": "var(--mv-color-header-active)",
        "header-text": "var(--mv-color-header-text)",
        pill: "var(--mv-color-pill)",
        "success-surface": "var(--mv-color-success-surface)",
        "success-outline": "var(--mv-color-success-outline)",
        "warning-surface": "var(--mv-color-warning-surface)",
        "warning-outline": "var(--mv-color-warning-outline)",
        "danger-surface": "var(--mv-color-danger-surface)",
        "danger-outline": "var(--mv-color-danger-outline)",
        ring: "var(--mv-color-ring)",
      },
      borderRadius: {
        DEFAULT: "8px",
      },
      boxShadow: {
        DEFAULT: "var(--mv-shadow)",
        sm: "var(--mv-shadow-sm)",
        md: "var(--mv-shadow-md)",
        soft: "var(--mv-shadow-soft)",
      },
    },
  },
  plugins: [],
};

export default config;
