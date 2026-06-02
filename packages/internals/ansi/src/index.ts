/**
 * Brand-palette ANSI helpers — single canonical surface for every
 * Pyreon CLI / reporter that emits colored terminal output.
 *
 * Replaces the previously-duplicated `packages/tools/lint/src/ansi.ts`
 * and `packages/tools/cli/src/doctor/render/ansi.ts`. Both files
 * shipped the same brand-token-to-xterm-256 mapping with the same
 * gating logic; the CLI's version added OSC-8 hyperlink + `file://`
 * URL helpers on top. This package is the CLI superset, plus the two
 * `emberCore` / `emberWarm` aliases the lint reporter used so the
 * migration is non-breaking.
 *
 * Deliberately no runtime ANSI dependency (no `chalk` / `kleur`). The
 * escapes are tiny and stable; downstream packages stay zero-dep at
 * the runtime layer.
 *
 * ## Brand palette → xterm-256
 *
 * Source: the Claude Design brand handoff (committed in #651; CLI
 * spec §6.5 / `pyr doctor` §6.6). Brand colors are 24-bit hex, but
 * the handoff is explicit: **"256-color terminal palette must survive
 * (no truecolor-only colors)."** Every brand role maps to its nearest
 * xterm-256 index and is emitted as an 8-bit SGR (`38;5;N`) —
 * identical on truecolor terminals, still correct on 256-only ones.
 * No `38;2;r;g;b`.
 *
 * | brand token  | hex     | 256 | role                               |
 * |--------------|---------|-----|------------------------------------|
 * | ember-core   | #FF5E1A | 202 | errors / fail grade / `✗`          |
 * | ember-warm   | #FFC83D | 220 | warnings · hints · `!`             |
 * | ember-plasma | #FF1F8C | 198 | reserved accent                    |
 * | ok-green     | #4ADE80 | 78  | pass / grade A / `✓`               |
 * | cyan         | #22D3EE | 45  | info · links · prompt `$`          |
 * | muted-2      | #8A8696 | 245 | separators · headings · skipped    |
 *
 * Ember stays scarce by construction, exactly as the brand mandates:
 * it only colors error/fail states + the worst grade, never decoration.
 *
 * ## Severity glyphs (handoff §6.5)
 *
 * `✗` ember-core (error), `!` ember-warm (warning), `ℹ` cyan (info).
 * Exported as `SEVERITY_GLYPH` for consumers that key off the standard
 * three severities.
 *
 * ## Color-enabled gate
 *
 * - `NO_COLOR`            → off (de-facto standard)
 * - `FORCE_COLOR=0` / set → off / on
 * - else `process.stdout.isTTY`
 *
 * CI tools like GitHub Actions set `CI=1` but their terminal DOES
 * render ANSI — so CI alone doesn't disable color.
 */

// ANSI control codes. ESC (char 27 / 0x1B) + open-bracket (CSI) for
// SGR codes; ESC + close-bracket-8 for OSC-8 hyperlinks. We build the
// strings via `String.fromCharCode(27)` rather than `\x1b` literals
// so the source code stays free of non-printable bytes (some editors
// + lint rules complain about raw ESC).
const ESC = String.fromCharCode(27)
const CSI = `${ESC}[`
const OSC = `${ESC}]`
// String terminator — ESC + backslash. BEL also works in most
// terminals but ESC-\ is the spec-compliant form.
const ST = `${ESC}\\`

/* v8 ignore start — env-var detection captured once at module load;
 * vitest runs under Node without a TTY by default so the NO_COLOR /
 * FORCE_COLOR branches need separate isolated subprocess tests to
 * exercise. Tested via the `colorEnabled` boolean shape in
 * src/tests/ansi.test.ts. */
const isColorEnabled = (): boolean => {
  if (process.env.NO_COLOR) return false
  if (process.env.FORCE_COLOR === '0') return false
  if (process.env.FORCE_COLOR) return true
  return Boolean(process.stdout.isTTY)
}
/* v8 ignore stop */

export const colorEnabled = isColorEnabled()

const wrap =
  (open: string, close: string) =>
  (s: string): string =>
    /* v8 ignore next 2 — colorEnabled=true path requires real TTY or
     * FORCE_COLOR=1; tested via the `colorEnabled` boolean + shape
     * assertions in src/tests/ansi.test.ts. */
    colorEnabled ? `${CSI}${open}m${s}${CSI}${close}m` : s

const c256 = (code: number) => wrap(`38;5;${code}`, '39')

export const bold = wrap('1', '22')
export const dim = wrap('2', '22')

// Canonical brand palette. The names match the brand token role so
// downstream callers can read intent at the use site.
export const red = c256(202) // ember-core
export const green = c256(78) // ok-green
export const yellow = c256(220) // ember-warm
export const blue = c256(45) // cyan (brand has no blue; cool accent)
export const magenta = c256(198) // ember-plasma
export const cyan = c256(45) // brand cyan
export const gray = c256(245) // muted-2

// Brand-token aliases — kept for the lint reporter's existing import
// shape (`emberCore` / `emberWarm`). Reads identically to `red` /
// `yellow` above; the duplicate name is intentional so consumers can
// choose the form that documents intent best at the call site.
export const emberCore = red
export const emberWarm = yellow

/**
 * Severity → glyph map. Matches the handoff §6.5 status symbols.
 * Consumers should color the glyph with the matching brand helper
 * (`emberCore` for `error`, `emberWarm` for `warning`, `cyan` for
 * `info`).
 */
export const SEVERITY_GLYPH = {
  error: '✗', // ✗
  warning: '!',
  info: 'ℹ', // ℹ
} as const

/**
 * OSC-8 hyperlink. iTerm2, WezTerm, kitty, modern VSCode terminals
 * render this as a clickable link; other terminals show the visible
 * text and ignore the escape. We use this for file paths so the user
 * can cmd-click a finding's location and jump to it.
 *
 * `url` should be a `file://` URL with optional line/column:
 *   `file:///path/to/file.ts#L42`
 */
export const hyperlink = (text: string, url: string): string => {
  if (!colorEnabled) return text
  /* v8 ignore next — colorEnabled=true path requires real TTY. */
  return `${OSC}8;;${url}${ST}${text}${OSC}8;;${ST}`
}

/** Build a `file://` URL with optional line / column suffix. */
export const fileUrl = (
  absPath: string,
  line?: number,
  _column?: number,
): string => {
  // file:// URLs don't have a standard line/column shape across
  // terminals; vscode uses `#L<line>`, iTerm2 + others use `:line:col`
  // in the visible text but not the URL. We embed `#L<line>` since
  // it's the form VSCode parses natively (the most common consumer).
  let url = `file://${absPath}`
  if (line !== undefined) url += `#L${line}`
  return url
}
