/**
 * Tiny dashboard theme. Two palettes (dark, light). Whole-theme swap
 * exercises styler's DynamicStyled cache-aware resolver (which is the
 * layer that regressed on bokisch.com).
 */

export interface Theme {
  bg: string
  panel: string
  fg: string
  muted: string
  accent: string
  border: string
  ok: string
  warn: string
  err: string
}

export const darkTheme: Theme = {
  bg: '#0b1020',
  panel: '#141b33',
  fg: '#e8ebf4',
  muted: '#6f78a2',
  accent: '#26d9a9',
  border: '#1e2947',
  ok: '#26d9a9',
  warn: '#e8b14b',
  err: '#e85b5b',
}

export const lightTheme: Theme = {
  bg: '#f5f6fa',
  panel: '#ffffff',
  fg: '#1a1e2e',
  muted: '#6f78a2',
  accent: '#126d5b',
  border: '#e1e4ec',
  ok: '#126d5b',
  warn: '#a77213',
  err: '#c14141',
}
