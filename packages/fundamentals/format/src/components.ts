/**
 * `@pyreon/format/components`: `<Num>` and `<DateTime>`. Both read their props
 * (and the active locale / time zone) inside a reactive accessor, so a binding
 * such as `<Num value={count()} />` updates when the value or the locale changes.
 */
import type { Props, VNodeChild } from '@pyreon/core'
import { h, mergeProps, splitProps } from '@pyreon/core'
import { formatBytes, formatCompact, formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent, formatTime, formatUnit } from './index'
import { lastWasPlain, lastWasTimeOnly, toMillis } from './input'
import type {
  BytesOptions,
  CompactOptions,
  CurrencyOptions,
  DateInput,
  DateStylePreset,
  DateTimeOptions,
  Formatter,
  NumberInput,
  NumberOptions,
  PercentOptions,
  Unit,
  UnitOptions,
} from './types'

/** A formatter of any number-style kind: number, currency, percent, compact, unit or bytes. */
export type NumFormatter = Formatter<NumberInput, 'number' | 'currency' | 'percent' | 'compact' | 'unit' | 'bytes'>

/** Wrap a part of the formatted text: `{ currency: (text) => <sup>{text}</sup> }`. Keys are the `Intl` part types. */
export type NumParts = { [T in Intl.NumberFormatPartTypes]?: (text: string) => VNodeChild }

/** A formatter of date, time, dateTime or relative kind (a relative formatter has no `parts`). */
export type DateFormatter = Formatter<DateInput, 'date' | 'time' | 'dateTime'> | Formatter<DateInput, 'relative'>

/** Wrap a part of the formatted date: `{ month: (text) => <b>{text}</b> }`. Keys are the `Intl` part types. */
export type DateParts = { [T in Intl.DateTimeFormatPartTypes]?: (text: string) => VNodeChild }

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

export interface NumProps extends Props {
  /** A built formatter (`currencyFormatter('EUR')`, `bytesFormatter()`, ...). Replaces `kind`, `currency`, `unit`, `options`, `locale` and `fallback`: configure those on the formatter. */
  format?: NumFormatter | undefined
  /** Wrap parts of the formatted text (needs `format`): `parts={{ currency: (t) => <sup>{t}</sup> }}`. */
  parts?: NumParts | undefined
  /** The number. Nullish or invalid renders `fallback`. */
  value: NumberInput
  /** Which formatter. Default `'number'`. */
  kind?: 'number' | 'currency' | 'percent' | 'compact' | 'unit' | 'bytes' | undefined
  /** Required for `kind="currency"`. */
  currency?: string | undefined
  /** Required for `kind="unit"`. */
  unit?: Unit | undefined
  /** Intl options of the chosen formatter. */
  options?: (NumberOptions & CurrencyOptions & PercentOptions & CompactOptions & UnitOptions & BytesOptions) | undefined
  /** Overrides the active locale. */
  locale?: string | undefined
  /** Rendered for nullish or invalid values. Default `''`. */
  fallback?: string | undefined
  /** Render in a `<span>` with `font-variant-numeric: tabular-nums` (set once, not per update), so numbers in columns and live values do not jitter. */
  tabular?: boolean | undefined
  /** Render in a `<span>` with `unicode-bidi: isolate`, so a number inside text of another direction (Arabic around a Latin number, or the reverse) keeps its own order. */
  isolate?: boolean | undefined
}

/**
 * A formatted number as reactive text. With no extra props it renders no element: the text node
 * updates in place. `class`, `id` and any other prop (or `tabular` / `isolate`) render a `<span>`.
 *
 * @example
 * <Num value={total()} kind="currency" currency="EUR" />
 */
export function Num(props: NumProps): VNodeChild {
  const [own, rest] = splitProps(props, ['value', 'kind', 'currency', 'unit', 'options', 'locale', 'fallback', 'format', 'parts', 'tabular', 'isolate'])
  const text = (): string | VNodeChild[] => {
    const format = own.format
    if (format !== undefined) {
      const wrap = own.parts
      if (wrap === undefined) return format(own.value)
      const parts = format.parts(own.value)

      return parts.length === 0 ? format(own.value) : partsToChildren(parts, wrap)
    }
    const o = {
      ...own.options,
      locale: own.locale ?? own.options?.locale,
      fallback: own.fallback ?? own.options?.fallback,
    }
    switch (own.kind) {
      case 'currency':
        return formatCurrency(own.value, own.currency as string, o)
      case 'percent':
        return formatPercent(own.value, o)
      case 'compact':
        return formatCompact(own.value, o)
      case 'unit':
        return formatUnit(own.value, own.unit as Unit, o)
      case 'bytes':
        return formatBytes(own.value, o)
      default:
        return formatNumber(own.value, o)
    }
  }
  if (own.tabular !== true && own.isolate !== true && Object.keys(rest).length === 0) return text

  return h('span', mergeProps(rest, { style: wrapperStyle(rest.style, own.tabular === true, own.isolate === true) }), text)
}

