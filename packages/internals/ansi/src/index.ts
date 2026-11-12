/**
 * `@pyreon/ansi` — the one terminal look for every Pyreon command.
 *
 * - `palette.ts`: `CLI_PALETTE` (seven roles, truecolor dark + light, the
 *   nearest xterm-256 index for each, and a 16-colour fallback), the
 *   `EMBER` brand ramp, `SYMBOLS` with ASCII fallbacks, and the six layout
 *   `RULES`.
 * - `detect.ts`: colour level (0 plain / 1 sixteen / 2 256 / 3 truecolor),
 *   terminal theme (`PYREON_CLI_THEME`, `COLORFGBG`), Unicode support
 *   (locale) and layout width (window columns, capped at 100).
 * - `gha.ts`: GitHub Actions annotations for `--gha`.
 * - `interrupt.ts`: the Ctrl-C verdict line and exit code 130.
 * - `term.ts`: `createTerm()` binds those to one terminal; `term` is the
 *   process's stdout.
 * - `layout.ts`: header, verdict, counts, aligned columns, finding block,
 *   score bar, code frame, word wrap.
 *
 * Private and bundled: every consumer lists it as a devDependency and its
 * build inlines it, so no published package depends on it at install time.
 * No runtime dependency (no chalk / kleur).
 */

export type { ColorLevel, Env, ThemeName } from './detect'
export {
  DEFAULT_WIDTH,
  detectColorLevel,
  detectTheme,
  detectUnicode,
  detectWidth,
  MIN_WIDTH,
  NARROW_WIDTH,
} from './detect'
export type { GhaAnnotation, GhaLevel } from './gha'
export { ghaAnnotation, ghaEscape, ghaLevel, ghaProperty } from './gha'
export type { InterruptOptions } from './interrupt'
export { onInterrupt } from './interrupt'
export type { Role, RoleColor, SymbolName } from './palette'
export { BACKGROUND, CLI_PALETTE, EMBER, hexToRgb, RULES, SYMBOLS, xterm256Rgb } from './palette'
export type { Paint, Term, TermOptions } from './term'
export {
  createTerm,
  fileUrl,
  padEndVisible,
  padStartVisible,
  stripAnsi,
  term,
  visibleWidth,
} from './term'
export type {
  Align,
  ColumnsOptions,
  Counts,
  FindingInput,
  FindingOptions,
  FrameInput,
  Location,
  Severity,
  SeverityStyle,
  VerdictStatus,
} from './layout'
export {
  bar,
  columns,
  finding,
  formatCounts,
  formatElapsed,
  formatLocation,
  frame,
  header,
  interrupted,
  meta,
  nothingTo,
  plural,
  severityMark,
  severityStyle,
  verdict,
  wrap,
  WRAP_WIDTH,
} from './layout'
