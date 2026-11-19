import type { ApiEntry } from '@pyreon/manifest'

/** The `@pyreon/format/units` functions of the manifest (a separate file: the manifest itself is past the line cap). */
export const unitsApi: ApiEntry[] = [
    {
      name: "convert",
      kind: "function",
      signature: "(value: number, from: Unit, to: Unit) => number",
      summary: "Convert a number between two units `Intl` can format, from `@pyreon/format/units` (or `/units/core`: pure, no `@pyreon/*` import). Every factor is an EXACT definition (inch = 25.4 mm, pound = 0.45359237 kg, US gallon = 231 cubic inches, international acre = 4046.8564224 m2, kilobyte = 1000 bytes as in CLDR; sources cited in `convert.ts`) held as a rational and applied ONCE (one combined factor, never chained through an intermediate unit), so the result is as accurate as a multiply and a divide allow: `convert(5, 'mile', 'kilometer')` is exactly the double nearest 8.04672. Compound units (`-per-`) convert when their parts do. A compound and its inverse (`liter-per-kilometer` and `mile-per-gallon`, a pace and a speed) are reciprocals, not ratios, so the value is inverted (a zero is `Infinity`). Temperature is affine (celsius and fahrenheit only; kelvin is not an Intl unit). `gallon` and `fluid-ounce` are the US units (the imperial ones are not sanctioned by ECMA-402). `month` and `year` have no fixed length and throw. A dimension mismatch throws a `[Pyreon]` error naming both dimensions.",
      example: `// import { convert } from '@pyreon/format/units'
convert(5, 'mile', 'kilometer') // → 8.04672
convert(100, 'celsius', 'fahrenheit') // → 212
convert(1, 'gallon', 'liter') // → 3.785411784
convert(36, 'kilometer-per-hour', 'meter-per-second') // → 10
convert(35, 'mile-per-gallon', 'liter-per-kilometer') * 100 // → 6.720416666666666`,
      mistakes: [
        "Treating `gallon` or `fluid-ounce` as imperial for `uk`: they are the US units (CLDR and ECMA-402); the imperial units are not convertible here",
        "Chaining conversions through an intermediate unit: `convert` applies one exact factor, so convert directly",
        "Converting `month` or `year`: they have no fixed length; use `@pyreon/time` for calendar arithmetic",
      ],
      seeAlso: ["canConvert", "unitDimension", "formatUnit"],
    },
    {
      name: "canConvert",
      kind: "function",
      signature: "(from: Unit, to: Unit) => boolean",
      summary: "Whether `convert(x, from, to)` is defined: both are convertible units of the same (or the inverse) dimension. Never throws; an unknown unit, `month` and `year` are `false`.",
      example: `// import { canConvert } from '@pyreon/format/units'
canConvert('mile', 'kilometer') // → true
canConvert('mile', 'kilogram') // → false
canConvert('month', 'day') // → false`,
      seeAlso: ["convert", "unitDimension"],
    },
    {
      name: "unitDimension",
      kind: "function",
      signature: "(unit: Unit) => UnitDimension",
      summary: "What a unit measures: `length`, `mass`, `volume`, `temperature`, `area`, `duration`, `digital`, `angle`, `proportion`, or for a compound `speed`, `pace`, `fuel-economy`, `fuel-consumption`, `density`, `flow-rate`, `mass-flow`, `data-rate`, else `<a>-per-<b>`. An unknown unit throws.",
      example: `// import { unitDimension } from '@pyreon/format/units'
unitDimension('mile') // → "length"
unitDimension('kilometer-per-hour') // → "speed"
unitDimension('mile-per-gallon') // → "fuel-economy"`,
      seeAlso: ["convert", "canConvert"],
    },
    {
      name: "measurementSystem",
      kind: "function",
      signature: "(locale?: string) => 'metric' | 'us' | 'uk'",
      summary: "The measurement system of a locale's region, from CLDR's supplemental `measurementData`: `us` for US, Liberia and Myanmar, `uk` for Great Britain (metric, with miles and miles per hour on the road), `metric` everywhere else. A locale with no region is resolved by its likely region (`en` is `en-US`). An invalid tag is `metric`. In `@pyreon/format/units` the locale defaults to the ACTIVE locale (a reactive read); in `/units/core` to the runtime's.",
      example: `// import { measurementSystem } from '@pyreon/format/units'
measurementSystem('en-US') // → "us"
measurementSystem('en-GB') // → "uk"
measurementSystem('cs') // → "metric"`,
      seeAlso: ["preferredUnit"],
    },
    {
      name: "preferredUnit",
      kind: "function",
      signature: "(unit: Unit, locale?: string) => Unit",
      summary: "The unit a person in the locale's region reads for `unit`: `kilometer` is `mile` and `celsius` is `fahrenheit` in `en-US`; `mile` is `kilometer` and `fahrenheit` is `celsius` in `cs`; in `en-GB` distances and speeds stay miles and the rest is metric. A unit with no counterpart (`second`, `byte`) comes back unchanged. The table is deliberately small and simplified from CLDR's unit preferences: it maps a unit to the same scale in the other system, not to a use case (a height in feet and inches, a road in miles).",
      example: `// import { preferredUnit } from '@pyreon/format/units'
preferredUnit('kilometer', 'en-US') // → "mile"
preferredUnit('celsius', 'en-US') // → "fahrenheit"
preferredUnit('mile', 'cs') // → "kilometer"`,
      seeAlso: ["measurementSystem", "formatUnit"],
    },
]

/** The types those functions use. */
export const unitsTypeApi: ApiEntry[] = [
    {
      name: "ConvertedUnitOptions",
      kind: "type",
      signature: "interface ConvertedUnitOptions extends UnitOptions { convertTo?: Unit; system?: 'auto' | 'metric' | 'us' | 'uk' }",
      summary: "Options of `formatUnit` and `unitFormatter` from `@pyreon/format/units`: everything in `UnitOptions`, plus a conversion before formatting. `convertTo` names the unit; `system` picks the locale's own (`'auto'`, which follows the active locale in the reactive entry) or a fixed system. `convertTo` wins when both are given.",
      example: `// formatUnit(100, 'kilometer', { system: 'auto', locale: 'en-US' })`,
      seeAlso: ["formatUnit", "convert"],
    },
    {
      name: "MeasurementSystem",
      kind: "type",
      signature: "type MeasurementSystem = 'metric' | 'us' | 'uk'",
      summary: "A system of measurement: `us` (US customary), `uk` (metric with road miles) or `metric`.",
      example: `// const s: MeasurementSystem = measurementSystem('en-US')`,
      seeAlso: ["measurementSystem"],
    },
    {
      name: "UnitDimension",
      kind: "type",
      signature: "type UnitDimension = 'length' | 'mass' | 'volume' | 'area' | 'duration' | 'digital' | 'temperature' | 'angle' | 'proportion' | 'speed' | ... | `${string}-per-${string}`",
      summary: "What `unitDimension` returns: a simple dimension, a named compound (`speed`, `pace`, `fuel-economy`, ...) or `<a>-per-<b>`.",
      example: `// const d: UnitDimension = unitDimension('mile')`,
      seeAlso: ["unitDimension"],
    },
]
