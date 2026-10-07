/**
 * Pure target-spelling helpers the emitters AND package-owned plugins share (re-exported from `plugin-api`).
 * Nothing here reads emitter or parser state.
 */

import { swiftIdent } from './identifier-safety'
import { swiftStr } from './string-literals'

/** A backticked keyword keeps its JSON key — only a REWRITTEN name needs a CodingKey. */
const SWIFT_KEYWORD_ONLY = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * The Kotlin type of a TS integer `number`: `Long`, because Swift's `Int` is
 * 64-bit on every Apple target and one source must hold the same values on
 * both. Kotlin's `Int` is 32-bit; with it, `{"createdAt": 1726000000000}`
 * decoded on iOS and threw `Failed to parse int` on Android.
 */
export const KOTLIN_INT = 'Long'

/**
 * A `CodingKeys` enum for a Codable struct whose field names are not all
 * plain Swift identifiers, or `[]` when none needs one.
 *
 * A KEYWORD name does NOT need it: `` var `where`: String `` synthesizes the
 * key "where" (backticks are not part of the name — verified by a real
 * encode/decode round trip, `identifier-safety-codable.test.ts`). Only a name
 * `swiftIdent` has to REWRITE (`'my-key'` → `myKey`) diverges from its JSON
 * key, and then every field of the struct must be listed.
 */
export function swiftCodingKeysLines(names: readonly string[], pad: string): string[] {
  if (!names.some((n) => !SWIFT_KEYWORD_ONLY.test(n))) return []
  const lines = [`${pad}enum CodingKeys: String, CodingKey {`]
  for (const n of names) {
    const ident = swiftIdent(n)
    lines.push(`${pad}  case ${ident}${ident === n || ident === '`' + n + '`' ? '' : ` = ${swiftStr(n)}`}`)
  }
  lines.push(`${pad}}`)
  return lines
}

