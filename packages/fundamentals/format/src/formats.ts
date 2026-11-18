/**
 * `defineFormats` and `createFormatter`: the two ways to name a set of
 * formats. Both are built on the same engine functions as the one-off
 * formatters, so they share the cache.
 */
import { durationIn } from './duration'
import { dateIn, dateRangeIn, dateTimeIn, dateToPartsIn, relativeIn, relativeToIn, timeIn } from './datetime'
import { listIn } from './list'
import {
  bytesIn,
  compactIn,
  currencyIn,
  numberIn,
  numberRangeIn,
  numberToPartsIn,
  percentIn,
  unitIn,
} from './number'
import { parseDateIn, parseNumberIn } from './parse'
import { localeOf, zoneOf } from './pick'
import { programmerError } from './warn'
import type {
  DefinedFormats,
  FormatSpec,
  Formatter,
  FormatterBase,
  FormatValueByKind,
} from './types'

/** The subset of formatters `defineFormats` dispatches to. */
export type FormatImpl = Pick<
  Formatter,
  'number' | 'currency' | 'percent' | 'compact' | 'unit' | 'bytes' | 'duration' | 'list' | 'date' | 'time' | 'dateTime' | 'relative'
>

/**
 * Build the named functions of a spec table over a formatter implementation.
 * A call without overrides passes the spec object itself, so the identity tier
 * of the cache serves it; overrides merge into a fresh object (structural tier).
 *
 * The result type is a mapped type the implementation cannot prove key by key,
 * so there is one boundary cast at the end; each branch's value cast is
 * guaranteed by the public `NamedFormat` signature.
 */
export function defineFormatsWith<const T extends Record<string, FormatSpec>>(
  impl: FormatImpl,
  specs: T,
): DefinedFormats<T> {
  const out: Record<string, (value: never, overrides?: object) => string> = {}
  for (const key of Object.keys(specs)) {
    const spec = specs[key] as FormatSpec
    out[key] = (value, overrides) => {
      const merged = overrides === undefined ? spec : { ...spec, ...overrides }
      return run(impl, merged as FormatSpec, value)
    }
  }
  return out as unknown as DefinedFormats<T>
}

function run(impl: FormatImpl, spec: FormatSpec, value: FormatValueByKind[keyof FormatValueByKind]): string {
  switch (spec.kind) {
    case 'number': return impl.number(value as FormatValueByKind['number'], spec)
    case 'currency': return impl.currency(value as FormatValueByKind['currency'], spec.currency, spec)
    case 'percent': return impl.percent(value as FormatValueByKind['percent'], spec)
    case 'compact': return impl.compact(value as FormatValueByKind['compact'], spec)
    case 'unit': return impl.unit(value as FormatValueByKind['unit'], spec.unit, spec)
    case 'bytes': return impl.bytes(value as FormatValueByKind['bytes'], spec)
    case 'duration': return impl.duration(value as FormatValueByKind['duration'], spec)
    case 'list': return impl.list(value as FormatValueByKind['list'], spec)
    case 'date': return impl.date(value as FormatValueByKind['date'], spec)
    case 'time': return impl.time(value as FormatValueByKind['time'], spec)
    case 'dateTime': return impl.dateTime(value as FormatValueByKind['dateTime'], spec)
    case 'relative': return impl.relative(value as FormatValueByKind['relative'], spec.unit, spec)
    default:
      throw programmerError('defineFormats', `unknown kind ${JSON.stringify((spec as { kind?: unknown }).kind)}. Use number, currency, percent, compact, unit, bytes, duration, list, date, time, dateTime or relative.`)
  }
}

function checkZone(zone: string | undefined): string {
  if (zone === undefined || zone === '') return ''
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: zone })
  } catch {
    throw programmerError('createFormatter', `timeZone ${JSON.stringify(zone)} is not an IANA time zone name such as "Europe/Prague" or "UTC".`)
  }
  return zone
}

/** A bound, non-reactive formatter set: the base locale and time zone are fixed, per-call options still override them. */
export function createFormatterWith(base: FormatterBase): Formatter {
  const locale = base.locale ?? ''
  const zone = checkZone(base.timeZone)
  const L = (o: Parameters<typeof localeOf>[0]): string => localeOf(o) || locale
  const Z = (o: Parameters<typeof zoneOf>[0]): string => zoneOf(o) || zone
  return {
    number: (v, o) => numberIn(L(o), v, o),
    currency: (v, c, o) => currencyIn(L(o), v, c, o),
    percent: (v, o) => percentIn(L(o), v, o),
    compact: (v, o) => compactIn(L(o), v, o),
    unit: (v, u, o) => unitIn(L(o), v, u, o),
    bytes: (v, o) => bytesIn(L(o), v, o),
    duration: (v, o) => durationIn(L(o), v, o),
    list: (v, o) => listIn(L(o), v, o),
    date: (v, o) => dateIn(L(o), Z(o), v, o),
    time: (v, o) => timeIn(L(o), Z(o), v, o),
    dateTime: (v, o) => dateTimeIn(L(o), Z(o), v, o),
    relative: (v, u, o) => relativeIn(L(o), v, u, o),
    relativeTo: (t, b, o) => relativeToIn(L(o), t, b, o),
    dateRange: (s, e, o) => dateRangeIn(L(o), Z(o), s, e, o),
    numberRange: (s, e, o) => numberRangeIn(L(o), s, e, o),
    numberToParts: (v, o) => numberToPartsIn(L(o), v, o),
    dateToParts: (v, o) => dateToPartsIn(L(o), Z(o), v, o),
    parseNumber: (t) => parseNumberIn(locale, t),
    parseDate: (t) => parseDateIn(locale, t),
  }
}
