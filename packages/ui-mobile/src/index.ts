export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 6,
  md: 8,
  lg: 12,
} as const;

export const mobileThemeTokens = {
  light: {
    background: "#f6f5ef",
    surface: "#ffffff",
    text: "#171717",
    muted: "#6b7280",
    accent: "#2563eb",
    success: "#15803d",
    warning: "#b45309",
  },
  dark: {
    background: "#111827",
    surface: "#1f2937",
    text: "#f9fafb",
    muted: "#9ca3af",
    accent: "#38bdf8",
    success: "#4ade80",
    warning: "#fbbf24",
  },
} as const;
