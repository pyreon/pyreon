/**
 * The one palette and symbol set for every Pyreon command. Source: the
 * CLI design (`Terminal.html` + `cli-theme.ts` in the design handoff).
 *
 * Each role has a truecolor value for a dark and a light terminal
 * background, and the 16-colour SGR code used when truecolor is not
 * available. In 16 colours the terminal's own palette already adapts to its
 * background, so one code serves both themes.
 */

export type Role = 'accent' | 'ok' | 'warn' | 'err' | 'info' | 'dim' | 'gray'

export interface RoleColor {
  /** Truecolor value on a dark background. */
  readonly dark: string
  /** Truecolor value on a light background (passes contrast on #FBF8F1). */
  readonly light: string
  /** 16-colour foreground SGR code. */
  readonly sgr16: number
}

export const CLI_PALETTE: Readonly<Record<Role, RoleColor>> = {
  /** Ember core: prompts, the active choice, `▸` steps. Never a state. */
  accent: { dark: '#FF5E1A', light: '#B43A0E', sgr16: 31 },
  ok: { dark: '#4ADE80', light: '#15703A', sgr16: 32 },
  warn: { dark: '#FACC15', light: '#8A5A00', sgr16: 33 },
  err: { dark: '#F87171', light: '#B91C1C', sgr16: 31 },
  /** Info, and file paths (OSC 8 links). */
  info: { dark: '#22D3EE', light: '#0A6E89', sgr16: 36 },
  /** Metadata, timings, hints. */
  dim: { dark: '#8A8696', light: '#5E5A69', sgr16: 90 },
  /** Bar tracks, frames, unselected choices. */
  gray: { dark: '#7E7A8C', light: '#6E6A78', sgr16: 90 },
}

/** The brand ember ramp. Decoration only: it never carries meaning. */
export const EMBER = {
  plasma: { hex: '#FF1F8C', sgr16: 35 },
  core: { hex: '#FF5E1A', sgr16: 31 },
  warm: { hex: '#FFC83D', sgr16: 33 },
} as const

/** Unicode symbol and its ASCII fallback for a non-UTF-8 locale. */
export const SYMBOLS = {
  ok: ['✓', 'v'],
  err: ['✗', 'x'],
  warn: ['!', '!'],
  info: ['ℹ', 'i'],
  step: ['▸', '>'],
  at: ['↳', '->'],
  promptActive: ['◆', '*'],
  promptDone: ['◇', 'o'],
  selected: ['●', '(*)'],
  unselected: ['○', '( )'],
  barFull: ['█', '#'],
  barEmpty: ['░', '.'],
  frameTop: ['╭─', '+-'],
  frameSide: ['│', '|'],
  frameBottom: ['╰─', '+-'],
  bullet: ['·', '-'],
  dash: ['—', '-'],
  arrow: ['→', '->'],
} as const satisfies Record<string, readonly [string, string]>

export type SymbolName = keyof typeof SYMBOLS

/** The layout rules every Pyreon command follows. */
export const RULES = [
  'First line: what ran (bold name · dim context). Last line: verdict, counts, elapsed.',
  'Two-space indent; label column padded to the longest label; numbers right-aligned.',
  'Every coloured state also has a symbol and a word. NO_COLOR output is complete.',
  'Every finding: symbol · gate/rule · message, then ↳ file:line:col, then fix: <change>.',
  'Human text for people, --json for tools, --gha for GitHub annotations. Never parse the text.',
  'Wrap at 100 columns; never truncate paths.',
] as const

/** Parse `#RRGGBB` into its three channels. */
export const hexToRgb = (hex: string): readonly [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
