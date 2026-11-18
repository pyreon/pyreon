/**
 * A `Date` FIELD crossing JSON.
 *
 * Natively a date is its epoch milliseconds, a `Double` (date-lowering.ts), and every piece of logic keeps it that way.
 * JSON is where that differs from the web: a server sends a date as its ISO string, and `JSON.stringify` writes a
 * `Date` as `toISOString()` (`null` when invalid). A struct field typed `Date` — the type annotation keeps the mark
 * (`{ kind: 'number', float: true, date: true }`, parse.ts) — is therefore declared with the runtimes' ISO-string
 * codec: a Swift property wrapper (`PyreonISODate`, `PyreonOptionalISODate`, `PyreonISODates`, in `PyreonDate.swift`)
 * or a kotlinx serializer (`PyreonDateSerializer`, `PyreonDateListSerializer`, in `PyreonDateJson.kt`). The property
 * itself stays a `Double`, so reading, writing and constructing the struct are unchanged.
 *
 * Covered positions: `at: Date`, an optional `at?: Date` / `at: Date | null`, and `ats: Date[]`. A date deeper inside a
 * field's type (`Record<string, Date>`, `Date[][]`, `(Date | null)[]`) has no codec and is named by a warning: it
 * crosses JSON as a number, which no ISO string decodes into.
 */
import { typeIsOptional, unwrapOptionalType } from './infer-type'
import type { TypeIR } from './types'

const isDate = (t: TypeIR): boolean => t.kind === 'number' && t.date === true

/** How a field of type `t` crosses JSON as a date: one, optional, a list, `unsupported` (a date elsewhere inside), or not at all. */
export function dateFieldShape(t: TypeIR): 'one' | 'optional' | 'list' | 'unsupported' | undefined {
  if (isDate(t)) return 'one'
  if (typeIsOptional(t) && isDate(unwrapOptionalType(t))) return 'optional'
  if (t.kind === 'array' && isDate(t.element)) return 'list'

  return containsDate(t) ? 'unsupported' : undefined
}

function containsDate(t: TypeIR): boolean {
  if (isDate(t)) return true
  if (t.kind === 'array' || t.kind === 'set') return containsDate(t.element)
  if (t.kind === 'map') return containsDate(t.value)
  if (t.kind === 'union') return t.branches.some(containsDate)

  return false
}

/** The Swift property-wrapper attribute (with its trailing space) a field of type `t` is declared with, or `''`. */
export function swiftDateWrapper(t: TypeIR): string {
  switch (dateFieldShape(t)) {
    case 'one':
      return '@PyreonISODate '
    case 'optional':
      return '@PyreonOptionalISODate '
    case 'list':
      return '@PyreonISODates '
    default:
      return ''
  }
}

/** The kotlinx annotation (with its trailing space) a data-class property of type `t` is declared with, or `''`. */
export function kotlinDateSerializer(t: TypeIR): string {
  switch (dateFieldShape(t)) {
    case 'one':
    case 'optional':
      return '@Serializable(with = PyreonDateSerializer::class) '
    case 'list':
      return '@Serializable(with = PyreonDateListSerializer::class) '
    default:
      return ''
  }
}

/** The warning for a field whose date has no codec (`dateFieldShape` is `unsupported`), or `undefined`. */
export function dateFieldWarning(struct: string, field: string, t: TypeIR): string | undefined {
  if (dateFieldShape(t) !== 'unsupported') return undefined

  return (
    `\`${struct}.${field}\` holds a \`Date\` inside another type. Natively a date is its epoch milliseconds, and only a ` +
    `\`Date\`, an optional \`Date\` or a \`Date[]\` field crosses JSON as the web's ISO string; here it is read and written ` +
    `as a NUMBER, so a server's ISO string fails the decode. Make the date a field of its own struct ` +
    `(\`{ at: Date }[]\` instead of \`Date[][]\`, or a struct value instead of \`Record<string, Date>\`).`
  )
}
