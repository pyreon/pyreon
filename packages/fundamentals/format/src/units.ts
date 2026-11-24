/**
 * `@pyreon/format/units`: the same names as `@pyreon/format/units/core`, defaulting to the ACTIVE locale
 * (`@pyreon/ambient`'s), so `system: 'auto'` and `measurementSystem()` follow `setLocale` / `provideLocale` and a formatter in an
 * effect, computed or JSX binding updates when the locale changes. An explicit `locale` option wins and does not subscribe.
 */
import { measurementSystem as measurementSystemOf, preferredUnit as preferredUnitOf } from './convert'
import { makeFormatter, type Env } from './formatter'
import { locale } from './locale'
import { localeOf } from './pick'
import { convertedSpec, convertedUnitIn, convertedUnitKind } from './unit-convert'
import type { ConvertedUnitOptions, Formatter, MeasurementSystem, NumberInput, Unit, UnitPreset } from './types'

const REACTIVE_ENV: Env = { locale, zone: () => '' }

export type * from './types'
export type { UnitDimension } from './convert'
export { canConvert, convert, unitDimension } from './convert'

/**
 * The measurement system of a locale's region (`us`, `uk` or `metric`), from CLDR's `measurementData`; `locale` defaults to the
 * ACTIVE locale (a reactive read).
 *
 * @example
 * ```ts
 * measurementSystem('en-US') // "us"
 * measurementSystem('cs') // "metric"
 * ```
 */
export function measurementSystem(tag?: string): MeasurementSystem {
  return measurementSystemOf(tag ?? locale())
}

/**
 * The unit a person in the locale's region reads for `unit` (`kilometer` is `mile` in `en-US`); `locale` defaults to the ACTIVE
 * locale (a reactive read).
 *
 * @example
 * ```ts
 * preferredUnit('kilometer', 'en-US') // "mile"
 * preferredUnit('celsius', 'cs') // "celsius"
 * ```
 */
export function preferredUnit(unit: Unit, tag?: string): Unit {
  return preferredUnitOf(unit, tag ?? locale())
}

/**
 * Format a number of `unit` after converting it; `system: 'auto'` shows the unit of the ACTIVE locale's region.
 *
 * @example
 * ```ts
 * formatUnit(5, 'mile', { convertTo: 'kilometer', locale: 'en-US', maximumFractionDigits: 2 }) // "8.05 km"
 * ```
 */
export function formatUnit(value: NumberInput, unit: Unit, options?: ConvertedUnitOptions | UnitPreset): string {
  return convertedUnitIn(localeOf(options) || locale(), value, unit, options)
}

/**
 * A reusable unit formatter with a conversion in front; `system: 'auto'` follows the ACTIVE locale.
 *
 * @example
 * ```ts
 * unitFormatter('kilometer', { locale: 'en-US', system: 'us', maximumFractionDigits: 1 })(100) // "62.1 mi"
 * ```
 */
export function unitFormatter(unit: Unit, options?: ConvertedUnitOptions | UnitPreset): Formatter<NumberInput, 'unit'> {
  return makeFormatter(convertedUnitKind, convertedSpec(unit, options), REACTIVE_ENV)
}
