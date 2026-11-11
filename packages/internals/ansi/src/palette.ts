/**
 * The one palette and symbol set for every Pyreon command. Source: the
 * CLI design (`Terminal.html` + `cli-theme.ts` in the design handoff).
 *
 * Each role has a truecolor value for a dark and a light terminal
 * background, the xterm-256 index nearest to each (for terminals that
 * advertise 256 colours but not truecolor, such as macOS Terminal), and the
 * 16-colour SGR code used below that. In 16 colours the terminal's own
 * palette already adapts to its background, so one code serves both themes.
 *
 * The 256 indexes are fixed palette entries 16–255 (never 0–15, which the
 * user's theme redefines). Each is the CIEDE2000-nearest entry to the
 * truecolor value that keeps the role's contrast on the design's terminal
 * background (`#0B0B10` dark, `#FBF8F1` light): at least 4.5:1 for text
 * roles, 3:1 for `gray`. One exception, chosen for distinctness: dark `gray`
 * takes its second-nearest entry (244) so it does not collapse into `dim`
 * (103). `src/tests/palette-256.test.ts` recomputes all of it.
 */

export type Role = 'accent' | 'ok' | 'warn' | 'err' | 'info' | 'dim' | 'gray'

export interface RoleColor {
  /** Truecolor value on a dark background. */
  readonly dark: string
  /** Truecolor value on a light background (passes contrast on #FBF8F1). */
  readonly light: string
  /** xterm-256 index nearest to `dark` / `light` (see the header). */
  readonly x256: { readonly dark: number; readonly light: number }
  /** 16-colour foreground SGR code. */
  readonly sgr16: number
}

export const CLI_PALETTE: Readonly<Record<Role, RoleColor>> = {
  /** Ember core: prompts, the active choice, `▸` steps. Never a state. */
  accent: { dark: '#FF5E1A', light: '#B43A0E', x256: { dark: 202, light: 160 }, sgr16: 31 },
  ok: { dark: '#4ADE80', light: '#15703A', x256: { dark: 78, light: 22 }, sgr16: 32 },
  warn: { dark: '#FACC15', light: '#8A5A00', x256: { dark: 220, light: 94 }, sgr16: 33 },
  err: { dark: '#F87171', light: '#B91C1C', x256: { dark: 203, light: 124 }, sgr16: 31 },
  /** Info, and file paths (OSC 8 links). */
  info: { dark: '#22D3EE', light: '#0A6E89', x256: { dark: 45, light: 24 }, sgr16: 36 },
  /** Metadata, timings, hints. */
  dim: { dark: '#8A8696', light: '#5E5A69', x256: { dark: 103, light: 59 }, sgr16: 90 },
  /** Bar tracks, frames, unselected choices. */
  gray: { dark: '#7E7A8C', light: '#6E6A78', x256: { dark: 244, light: 242 }, sgr16: 90 },
}

/** The brand ember ramp. Decoration only: it never carries meaning. */
export const EMBER = {
  plasma: { hex: '#FF1F8C', x256: 198, sgr16: 35 },
  core: { hex: '#FF5E1A', x256: 202, sgr16: 31 },
  warm: { hex: '#FFC83D', x256: 221, sgr16: 33 },
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

/**
 * The terminal backgrounds the palette is checked against (the design's
 * `--tbg`). Every text role passes 4.5:1 on its own background at truecolor
 * and at 256 colours.
 */
export const BACKGROUND = { dark: '#0B0B10', light: '#FBF8F1' } as const

const CUBE = [0, 95, 135, 175, 215, 255] as const

/** The RGB value xterm assigns to a fixed 256-colour index (16–255). */
export const xterm256Rgb = (index: number): readonly [number, number, number] => {
  if (index >= 232) {
    const v = 8 + 10 * (index - 232)
    return [v, v, v]
  }
  const i = index - 16
  return [CUBE[Math.floor(i / 36)] ?? 0, CUBE[Math.floor(i / 6) % 6] ?? 0, CUBE[i % 6] ?? 0]
}

/** Parse `#RRGGBB` into its three channels. */
export const hexToRgb = (hex: string): readonly [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
