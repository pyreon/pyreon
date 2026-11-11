/**
 * Terminal capability detection: colour level, background theme and
 * Unicode support. Every function is pure over the `env` / `isTTY` /
 * `platform` it is given, so tests pass explicit inputs instead of
 * mutating `process`.
 */

/** 0 = plain, 1 = 16-colour SGR, 2 = truecolor (24-bit). */
export type ColorLevel = 0 | 1 | 2

/** The terminal background the palette is tuned for. */
export type ThemeName = 'dark' | 'light'

export type Env = Readonly<Record<string, string | undefined>>

const isSet = (v: string | undefined): v is string => v !== undefined && v !== ''

const supportsTruecolor = (env: Env): boolean => {
  const colorterm = (env.COLORTERM ?? '').toLowerCase()
  if (colorterm === 'truecolor' || colorterm === '24bit') return true
  const term = (env.TERM ?? '').toLowerCase()
  return term.endsWith('-direct') || term.includes('truecolor') || term.includes('24bit')
}

/**
 * The colour level for a stream.
 *
 * - `NO_COLOR` (any non-empty value, https://no-color.org) → 0.
 * - `TERM=dumb` → 0.
 * - `FORCE_COLOR=0` / `false` → 0.
 * - Not a TTY and not forced → 0: escape codes never reach a pipe or a file
 *   unless asked for.
 * - `FORCE_COLOR=3`, or a terminal advertising 24-bit colour
 *   (`COLORTERM=truecolor|24bit`, a `*-direct` TERM) → 2.
 * - Otherwise → 1 (16 colours, which every colour terminal renders).
 */
export function detectColorLevel(env: Env, isTTY: boolean): ColorLevel {
  if (isSet(env.NO_COLOR)) return 0
  if (env.TERM === 'dumb') return 0
  const force = env.FORCE_COLOR
  if (force === '0' || force === 'false') return 0
  const forced = isSet(force)
  if (!isTTY && !forced) return 0
  if (force === '3' || supportsTruecolor(env)) return 2
  return 1
}

/**
 * The terminal background. A terminal cannot be asked reliably, so the
 * default is dark. `PYREON_CLI_THEME=light|dark` wins; otherwise
 * `COLORFGBG` ("fg;bg", set by rxvt, Konsole and others) decides with the
 * same rule as Vim: background 0–6 or 8 is dark, anything else light.
 */
export function detectTheme(env: Env): ThemeName {
  const explicit = (env.PYREON_CLI_THEME ?? '').toLowerCase()
  if (explicit === 'light' || explicit === 'dark') return explicit
  const fgbg = env.COLORFGBG
  if (isSet(fgbg)) {
    const bg = Number(fgbg.split(';').pop())
    if (Number.isInteger(bg) && bg >= 0 && bg <= 15) {
      return bg <= 6 || bg === 8 ? 'dark' : 'light'
    }
  }
  return 'dark'
}

/**
 * Whether the terminal can render the Unicode symbols. `PYREON_CLI_SYMBOLS
 * =ascii|unicode` wins. On POSIX the locale decides (the first of
 * `LC_ALL`, `LC_CTYPE`, `LANG` that is set must name UTF-8); with no locale
 * at all, only the Linux console is treated as ASCII. On Windows, the
 * terminals known to render Unicode are Windows Terminal, VS Code,
 * ConEmu, and anything that sets `TERM` (mintty, MSYS) or runs in CI.
 */
export function detectUnicode(env: Env, platform: string): boolean {
  const explicit = (env.PYREON_CLI_SYMBOLS ?? '').toLowerCase()
  if (explicit === 'ascii') return false
  if (explicit === 'unicode') return true
  if (platform === 'win32') {
    return (
      isSet(env.WT_SESSION) ||
      env.TERM_PROGRAM === 'vscode' ||
      env.ConEmuTask === '{cmd::Cmder}' ||
      isSet(env.TERM) ||
      isSet(env.CI)
    )
  }
  const locale = [env.LC_ALL, env.LC_CTYPE, env.LANG].find(isSet)
  if (locale !== undefined) return /utf-?8/i.test(locale)
  return env.TERM !== 'linux'
}
