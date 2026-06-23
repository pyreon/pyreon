import type { InterpolationValues } from './types'

// `{{ key }}` or `{{ key, format spec }}` — group 1 is the key, group 2 is the
// optional inline format spec (everything after the first comma, e.g.
// `currency` or `relativetime, day`). `[^}]+?` keeps the spec from swallowing
// the closing braces.
const INTERPOLATION_RE = /\{\{\s*(\w+)\s*(?:,\s*([^}]+?)\s*)?\}\}/g

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
  return template.replace(INTERPOLATION_RE, (_, key: string, spec: string | undefined) => {
    const placeholder = spec ? `{{${key}, ${spec}}}` : `{{${key}}}`
    const value = values[key]
    if (value === undefined) return placeholder

    // Inline format spec → delegate to the instance formatter.
    if (spec && options?.format) {
      try {
        return options.format(value, spec)
      } catch (err) {
        if (process.env.NODE_ENV !== 'production') {
          // oxlint-disable-next-line no-console
          console.warn(
            `[Pyreon i18n] failed to apply format "${spec}" to "${key}" — rendering the raw placeholder.`,
            err,
          )
        }
        return placeholder
      }
    }

    // Default coercion. Guard against malicious/throwing toString/valueOf.
    try {
      return typeof value === 'object' && value !== null ? JSON.stringify(value) : `${value}`
    } catch (err) {
      // Serialization failed (circular object, a Symbol coerced via `${value}`,
      // a throwing toString/valueOf). Falling back to the raw placeholder is
      // correct, but swallowing silently leaves the developer with `{{name}}`
      // rendered to end users and zero signal pointing at the cause.
      if (process.env.NODE_ENV !== 'production') {
        // oxlint-disable-next-line no-console
        console.warn(
          `[Pyreon i18n] interpolation value for "${key}" is not serializable — rendering the raw placeholder. Pass a string/number, or pre-serialize the value.`,
          err,
        )
      }
      return placeholder
    }
  })
}
