// Identifier safety — keep emit syntactically valid in target
// languages that disallow characters JSX / HTML attrs accept.
//
// Swift and Kotlin both require identifier characters for argument
// labels + parameter names: letters, digits, underscore. HTML attrs
// like `data-test`, `aria-label` carry hyphens — emit them verbatim
// and `swiftc -parse` / `kotlinc` reject with `expected ',' separator`.
//
// Coverage-gate analysis (2026-05-21, 525 real `.tsx` files):
// hyphenated attrs were the #1 cause of `swiftc -parse` failures —
// 19 of 30 invalid files. The conversion below + identical wiring on
// the Kotlin emit side closes that bucket.
//
// Convention: kebab-case → camelCase. Matches how React / Vue web
// frameworks have rewritten attrs for years (`data-test` → `dataTest`,
// `aria-label` → `ariaLabel`). The choice is structural, not stylistic:
// camelCase is the only mapping Swift + Kotlin BOTH accept without
// further escaping, AND round-trips back to a recognisable form if a
// future SwiftUI / Compose binding wants the original.

/**
 * Convert a kebab-case identifier to camelCase. Idempotent for
 * inputs without hyphens.
 *
 *   safeIdent('data-test')      → 'dataTest'
 *   safeIdent('aria-label')     → 'ariaLabel'
 *   safeIdent('background')     → 'background'
 *   safeIdent('on-mount-once')  → 'onMountOnce'
 *
 * Trailing or leading hyphens are stripped (defensive — neither HTML
 * nor JSX attr names should start/end with `-`, but the emitter
 * shouldn't crash if a fixture provides one).
 */
