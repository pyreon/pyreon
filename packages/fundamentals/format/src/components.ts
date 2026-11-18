/**
 * `@pyreon/format/components`: `<Num>`, `<DateTime>` and `<RelativeTime>`. Both read their props
 * (and the active locale / time zone) inside a reactive accessor, so a binding
 * such as `<Num value={count()} />` updates when the value or the locale changes.
 */
import type { Props, VNodeChild } from '@pyreon/core'
import { h, mergeProps, splitProps } from '@pyreon/core'
import { formatBytes, formatCompact, formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent, formatTime, formatUnit, useRelativeTime } from './index'
import { exactTitle, machineValue, partsToChildren } from './component-helpers'
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
  RelativeThreshold,
  RelativeTimeOptions,
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

export interface RelativeTimeProps extends Props {
  /** The date-like value (a calendar value, a `Date`, epoch milliseconds or an ISO string). Nullish or invalid renders `fallback`. */
  value: DateInput
  /** `'auto'` (default) says "yesterday"; `'always'` says "1 day ago". */
  numeric?: 'always' | 'auto' | undefined
  /** `Intl.RelativeTimeFormat` options (`style`) and the rest of {@link RelativeTimeOptions}; the props below take precedence. */
  options?: RelativeTimeOptions | undefined
  /** Overrides the active locale. */
  locale?: string | undefined
  /** Overrides the active time zone: the calendar that "yesterday" and "last month" are counted in. */
  timeZone?: string | undefined
  /** Past this distance show an absolute date: `{ after: { days: 7 }, as: 'medium' }`. */
  threshold?: RelativeThreshold | undefined
  /** `unicode-bidi: isolate` on the element (default `true`). */
  isolate?: boolean | undefined
  /** Rendered for nullish or invalid values. Default `''`. */
  fallback?: string | undefined
}

/**
 * A `<time>` element that says how long ago (or how far ahead) a value is and keeps itself current: `3 minutes ago` becomes
 * `4 minutes ago` when the value turns four minutes old. All instances share two timers (see `useRelativeTime`); a server render
 * starts none and prints the request's clock, and the page hydrates without a mismatch when the server's instant is handed over
 * (`clockScript()` of `@pyreon/ambient`). `datetime` is the machine value and `title` the exact date and time, so hovering a
 * relative label shows when it was; a `title` you pass wins.
 *
 * @example
 * <RelativeTime value={comment.createdAt} threshold={{ after: { days: 7 } }} />
 */
export function RelativeTime(props: RelativeTimeProps) {
  const [own, rest] = splitProps(props, ['value', 'numeric', 'options', 'locale', 'timeZone', 'threshold', 'isolate', 'fallback'])
  const text = useRelativeTime(
    () => own.value,
    () => ({
      ...own.options,
      numeric: own.numeric ?? own.options?.numeric ?? 'auto',
      locale: own.locale ?? own.options?.locale,
      timeZone: own.timeZone ?? own.options?.timeZone,
      threshold: own.threshold ?? own.options?.threshold,
      fallback: own.fallback ?? own.options?.fallback,
    }),
  )
  const extra = {
    datetime: () => machineValue(own.value),
    title: () => (rest.title as string | undefined) ?? exactTitle(own.value, undefined, own.locale ?? own.options?.locale, own.timeZone ?? own.options?.timeZone),
    ...(own.isolate === false ? {} : { style: wrapperStyle(rest.style, false, true) }),
  }

  return h('time', mergeProps(rest, extra), text)
}
