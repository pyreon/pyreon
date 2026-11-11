import type { InterpolationValues } from './types'

// Linear, ReDoS-safe: capture the inner text of `{{ … }}` with a single
// non-`{`/`}` character class (no ambiguous `\s*`/lazy backtracking on
// untrusted translation strings — see the CDN-sourced-messages threat model
// in create-i18n.ts), then parse key + optional format spec in code.
const INTERPOLATION_RE = /\{\{([^{}]+)\}\}/g
// A placeholder key is a single `\w+` token; anything else (`{{not a key}}`)
// is left literal. Anchored + single class → linear, not a ReDoS risk.
const KEY_RE = /^\w+$/

const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

/** Options for {@link interpolate}. */
export interface InterpolateOptions {
  /**
   * Resolver for inline format specs (`{{val, <spec>}}`). Receives the raw
   * value + the spec text; returns the formatted string. Supplied by the i18n
   * instance (bound to the current locale + configured formatters). When
   * absent (bare `interpolate()` use), specs are ignored and the value is
   * coerced plainly.
   */
  format?: (value: unknown, spec: string) => string
}

/**
 * One parsed `{{key}}` / `{{key, spec}}` placeholder. `spec` is the trimmed
 * text after the first comma (`undefined` when there is no comma).
 * @internal
 */
export interface Placeholder {
  whole: string
  key: string
  spec: string | undefined
}

/**
 * A template split once into alternating literal text and placeholders:
 * `lits[0] phs[0] lits[1] phs[1] … lits[n]` (`lits.length === phs.length + 1`;
 * a literal may be `''`). A `{{…}}` whose inner key is not a `\w+` token stays
 * inside the literal text (it is never substituted).
 * @internal
 */
export interface CompiledTemplate {
  lits: string[]
  phs: Placeholder[]
}

function parsePlaceholder(whole: string, inner: string): Placeholder | null {
  const commaIdx = inner.indexOf(',')
  const key = (commaIdx === -1 ? inner : inner.slice(0, commaIdx)).trim()
  // Not a `{{word}}` placeholder (e.g. `{{not a key}}`) — leave it literal.
  if (!KEY_RE.test(key)) return null
  const spec = commaIdx === -1 ? undefined : inner.slice(commaIdx + 1).trim()
  return { whole, key, spec }
}

/**
 * The substitution for one placeholder — shared by {@link interpolate} and the
 * compiled path in `create-i18n`, so the two cannot disagree.
 * @internal
 */
export function substitute(
  ph: Placeholder,
  values: InterpolationValues,
  format: ((value: unknown, ph: Placeholder) => string) | undefined,
): string {
  // Own-property check, NOT `value === undefined`: `values` is a user object,
  // so `values['toString']` / `['constructor']` / `['__proto__']` resolve to
  // inherited prototype members (all non-undefined). A placeholder colliding
  // with one of those names would otherwise interpolate the inherited value
  // (`{{toString}}` → the function source) instead of being left literal.
  if (!Object.hasOwn(values, ph.key)) return ph.whole
  const value = values[ph.key]
  if (value === undefined) return ph.whole

  // Inline format spec → delegate to the instance formatter.
  if (ph.spec && format) return formatGuarded(value, ph, format)
  // A string coerces to itself. Everything that can throw lives in the
  // helpers below, so this function has no try/catch and stays inlinable.
  return typeof value === 'string' ? value : coerce(value, ph)
}

function formatGuarded(
  value: unknown,
  ph: Placeholder,
  format: (value: unknown, ph: Placeholder) => string,
): string {
  try {
    return format(value, ph)
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      // oxlint-disable-next-line no-console
      console.warn(
        `[Pyreon i18n] failed to apply format "${ph.spec}" to "${ph.key}" — rendering the raw placeholder.`,
        err,
      )
    }
    return ph.whole
  }
}

/** Default coercion. Guard against malicious/throwing toString/valueOf. */
function coerce(value: unknown, ph: Placeholder): string {
  try {
    return typeof value === 'object' && value !== null ? JSON.stringify(value) : `${value as string}`
  } catch (err) {
    // Serialization failed (circular object, a Symbol coerced via `${value}`,
    // a throwing toString/valueOf). Falling back to the raw placeholder is
    // correct, but swallowing silently leaves the developer with `{{name}}`
    // rendered to end users and zero signal pointing at the cause.
    if (process.env.NODE_ENV !== 'production') {
      // oxlint-disable-next-line no-console
      console.warn(
        `[Pyreon i18n] interpolation value for "${ph.key}" is not serializable — rendering the raw placeholder. Pass a string/number, or pre-serialize the value.`,
        err,
      )
    }
    return ph.whole
  }
}

/**
 * Split a template into literal text and placeholders ONCE, so a message
 * rendered many times does not re-run the regex per render.
 * @internal
 */
export function compileTemplate(template: string): CompiledTemplate {
  const lits: string[] = []
  const phs: Placeholder[] = []
  let last = 0
  for (const m of template.matchAll(INTERPOLATION_RE)) {
    const ph = parsePlaceholder(m[0], m[1] as string)
    if (ph === null) continue // stays inside the literal run
    lits.push(template.slice(last, m.index))
    phs.push(ph)
    last = (m.index as number) + m[0].length
  }
  lits.push(template.slice(last))
  return { lits, phs }
}

/**
 * Render a {@link compileTemplate} result. Equivalent to
 * `interpolate(template, values, …)` for a non-empty `values`. Each step is a
 * single `a + b + c` so the engine builds one rope per placeholder.
 * @internal
 */
export function renderTemplate(
  tpl: CompiledTemplate,
  values: InterpolationValues,
  format: ((value: unknown, ph: Placeholder) => string) | undefined,
): string {
  const { lits, phs } = tpl
  let out = lits[0] as string
  for (let i = 0; i < phs.length; i++) {
    out = out + substitute(phs[i] as Placeholder, values, format) + (lits[i + 1] as string)
  }
  return out
}

/**
 * Replace `{{key}}` / `{{key, format}}` placeholders in a string.
 * Supports optional whitespace inside braces and an optional inline format
 * spec (resolved via `options.format`). Unmatched placeholders are left as-is.
 */
export function interpolate(
  template: string,
  values?: InterpolationValues,
  options?: InterpolateOptions,
): string {
  if (!values || !template.includes('{{')) return template
  // Per actual regex run — fast-path early-return above means this counter
  // only fires when interpolation work happens (template has `{{` and values
  // were provided).
  if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('i18n.interpolate')
  const userFormat = options?.format
  return renderTemplate(
    compileTemplate(template),
    values,
    userFormat ? (value, ph) => userFormat(value, ph.spec as string) : undefined,
  )
}
