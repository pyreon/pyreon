/**
 * `@pyreon/format/components`: `<Num>` and `<DateTime>`. Both read their props
 * (and the active locale / time zone) inside a reactive accessor, so a binding
 * such as `<Num value={count()} />` updates when the value or the locale changes.
 */
import type { Props, VNodeChild } from '@pyreon/core'
import { h, mergeProps, splitProps } from '@pyreon/core'
import { formatBytes, formatCompact, formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent, formatTime, formatUnit } from './index'
import { lastWasPlain, toMillis } from './input'
import type {
  BytesOptions,
  CompactOptions,
  CurrencyOptions,
  DateInput,
  DateStylePreset,
  DateTimeOptions,
  NumberInput,
  NumberOptions,
  PercentOptions,
  Unit,
  UnitOptions,
} from './types'

export interface NumProps {
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
}

/**
 * A formatted number as reactive text. Renders no element: the text node
 * updates in place.
 *
 * @example
 * <Num value={total()} kind="currency" currency="EUR" />
 */
export function Num(props: NumProps): VNodeChild {
  return () => {
    const o = {
      ...props.options,
      locale: props.locale ?? props.options?.locale,
      fallback: props.fallback ?? props.options?.fallback,
    }
    switch (props.kind) {
      case 'currency':
        return formatCurrency(props.value, props.currency as string, o)
      case 'percent':
        return formatPercent(props.value, o)
      case 'compact':
        return formatCompact(props.value, o)
      case 'unit':
        return formatUnit(props.value, props.unit as Unit, o)
      case 'bytes':
        return formatBytes(props.value, o)
      default:
        return formatNumber(props.value, o)
    }
  }
}

export interface DateTimeProps extends Props {
  /** The date-like value. Nullish or invalid renders `fallback`. */
  value: DateInput
  /** What to show. Default `'dateTime'`. */
  kind?: 'date' | 'time' | 'dateTime' | undefined
  /** `dateStyle` / `timeStyle` shorthand. */
  format?: DateStylePreset | undefined
  /** Intl.DateTimeFormat options (take precedence over `format`). */
  options?: DateTimeOptions | undefined
  /** Overrides the active locale. */
  locale?: string | undefined
  /** Overrides the active time zone (ignored for calendar strings). */
  timeZone?: string | undefined
  /** Rendered for nullish or invalid values. Default `''`. */
  fallback?: string | undefined
}

function styleFields(kind: DateTimeProps['kind'], format: DateStylePreset | undefined): DateTimeOptions | undefined {
  if (format === undefined) return undefined
  return kind === 'date' ? { dateStyle: format } : kind === 'time' ? { timeStyle: format } : { dateStyle: format, timeStyle: format }
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
  const [own, rest] = splitProps(props, ['value', 'kind', 'format', 'options', 'locale', 'timeZone', 'fallback'])
  const text = (): string => {
    const hasOptions = own.options !== undefined || own.locale !== undefined || own.timeZone !== undefined || own.fallback !== undefined
    const arg: DateTimeOptions | DateStylePreset | undefined = hasOptions
      ? {
          ...styleFields(own.kind, own.format),
          ...own.options,
          locale: own.locale ?? own.options?.locale,
          timeZone: own.timeZone ?? own.options?.timeZone,
          fallback: own.fallback ?? own.options?.fallback,
        }
      : own.format
    switch (own.kind) {
      case 'date':
        return formatDate(own.value, arg)
      case 'time':
        return formatTime(own.value, arg)
      default:
        return formatDateTime(own.value, arg)
    }
  }
  // `datetime` is an accessor so it follows the value; `undefined` removes the attribute.
  return h('time', mergeProps(rest, { datetime: () => machineValue(own.value) }), text)
}