/**
 * The element's `style`, set once: the flags added to the caller's `style` (a string or an object).
 * No per-update work: the value does not depend on the number.
 */
function wrapperStyle(given: unknown, tabular: boolean, isolate: boolean): unknown {
  if (typeof given === 'object' && given !== null) {
    return { ...given, ...(tabular ? { fontVariantNumeric: 'tabular-nums' } : {}), ...(isolate ? { unicodeBidi: 'isolate' } : {}) }
  }
  const flags = [tabular ? 'font-variant-numeric: tabular-nums;' : '', isolate ? 'unicode-bidi: isolate;' : ''].filter(Boolean).join(' ')
  if (typeof given === 'string' && given !== '') return `${given}${given.endsWith(';') ? '' : ';'} ${flags}`

  return flags === '' ? undefined : flags
}

export interface DateTimeProps extends Props {
  /** The date-like value. Nullish or invalid renders `fallback`. */
  value: DateInput
  /** What to show. Default `'dateTime'`. */
  kind?: 'date' | 'time' | 'dateTime' | undefined
  /** A `dateStyle` / `timeStyle` shorthand, or a built formatter (`dateFormatter('long')`); a formatter replaces `kind`, `options`, `locale`, `timeZone` and `fallback`. */
  format?: DateStylePreset | DateFormatter | undefined
  /** Wrap parts of the formatted date (needs a formatter as `format`). */
  parts?: DateParts | undefined
  /** Intl.DateTimeFormat options (take precedence over `format`). */
  options?: DateTimeOptions | undefined
  /** Overrides the active locale. */
  locale?: string | undefined
  /** Overrides the active time zone (ignored for calendar strings). */
  timeZone?: string | undefined
  /** `unicode-bidi: isolate` on the element (default `true`): a date inside text of another direction keeps its own order. */
  isolate?: boolean | undefined
  /** Rendered for nullish or invalid values. Default `''`. */
  fallback?: string | undefined
}

function styleFields(kind: DateTimeProps['kind'], format: DateStylePreset | undefined): DateTimeOptions | undefined {
  if (format === undefined) return undefined
  return kind === 'date' ? { dateStyle: format } : kind === 'time' ? { timeStyle: format } : { dateStyle: format, timeStyle: format }
}

/**
 * The unambiguous reading of a value for a `title`: the full date, and for an instant the time with its zone name
 * (a calendar value has no zone, so none is shown). `undefined` for a missing or invalid value.
 */
export function exactTitle(
  value: DateInput,
  format: DateTimeProps['format'],
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

/**
 * A `<time datetime="…">` element with the formatted value as text. The
 * `datetime` attribute is the ISO form of the value (the calendar string as
 * given, or the UTC instant), so crawlers and assistive tech get a stable
 * value whatever the display locale.
 *
 * @example
 * <DateTime value="2026-11-18" kind="date" format="long" />
 */
export function DateTime(props: DateTimeProps) {
  const [own, rest] = splitProps(props, ['value', 'kind', 'format', 'parts', 'options', 'locale', 'timeZone', 'fallback', 'isolate'])
  const text = (): string | VNodeChild[] => {
    const format = own.format
    if (typeof format === 'function') {
      const wrap = own.parts
      if (wrap === undefined || !('parts' in format)) return format(own.value)
      const parts = format.parts(own.value)

      return parts.length === 0 ? format(own.value) : partsToChildren(parts, wrap)
    }
    const hasOptions = own.options !== undefined || own.locale !== undefined || own.timeZone !== undefined || own.fallback !== undefined
    const arg: DateTimeOptions | DateStylePreset | undefined = hasOptions
      ? {
          ...styleFields(own.kind, format),
          ...own.options,
          locale: own.locale ?? own.options?.locale,
          timeZone: own.timeZone ?? own.options?.timeZone,
          fallback: own.fallback ?? own.options?.fallback,
        }
      : format
    switch (own.kind) {
      case 'date':
        return formatDate(own.value, arg)
      case 'time':
        return formatTime(own.value, arg)
      default:
        return formatDateTime(own.value, arg)
    }
  }
  // `datetime` and `title` are accessors so they follow the value; `undefined` removes the attribute. A `title`
  // you pass wins; otherwise hovering shows the exact date and time (with the zone for an instant).
  const extra = {
    datetime: () => machineValue(own.value),
    title: () => (rest.title as string | undefined) ?? exactTitle(own.value, own.format, own.locale ?? own.options?.locale, own.timeZone ?? own.options?.timeZone),
    ...(own.isolate === false ? {} : { style: wrapperStyle(rest.style, false, true) }),
  }

  return h('time', mergeProps(rest, extra), text)
}
