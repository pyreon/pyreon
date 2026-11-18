---
"@pyreon/format": minor
---

Unit conversion in its own entry, `@pyreon/format/units` (and `@pyreon/format/units/core`, pure), so an app that never converts pays nothing.

- **`convert(value, from, to)`, `canConvert`, `unitDimension`:** between the units `Intl` can format, with `-per-` compounds (`kilometer-per-hour` to `mile-per-hour`). Every factor is an exact definition (inch = 25.4 mm, pound = 0.45359237 kg, US gallon = 231 cubic inches), held as a rational and applied once, so a result is as accurate as one multiply and one divide allow. Temperature is affine, a fuel economy and its inverse (`mile-per-gallon`, `liter-per-kilometer`) are reciprocals, `month` and `year` have no fixed length, a mismatch throws a `[Pyreon]` error naming both dimensions.
- **`measurementSystem(locale?)`, `preferredUnit(unit, locale?)`:** `us`, `uk` or `metric` from the locale's region (CLDR `measurementData`), and the unit a person there reads.
- **`formatUnit` and `unitFormatter` with `{ convertTo, system }`:** convert, then format; `system: 'auto'` follows the active locale in the reactive entry.
- `gallon` and `fluid-ounce` are the US units; a kilobyte is 1000 bytes.
