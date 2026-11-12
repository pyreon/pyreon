/**
 * A `Term` binds the palette and symbols to one terminal's capabilities:
 * colour level, background theme, Unicode support and layout width. Every renderer takes
 * a `Term` (defaulting to the process's stdout), so output is a pure
 * function of (data, term) and snapshot-testable at every level.
 */

import {
  type ColorLevel,
  detectColorLevel,
  detectTheme,
  detectUnicode,
  detectWidth,
  type Env,
  type ThemeName,
} from './detect'
import { CLI_PALETTE, EMBER, hexToRgb, type Role, SYMBOLS, type SymbolName } from './palette'

// ESC built from its char code so the source stays free of raw control bytes.
const ESC = String.fromCharCode(27)
const CSI = `${ESC}[`
const OSC = `${ESC}]`
const ST = `${ESC}\\`

export type Paint = (s: string) => string

export interface Term {
  readonly level: ColorLevel
  readonly theme: ThemeName
  readonly unicode: boolean
  /**
   * Layout width in columns: the window's width capped at 100, or 100 when
   * the stream reports none (a pipe). Never below 40.
   */
  readonly width: number
  /** `level > 0`. */
  readonly color: boolean
  /** Colour `s` in a palette role (identity at level 0). */
  paint(role: Role, s: string): string
  readonly accent: Paint
  readonly ok: Paint
  readonly warn: Paint
  readonly err: Paint
  readonly info: Paint
  readonly dim: Paint
  readonly gray: Paint
  readonly bold: Paint
  readonly underline: Paint
  /** Colour `s` in a brand ember tone (decoration only). */
  ember(tone: keyof typeof EMBER, s: string): string
  /** The symbol, or its ASCII fallback when the locale is not UTF-8. */
  sym(name: SymbolName): string
  /** OSC 8 hyperlink when colour is on; the bare text otherwise. */
  link(text: string, url: string): string
}

export interface TermOptions {
  level?: ColorLevel | undefined
  theme?: ThemeName | undefined
  unicode?: boolean | undefined
  /** Defaults to `process.env`. */
  env?: Env | undefined
  /** Defaults to `process.stdout.isTTY`. */
  isTTY?: boolean | undefined
  /** Defaults to `process.platform`. */
  platform?: string | undefined
  /** Layout width; detected from `columns` / `PYREON_CLI_WIDTH` when left out. */
  width?: number | undefined
  /** The stream's column count. Defaults to `process.stdout.columns`. */
  columns?: number | undefined
}

const fg = (level: ColorLevel, hex: string, x256: number, sgr16: number): string => {
  if (level === 3) {
    const [r, g, b] = hexToRgb(hex)
    return `38;2;${r};${g};${b}`
  }
  if (level === 2) return `38;5;${x256}`
  return String(sgr16)
}

const sgr =
  (enabled: boolean, open: string, close: string): Paint =>
  (s) =>
    enabled && s !== '' ? `${CSI}${open}m${s}${CSI}${close}m` : s

/** Build a `Term`. Any capability not given is detected from the environment. */
export function createTerm(opts: TermOptions = {}): Term {
  const env = opts.env ?? process.env
  const isTTY = opts.isTTY ?? Boolean(process.stdout?.isTTY)
  const level = opts.level ?? detectColorLevel(env, isTTY)
  const theme = opts.theme ?? detectTheme(env)
  const unicode = opts.unicode ?? detectUnicode(env, opts.platform ?? process.platform)
  // The real window's columns only when the stream was detected, not given:
  // a caller that passes `isTTY` is describing some other terminal.
  const columns = opts.columns ?? (opts.isTTY === undefined && isTTY ? process.stdout?.columns : undefined)
  const width = opts.width ?? detectWidth(env, columns)
  const on = level > 0

  const roles = {} as Record<Role, Paint>
  for (const role of Object.keys(CLI_PALETTE) as Role[]) {
    const c = CLI_PALETTE[role]
    roles[role] = sgr(on, fg(level, c[theme], c.x256[theme], c.sgr16), '39')
  }
  const embers = {} as Record<keyof typeof EMBER, Paint>
  for (const tone of Object.keys(EMBER) as Array<keyof typeof EMBER>) {
    const e = EMBER[tone]
    embers[tone] = sgr(on, fg(level, e.hex, e.x256, e.sgr16), '39')
  }

  return {
    level,
    theme,
    unicode,
    width,
    color: on,
    paint: (role, s) => roles[role](s),
    ...roles,
    bold: sgr(on, '1', '22'),
    underline: sgr(on, '4', '24'),
    ember: (tone, s) => embers[tone](s),
    sym: (name) => SYMBOLS[name][unicode ? 0 : 1],
    link: (text, url) => (on ? `${OSC}8;;${url}${ST}${text}${OSC}8;;${ST}` : text),
  }
}

/** Build a `file://` URL; `#L<line>` is the form VS Code parses. */
export const fileUrl = (absPath: string, line?: number): string =>
  line === undefined ? `file://${absPath}` : `file://${absPath}#L${line}`

const ANSI_RE = new RegExp(`${ESC}\\[[0-9;?]*[A-Za-z]|${ESC}\\]8;;[^${ESC}]*${ESC}\\\\`, 'g')

/** Remove SGR and OSC 8 sequences. */
export const stripAnsi = (s: string): string => s.replace(ANSI_RE, '')

/** Width in terminal columns, ignoring escape sequences (one column per code point). */
export const visibleWidth = (s: string): number => {
  let n = 0
  for (const _ of stripAnsi(s)) n++
  return n
}

export const padEndVisible = (s: string, width: number): string =>
  s + ' '.repeat(Math.max(0, width - visibleWidth(s)))

export const padStartVisible = (s: string, width: number): string =>
  ' '.repeat(Math.max(0, width - visibleWidth(s))) + s

/** The terminal behind `process.stdout`, detected once at module load. */
export const term: Term = createTerm()
