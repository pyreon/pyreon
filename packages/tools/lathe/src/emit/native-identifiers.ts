/**
 * Identifier derivation for the `swift` / `kotlin` model plugins: property,
 * case and enum-entry names valid on BOTH platforms, whatever the wire name.
 */
import { words } from '../core/naming'

/* ------------------------------------------------------------------ */
/* Identifiers                                                         */
/* ------------------------------------------------------------------ */

/**
 * Every word either language reserves where a property, case or parameter
 * name goes: Swift's keywords (declaration, statement, expression and the
 * `Any` / `Self` / `_` type keywords) and Kotlin's hard keywords. A derived
 * name in this set gets a `_` suffix (`class` -> `class_`, `nil` -> `nil_`).
 */
const NATIVE_KEYWORDS = new Set([
  // Swift: declarations
  'associatedtype', 'borrowing', 'class', 'consuming', 'deinit', 'enum', 'extension', 'fileprivate', 'func',
  'import', 'init', 'inout', 'internal', 'let', 'open', 'operator', 'private', 'precedencegroup', 'protocol',
  'public', 'rethrows', 'static', 'struct', 'subscript', 'typealias', 'var',
  // Swift: statements
  'break', 'case', 'catch', 'continue', 'default', 'defer', 'do', 'else', 'fallthrough', 'for', 'guard', 'if',
  'in', 'repeat', 'return', 'throw', 'switch', 'where', 'while',
  // Swift: expressions and types
  'Any', 'as', 'await', 'false', 'is', 'nil', 'self', 'Self', 'super', 'throws', 'true', 'try', 'Type',
  'Protocol', '_',
  // Kotlin: hard keywords
  'fun', 'interface', 'null', 'object', 'package', 'this', 'typeof', 'val', 'when',
])

/** Enum cases also must not shadow what a raw-value / `CaseIterable` enum synthesizes. */
const SWIFT_ENUM_MEMBERS = new Set(['rawValue', 'allCases', 'hashValue', 'init'])

/** Spelled names for punctuation, so a key made only of symbols still has a name. */
const SYMBOL_WORDS: Readonly<Record<string, string>> = {
  '$': 'dollar', '+': 'plus', '-': 'minus', '*': 'star', '/': 'slash', '\\': 'backslash', '%': 'percent',
  '&': 'and', '|': 'pipe', '@': 'at', '#': 'hash', '!': 'bang', '?': 'question', '=': 'equals', '<': 'less',
  '>': 'greater', '~': 'tilde', '^': 'caret', '.': 'dot', ',': 'comma', ':': 'colon', ';': 'semicolon',
  '_': 'underscore', ' ': 'space', "'": 'quote', '"': 'quote', '(': 'paren', ')': 'paren', '[': 'bracket',
  ']': 'bracket', '{': 'brace', '}': 'brace', '`': 'backtick',
}

/**
 * The words of a wire name. One with no letter or digit (`$`, `+`, `-`, ``)
 * is spelled out (`dollar`, `plus`, `minus`, `empty`); anything else outside
 * ASCII becomes `u<hex>`. Never empty, so no name derives to a bare `_`.
 */
function spelledWords(raw: string): string[] {
  const plain = words(raw)
  if (plain.length > 0) return plain
  if (raw.length === 0) return ['empty']

  return [...raw].map((ch) => SYMBOL_WORDS[ch] ?? `u${(ch.codePointAt(0) as number).toString(16)}`)
}

/** A property / case name valid in both Swift and Kotlin. */
export function nativeIdent(raw: string): string {
  const [head = 'empty', ...rest] = spelledWords(raw)
  let out = head + rest.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
  if (/^[0-9]/.test(out)) out = `_${out}`
  if (NATIVE_KEYWORDS.has(out)) out = `${out}_`

  return out
}

/** {@link nativeIdent} for a Swift enum case, which also avoids the enum's synthesized members. */
export function swiftCaseIdent(raw: string): string {
  const out = nativeIdent(raw)
  return SWIFT_ENUM_MEMBERS.has(out) ? `${out}_` : out
}

/** A Kotlin `package` name: dot-separated identifiers, no hard keywords. */
const KOTLIN_HARD_KEYWORDS = new Set([
  'as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun', 'if', 'in', 'interface', 'is',
  'null', 'object', 'package', 'return', 'super', 'this', 'throw', 'true', 'try', 'typealias', 'typeof',
  'val', 'var', 'when', 'while',
])

export function isKotlinPackage(name: string): boolean {
  return name.split('.').every((seg) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(seg) && !KOTLIN_HARD_KEYWORDS.has(seg))
}

/** `in_progress` / `inProgress` -> `IN_PROGRESS`; `+` -> `PLUS`. */
export function kotlinEntry(value: string): string {
  const out = spelledWords(value).map((w) => w.toUpperCase()).join('_')
  return /^[0-9]/.test(out) ? `_${out}` : out
}
