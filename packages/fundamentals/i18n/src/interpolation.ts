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
    } catch {
      return `{{${trimmed}}}`
    }
  })
}
