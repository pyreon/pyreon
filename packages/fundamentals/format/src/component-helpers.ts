/**
 * Internal helpers of the components, kept out of the public entry (`@pyreon/format/components` exports only `Num`,
 * `DateTime` and their prop and parts types). Imported by `components.ts` and by the tests.
 */
import type { VNodeChild } from '@pyreon/core'
import { formatDate, formatDateTime, formatTime } from './index'
import { lastWasPlain, lastWasTimeOnly, toMillis } from './input'
import type { DateFormatter } from './components'
import type { DateInput, DateStylePreset } from './types'

/**
 * The formatted parts as children: parts without a wrapper are joined into ONE
 * string (adjacent text nodes would merge in server HTML and break hydration),
 * wrapped parts become the wrapper's output.
 */
export function partsToChildren(
  parts: readonly { type: string; value: string }[],
  wrap: { readonly [type: string]: ((text: string) => VNodeChild) | undefined },
): VNodeChild[] {
  const out: VNodeChild[] = []
  let text = ''
  for (const part of parts) {
    const wrapper = Object.hasOwn(wrap, part.type) ? wrap[part.type] : undefined
    if (wrapper === undefined) {
      text += part.value
      continue
    }
    if (text !== '') {
      out.push(text)
      text = ''
    }
    out.push(wrapper(part.value))
  }
  if (text !== '') out.push(text)

  return out
}

/**
 * The unambiguous reading of a value for a `title`: the full date, and for an instant the time with its zone name
 * (a calendar value has no zone, so none is shown). `undefined` for a missing or invalid value.
 */
export function exactTitle(
  value: DateInput,
  format: DateStylePreset | DateFormatter | undefined,
  locale: string | undefined,
  timeZone: string | undefined,
): string | undefined {
  const ms = toMillis(value)
  if (ms !== ms) return undefined
  const plain = lastWasPlain()
  const timeOnly = lastWasTimeOnly()
  // A built formatter carries its own locale and zone.
  const own = typeof format === 'function' ? format.options : undefined
  const o = { locale: locale ?? own?.locale, timeZone: timeZone ?? own?.timeZone }
  if (timeOnly) return formatTime(value, { ...o, timeStyle: 'medium' })
  if (plain) {
    return typeof value === 'string' && value.length === 10 ? formatDate(value, { ...o, dateStyle: 'full' }) : formatDateTime(value, { ...o, dateStyle: 'full', timeStyle: 'medium' })
  }

  return formatDateTime(value, { ...o, dateStyle: 'full', timeStyle: 'long' })
}

/** The machine-readable `datetime` attribute value, or `undefined` for a missing or invalid value. */
export function machineValue(value: DateInput): string | undefined {
  const ms = toMillis(value)
  if (ms !== ms) return undefined
  return lastWasPlain() && typeof value === 'string' ? value : new Date(ms).toISOString()
}
