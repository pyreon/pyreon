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
  currencyOptions,
  numberIn,
  numberRangeIn,
  numberToPartsIn,
  percentIn,
  unitIn,
} from './number'
import { parseDateIn, parseNumberIn } from './parse'
import { localeOf, zoneOf } from './pick'
import { describe, programmerError, quote } from './warn'
import type {
  BoundFormatters,
  CurrencyInput,
  DefinedFormats,
  ExtendedSpec,
  FormatSpec,
  Formatter,
  FormatterBase,
  FormatterKind,
  KindInfo,
} from './types'

/** One factory per kind: `defineFormats` builds each declared format through these. */
export type FormatterFactories = { [K in FormatterKind]: (spec: KindInfo[K]['spec']) => Formatter<KindInfo[K]['in'], K> }

interface Resolved {
  kind: string
  options: Record<string, unknown>
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** A spec's kind and options with `extends` followed (unknown names and cycles are programmer errors). */
function resolveSpec(specs: Record<string, unknown>, name: string, chain: string[]): Resolved {
  const raw = specs[name]
  if (!isRecord(raw)) throw programmerError('defineFormats', `the format ${quote(name)} must be an object such as { kind: 'currency', currency: 'EUR' }.`)
  const { extends: parent, kind, ...options } = raw
  if (parent === undefined) {
    return { kind: typeof kind === 'string' ? kind : describe(kind), options }
  }
  if (typeof parent !== 'string' || !Object.hasOwn(specs, parent)) {
    throw programmerError('defineFormats', `the format ${quote(name)} extends ${quote(parent)}, which is not defined in the same set. Defined: ${Object.keys(specs).join(', ')}.`)
  }
  if (chain.includes(parent) || parent === name) {
    throw programmerError('defineFormats', `the formats ${[...chain, name, parent].map((n) => quote(n)).join(' extends ')} form a cycle. Break it so every chain ends at a spec with a kind.`)
  }
  const base = resolveSpec(specs, parent, [...chain, name])

  return { kind: base.kind, options: { ...base.options, ...options } }
}

/**
 * Build the named formatters of a spec table. Each key is a real `Formatter`
 * (`f.price(9.99)`, `f.price.with(...)`, `f.price.from(...)`); a spec may
 * `extends` another by name. The factories are the same ones exported as
 * `currencyFormatter`, ..., so there is one implementation.
 */
export function defineFormatsWith<const T extends Record<string, FormatSpec | ExtendedSpec<Extract<keyof T, string>>>>(
  factories: FormatterFactories,
  specs: T,
): DefinedFormats<T> {
  if (!isRecord(specs)) {
    throw programmerError('defineFormats', `expected an object of formats such as { price: { kind: 'currency', currency: 'EUR' } }, got ${describe(specs)}.`)
  }
  const out: Record<string, unknown> = {}
  for (const name of Object.keys(specs)) {
    const { kind, options } = resolveSpec(specs, name, [])
    if (!Object.hasOwn(factories, kind)) {
      throw programmerError('defineFormats', `the format ${quote(name)} has unknown kind ${quote(kind)}. Use ${Object.keys(factories).join(', ')}.`)
    }
    const build = factories[kind as FormatterKind] as (spec: object) => unknown
    out[name] = build(options)
  }

  // One entry per key, each built by the factory of its kind: the mapped type is not provable key by key.
  return out as unknown as DefinedFormats<T>
}

function checkZone(zone: string | undefined): string {
  if (zone === undefined || zone === '') return ''
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: zone })
  } catch {
    throw programmerError('createFormatter', `timeZone ${quote(zone)} is not an IANA time zone name such as "Europe/Prague" or "UTC".`)
  }

  return zone
}

/** A bound, non-reactive formatter set: the base locale and time zone are fixed, per-call options still override them. */
export function createFormatterWith(given: FormatterBase): BoundFormatters {
  const base: FormatterBase = typeof given === 'object' && given !== null ? given : {}
  const locale = localeOf(base)
  const zone = checkZone(zoneOf(base))
  const L = (o: Parameters<typeof localeOf>[0]): string => localeOf(o) || locale
  const Z = (o: Parameters<typeof zoneOf>[0]): string => zoneOf(o) || zone

  return {
    number: (v, o) => numberIn(L(o), v, o),
    currency: ((v: CurrencyInput, a?: unknown, b?: unknown) => currencyIn(L(currencyOptions(v, a, b)), v, a, b)) as BoundFormatters['currency'],
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
    relativeTo: (t, b, o) => relativeToIn(L(o), Z(o), t, b, o),
    dateRange: (s, e, o) => dateRangeIn(L(o), Z(o), s, e, o),
    numberRange: (s, e, o) => numberRangeIn(L(o), s, e, o),
    numberToParts: (v, o) => numberToPartsIn(L(o), v, o),
    dateToParts: (v, o) => dateToPartsIn(L(o), Z(o), v, o),
    parseNumber: (t) => parseNumberIn(locale, t),
    parseDate: (t) => parseDateIn(locale, t),
  }
}
