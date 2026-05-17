import type { InterpolationValues } from './types'

const INTERPOLATION_RE = /\{\{(\s*\w+\s*)\}\}/g

const __DEV__: boolean = process.env.NODE_ENV !== 'production'
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

/**
 * Replace `{{key}}` placeholders in a string with values from the given record.
 * Supports optional whitespace inside braces: `{{ name }}` works too.
 * Unmatched placeholders are left as-is.
 */
export function interpolate(template: string, values?: InterpolationValues): string {
  if (!values || !template.includes('{{')) return template
  // Per actual regex run — fast-path early-return above means this counter
  // only fires when interpolation work happens (template has `{{` and values
  // were provided).
  if (__DEV__) _countSink.__pyreon_count__?.('i18n.interpolate')
  return template.replace(INTERPOLATION_RE, (_, key: string) => {
    const trimmed = key.trim()
    const value = values[trimmed]
    if (value === undefined) return `{{${trimmed}}}`
    // Safely coerce — guard against malicious toString/valueOf
    try {
      return typeof value === 'object' && value !== null ? JSON.stringify(value) : `${value}`
    } catch (err) {
      // Serialization failed (circular object, a Symbol coerced via
      // `${value}`, a throwing toString/valueOf). Falling back to the raw
      // placeholder is correct, but swallowing silently leaves the
      // developer with `{{name}}` rendered to end users and zero signal
      // pointing at the cause. Surface it in dev.
      if (__DEV__) {
        // oxlint-disable-next-line no-console
        console.warn(
          `[Pyreon i18n] interpolation value for "${trimmed}" is not serializable — rendering the raw placeholder. Pass a string/number, or pre-serialize the value.`,
          err,
        )
      }
      return `{{${trimmed}}}`
    }
  })
}
