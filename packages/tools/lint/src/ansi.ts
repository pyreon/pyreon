/**
 * Brand-palette ANSI helpers for `pyreon-lint` human output.
 *
 * Mirrors `@pyreon/cli`'s `doctor/render/ansi.ts` — self-contained
 * (no shared module: `@pyreon/lint` and `@pyreon/cli` are separate
 * published packages, and both deliberately avoid a runtime ANSI
 * dependency). The escapes are tiny and stable.
 *
 * Colors follow the Pyreon brand handoff (committed in #651; CLI spec
 * §6.5). Brand tokens are 24-bit hex, but the handoff is explicit:
 * **"256-color terminal palette must survive (no truecolor-only
 * colors)."** Each role maps to its nearest xterm-256 index and is
 * emitted as an 8-bit SGR (`38;5;N`) — identical on truecolor
 * terminals, still correct on 256-only ones. No `38;2;r;g;b`.
 *
 * | role          | brand token | hex     | 256 |
 * |---------------|-------------|---------|-----|
 * | error / `✗`   | ember-core  | #FF5E1A | 202 |
 * | warning / `!` | ember-warm  | #FFC83D | 220 |
 * | info / `ℹ`    | cyan        | #22D3EE | 45  |
 *
 * Ember stays scarce by construction (only the error + warning
 * severities, never decoration), exactly as the brand mandates.
 *
 * Gating (was previously ABSENT in the lint reporter — it always
 * emitted raw `\x1b[31m` even when piped / `NO_COLOR`):
 *   - `NO_COLOR`            → off (de-facto standard)
 *   - `FORCE_COLOR=0` / set → off / on
 *   - else `process.stdout.isTTY`
 */
const ESC = String.fromCharCode(27)
const CSI = `${ESC}[`

const isColorEnabled = (): boolean => {
  if (process.env.NO_COLOR) return false
  if (process.env.FORCE_COLOR === '0') return false
  if (process.env.FORCE_COLOR) return true
  return Boolean(process.stdout.isTTY)
}

export const colorEnabled = isColorEnabled()

const wrap =
  (open: string, close: string) =>
  (s: string): string =>
    colorEnabled ? `${CSI}${open}m${s}${CSI}${close}m` : s

const c256 = (code: number) => wrap(`38;5;${code}`, '39')

export const bold = wrap('1', '22')
export const dim = wrap('2', '22')
export const emberCore = c256(202) // errors
export const emberWarm = c256(220) // warnings
export const cyan = c256(45) // info
