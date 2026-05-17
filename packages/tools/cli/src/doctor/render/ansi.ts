/**
 * Minimal ANSI helpers for `pyreon doctor` human output.
 *
 * We deliberately don't pull in `chalk` / `kleur` / etc. — the doctor
 * already lives in `@pyreon/cli` (the entrypoint package) and adding
 * a runtime ANSI library bumps the install footprint. The escapes
 * are tiny and stable.
 *
 * The `enabled` flag respects:
 *   - `NO_COLOR=1`            → disable (de-facto standard)
 *   - `FORCE_COLOR=1` / `0`   → force on / off
 *   - `process.stdout.isTTY`  → default if no override
 *   - CI tools like GitHub Actions set `CI=1` but their terminal DOES
 *     render ANSI — so CI alone doesn't disable color.
 */

// ANSI control codes. ESC (char 27 / 0x1B) + open-bracket (CSI) for
// SGR codes; ESC + close-bracket-8 for OSC-8 hyperlinks. We build the
// strings via `String.fromCharCode(27)` rather than `` literals
// so the source code stays free of non-printable bytes (some editors
// + lint rules complain about raw ESC).
const ESC = String.fromCharCode(27)
const CSI = `${ESC}[`
const OSC = `${ESC}]`
// String terminator — ESC + backslash. BEL also works in most
// terminals but ESC-\ is the spec-compliant form.
const ST = `${ESC}\\`

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

export const bold = wrap('1', '22')
export const dim = wrap('2', '22')
export const red = wrap('31', '39')
export const green = wrap('32', '39')
export const yellow = wrap('33', '39')
export const blue = wrap('34', '39')
export const magenta = wrap('35', '39')
export const cyan = wrap('36', '39')
export const gray = wrap('90', '39')

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
