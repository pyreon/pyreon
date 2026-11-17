// A dot read of a string-keyed record (`rec.fields.title` on a `Record<string, string>`), shared by both emitters.
//
// Natively such a record is a dictionary (Swift `[String: V]`) / map (Kotlin `Map<String, V>`), neither of which has a
// `.title` member, so the read was emitted verbatim and failed both native builds with no warning — the shape every
// `useDatabase` record read takes (`db.get('notes', id)?.fields.title`). It lowers to a subscript. An absent key reads as
// the value type's empty value, the convention `useParams` fields already follow (`params["id"] ?? ""`); the web would
// read `undefined`, which a `string`-typed record does not admit.
import type { TypeIR } from './types'

/** The empty value of a record's value type on `target`, or `null` when it has none (the read is then warned). */
export function recordEmptyValue(value: TypeIR, target: 'swift' | 'kotlin'): string | null {
  if (value.kind === 'string') return '""'
  if (value.kind === 'boolean') return 'false'
  if (value.kind === 'number') {
    if (value.float === true) return '0.0'

    return target === 'kotlin' ? '0L' : '0'
  }

  return null
}
