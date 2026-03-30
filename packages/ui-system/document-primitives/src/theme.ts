export const documentTheme = {
  colors: {
    primary: "#4f46e5",
    text: "#333333",
    textSecondary: "#666666",
    background: "#ffffff",
    border: "#dddddd",
    headerBg: "#1a1a2e",
    headerText: "#ffffff",
    stripedRow: "#f9f9f9",
  },
  fonts: {
    heading: "system-ui, -apple-system, sans-serif",
    body: "system-ui, -apple-system, sans-serif",
    mono: "ui-monospace, monospace",
  },
  sizes: {
    h1: 32,
    h2: 24,
    h3: 20,
    h4: 18,
    h5: 16,
    h6: 14,
    body: 14,
    caption: 12,
    label: 11,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 40,
  },
};

export type DocumentTheme = typeof documentTheme;