const PLAIN_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Characters a Kotlin backtick-quoted name may NOT contain (JVM + dex rules). */
const KOTLIN_UNQUOTABLE = /[.;[\]/<>:\\`\r\n]/

export function safeIdent(name: string): string {
  if (!name.includes('-')) return name
  const segments = name.split('-').filter((s) => s.length > 0)
  if (segments.length === 0) return name
  return segments
    .map((seg, i) =>
      i === 0 ? seg : seg.charAt(0).toUpperCase() + seg.slice(1),
    )
    .join('')
}

// Swift reserved keywords — when a Pyreon identifier collides with one
// of these, Swift requires backtick-escaping: `let \`class\`: String`,
// `struct \`guard\`: View {}`, `obj.\`fun\` = 1`. Without escaping,
// swiftc rejects with `keyword '<x>' cannot be used as an identifier`.
//
// Coverage-gate analysis (2026-05-21) identified keyword collisions
// as the #2 cause of swiftc-parse failures — 8 of 14 remaining
// invalid files after the hyphen fix (6 × `guard` from route guards,
// 2 × `class` from React/HTML attr leakage).
//
// Source: https://docs.swift.org/swift-book/documentation/the-swift-programming-language/lexicalstructure/#Keywords-and-Punctuation
//
// Subset chosen to cover: declarations + statements + expressions +
// type names. Excludes `#`-prefixed compiler directives (they carry
// the `#` so they can't collide with bare identifiers) and pattern
// keywords (`_`) that aren't user-emittable identifiers.
const SWIFT_KEYWORDS = new Set([
  // Declarations
  'associatedtype', 'class', 'deinit', 'enum', 'extension', 'fileprivate',
  'func', 'import', 'init', 'inout', 'internal', 'let', 'open', 'operator',
  'private', 'protocol', 'public', 'rethrows', 'static', 'struct', 'subscript',
  'typealias', 'var',
  // Statements
  'break', 'case', 'continue', 'default', 'defer', 'do', 'else', 'fallthrough',
  'for', 'guard', 'if', 'in', 'repeat', 'return', 'switch', 'where', 'while',
  // Expressions + types
  'as', 'Any', 'catch', 'false', 'is', 'nil', 'super', 'self', 'Self', 'throw',
  'throws', 'true', 'try',
])

// Kotlin reserved (hard) keywords — same backtick-escape mechanism:
// `fun \`fun\`() { ... }`, `val \`class\` = ...`. Kotlin reserves some
// words Swift doesn't (`fun`, `val`, `object`, `when`) and vice-versa.
//
// Source: https://kotlinlang.org/docs/keyword-reference.html
//
// Excludes soft keywords (`set`/`get`/`field` etc.) — Kotlin permits
// them as identifiers in most positions, so emit only the hard set.
const KOTLIN_KEYWORDS = new Set([
  'as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun',
  'if', 'in', 'interface', 'is', 'null', 'object', 'package', 'return',
  'super', 'this', 'throw', 'true', 'try', 'typealias', 'typeof', 'val',
  'var', 'when', 'while',
])

/**
 * Backtick-escape a Swift identifier if it collides with a reserved
 * keyword. Idempotent for non-keywords.
 *
 *   swiftIdent('Counter')   → 'Counter'
 *   swiftIdent('guard')     → '`guard`'
 *   swiftIdent('class')     → '`class`'
 *   swiftIdent('count')     → 'count'
 *
 * Apply at every identifier-position in the Swift emit: struct names,
 * let/var names, property accesses, function call labels, parameter
 * names. The escape is round-trippable — Swift accepts both
 * `` `guard` `` and the un-escaped form (when not a keyword), so the
 * emit stays human-readable for non-colliding names.
 */
export function swiftIdent(name: string): string {
  // A name that is not an identifier at all (`my-key`, `has space` — a
  // quoted object key reaching a struct field / member access) is camelCased
  // and stripped of the rest; Swift has no way to quote those. Every reader
  // of the same name (declaration, memberwise init label, member access)
  // goes through this one function, so they agree.
  if (!PLAIN_IDENT.test(name)) name = safeIdent(name).replace(/[^A-Za-z0-9_]/g, '_')
  return SWIFT_KEYWORDS.has(name) ? '`' + name + '`' : name
}

/**
 * Backtick-escape a Kotlin identifier if it collides with a reserved
 * keyword. Same shape as `swiftIdent` but with the Kotlin keyword set.
 */
export function kotlinIdent(name: string): string {
  // A non-identifier name is backtick-quoted (see `kotlinMember`) — Kotlin
  // allows it, and the serialized name stays the original string.
  if (!PLAIN_IDENT.test(name)) return kotlinMember(name)
  return KOTLIN_KEYWORDS.has(name) ? '`' + name + '`' : name
}

/**
 * A Kotlin MEMBER name — enum entry, data-class property, named-argument
 * label — for a JS-side name that may be a keyword OR not an identifier at
 * all (`'my-key'`, `'has space'`; string-literal-union enum cases and
 * quoted object keys both produce these). Kotlin backtick-quotes any such
 * name and the serialized name stays the ORIGINAL string, so a `top-left`
 * enum entry or a `my-key` field round-trips through kotlinx JSON with no
 * `@SerialName`. A name Kotlin cannot quote even in backticks falls back to
 * the camelCase `safeIdent` form (the JSON key then diverges — rare, and
 * a compile beats a silent nothing).
 */
export function kotlinMember(name: string): string {
  if (PLAIN_IDENT.test(name)) return KOTLIN_KEYWORDS.has(name) ? '`' + name + '`' : name
  if (!KOTLIN_UNQUOTABLE.test(name)) return '`' + name + '`'
  const fallback = safeIdent(name).replace(/[^A-Za-z0-9_]/g, '_')
  return KOTLIN_KEYWORDS.has(fallback) ? '`' + fallback + '`' : fallback
}

/**
 * A Swift enum-CASE name for a string-literal-union member. Swift cannot
 * backtick-quote a hyphen or a space, so the case is camelCased
 * (`top-left` → `topLeft`) and the DECLARATION keeps the original string
 * as the raw value (`case topLeft = "top-left"`) so `Codable` / storage /
 * URL round-trips are unchanged; a keyword case is backticked.
 */
export function swiftEnumCase(value: string): string {
  let ident = safeIdent(value).replace(/[^A-Za-z0-9_]/g, '_')
  if (ident === '' || /^[0-9]/.test(ident)) ident = `_${ident}`
  return swiftIdent(ident)
}
