import { sanitizeStyle } from '../sanitize'

/**
 * The ONE sanitising funnel every style-position value in the `html` and
 * `email` renderers goes through.
 *
 * PR #3435 guarded `TableColumn.width` breaking out of a `style` attribute.
 * The FIELD was fixed; the CLASS was not — every adjacent value in the same
 * template literals (`col.align`, `thickness`, `spacer.height`, the button's
 * `align`/`padding`/`borderRadius`, and in `email` the whole of `heading`,
 * `text`, `section` and `image`) reached an attribute raw and broke out the
 * same way. Enumerating fields is how that happens; a funnel is how it stops.
 *
 * So: no style-position value is interpolated at a call site. It goes through
 * `styleDecls` / `cssDecl` (string values → `sanitizeStyle`, numbers → `px`),
 * or — where the template supplies the unit itself (`${size}px`) — through
 * `sanitizeNumber`, which cannot produce a quote at all.
 */

/** Raw `prop:value` declarations, semicolon-joined, with no attribute wrapper. */
export function styleDecls(styles: Record<string, string | number | undefined>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(styles)) {
    if (v != null && v !== '') {
      const prop = k.replace(/([A-Z])/g, '-$1').toLowerCase()
      // String values can be document-author / CMS controlled (column
      // `width`, `align`, `gap`, …) and land inside a `style="…"`
      // attribute. Without sanitization `width: 'x"><script>…'` breaks
      // out of the attribute → XSS in the produced HTML (emailed /
      // served). `sanitizeStyle` strips `" < > ; ( ) \ '` + css injection
      // vectors. Numbers are structurally safe, EXCEPT that `NaN`/`Infinity`
      // are numbers too and are not valid CSS — drop them.
      const safeV =
        typeof v === 'number' ? (Number.isFinite(v) ? `${v}px` : '') : sanitizeStyle(String(v))
      if (safeV !== '') parts.push(`${prop}:${safeV}`)
    }
  }
  return parts.join(';')
}

/** A full ` style="…"` attribute, or `''` when nothing survived sanitization. */
export function styleStr(styles: Record<string, string | number | undefined>): string {
  const decls = styleDecls(styles)
  return decls.length > 0 ? ` style="${decls}"` : ''
}

/**
 * ONE sanitized `prop:value;` fragment — the funnel for the renderers that
 * concatenate declarations by hand (the table cells, the email tree) instead
 * of building a record. Returns `''` when the value is absent or nothing
 * survives sanitization, so it drops cleanly out of a template literal.
 */
export function cssDecl(prop: string, value: string | number | undefined): string {
  const decl = styleDecls({ [prop]: value })
  return decl === '' ? '' : `${decl};`
}

/**
 * Box shorthand from a numeric scalar / 2-tuple / 4-tuple. Every element is
 * coerced with `sanitizeNumber`: the tuple is typed numeric but reaches the
 * renderers from an untyped document tree, and `padding: ['1px" onload="…', 2]`
 * interpolated raw. A non-finite element drops the whole shorthand rather than
 * emitting a partial one.
 */
export function padStr(
  pad: number | [number, number] | [number, number, number, number] | undefined,
): string | undefined {
  if (pad == null) return undefined
  if (!Array.isArray(pad)) {
    const n = sanitizeNumber(pad)
    return n == null ? undefined : `${n}px`
  }
  const nums = pad.map((v) => sanitizeNumber(v))
  if (nums.some((n) => n == null)) return undefined
  return nums.map((n) => `${n}px`).join(' ')
}

/**
 * Coerce a numerically-typed field to a finite number, or `fallback`
 * (default `undefined`) when it is not one.
 *
 * `width`, `height`, `thickness`, `borderRadius`, `size`, `lineHeight` and
 * `level` are all typed `number`, but a document tree is data — it arrives
 * from JSON, a CMS or plain JS, so the type is a claim rather than a
 * guarantee. Interpolated raw into `width="…"` or `${v}px`, a string value
 * closes the attribute (`width="1" onerror="alert(1)"`). A finite number
 * cannot contain a quote, so this is a total guard for those positions.
 */
export function sanitizeNumber(value: unknown): number | undefined
export function sanitizeNumber(value: unknown, fallback: number): number
export function sanitizeNumber(value: unknown, fallback?: number): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

/** `<h1>`…`<h6>` — clamp an out-of-contract `level` so it cannot reach the TAG. */
export function headingTag(level: unknown): string {
  const n = sanitizeNumber(level, 1)
  return `h${Math.min(Math.max(Math.round(n), 1), 6)}`
}
