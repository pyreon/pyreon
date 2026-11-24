/**
 * `@pyreon/format/units/core`: unit conversion and conversion-aware unit formatting, pure (no `@pyreon/*` import). The locale is
 * an option (`system: 'auto'` reads `options.locale`, else the runtime's), exactly like `@pyreon/format/core`.
 */
import { makeFormatter, type Env } from '../formatter'
import { localeOf } from '../pick'
import { convertedSpec, convertedUnitIn, convertedUnitKind } from '../unit-convert'
import type { ConvertedUnitOptions, Formatter, NumberInput, Unit, UnitPreset } from '../types'

const CORE_ENV: Env = { locale: () => '', zone: () => '' }

export type * from '../types'
export type { UnitDimension } from '../convert'
export { canConvert, convert, measurementSystem, preferredUnit, unitDimension } from '../convert'

/**
 * Format a number of `unit` after converting it. `convertTo` names the unit to show; `system` shows the unit a person in that
 * system reads (`'auto'` is the locale's, from `options.locale`). `convertTo` wins when both are given. Everything else is
 * `formatUnit` from `@pyreon/format/core`.
 *
 * @example
 * ```ts
 * formatUnit(5, 'mile', { convertTo: 'kilometer', locale: 'en-US', maximumFractionDigits: 2 }) // "8.05 km"
 * formatUnit(100, 'kilometer', { system: 'auto', locale: 'en-US', maximumFractionDigits: 1 }) // "62.1 mi"
 * ```
 */
export function formatUnit(value: NumberInput, unit: Unit, options?: ConvertedUnitOptions | UnitPreset): string {
  return convertedUnitIn(localeOf(options), value, unit, options)
}

/**
 * A reusable unit formatter with a conversion in front, the composable form of {@link formatUnit}.
 *
 * @example
 * ```ts
 * const distance = unitFormatter('kilometer', { locale: 'en-US', system: 'us', maximumFractionDigits: 1 })
 * distance(100) // "62.1 mi"
 * ```
 */
export function unitFormatter(unit: Unit, options?: ConvertedUnitOptions | UnitPreset): Formatter<NumberInput, 'unit'> {
  return makeFormatter(convertedUnitKind, convertedSpec(unit, options), CORE_ENV)
}
