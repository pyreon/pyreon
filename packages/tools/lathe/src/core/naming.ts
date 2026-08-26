/**
 * Identifier derivation.
 *
 * Two rules govern everything here. Output must be a VALID identifier on every
 * target — a spec is free to name a property `2fa-enabled` or `class`, and TS,
 * Swift and Kotlin each disagree about which of those is legal. And the mapping
 * must be STABLE: regenerating an unchanged spec must produce byte-identical
 * files, or every regeneration is an unreviewable diff.
 */

/** Reserved across TS + Swift + Kotlin, unioned. Suffix `_` on a collision. */
const RESERVED = new Set([
  // TypeScript / JS
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for',
  'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return',
  'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void',
  'while', 'with', 'yield', 'let', 'static', 'await', 'implements', 'interface',
  'package', 'private', 'protected', 'public',
  // Swift
  'associatedtype', 'deinit', 'extension', 'fileprivate', 'func', 'guard',
  'inout', 'internal', 'operator', 'protocol', 'repeat', 'self', 'struct',
  'subscript', 'where', 'defer', 'init', 'is', 'rethrows', 'throws', 'Any',
  // Kotlin
  'as', 'fun', 'object', 'val', 'when', 'typealias', 'sealed', 'data',
])

/** Split an arbitrary string into lowercase word parts. */
export function words(input: string): string[] {
  return input
    // Insert a boundary at camelCase humps before splitting.
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.toLowerCase())
}

/** `user-profile` / `user_profile` / `UserProfile` -> `userProfile`. */
export function camel(input: string): string {
  const parts = words(input)
  if (parts.length === 0) return '_'
  const head = parts[0] as string
  return head + parts.slice(1).map(title).join('')
}

/** `user-profile` -> `UserProfile`. */
export function pascal(input: string): string {
  const parts = words(input)
  if (parts.length === 0) return '_'
  return parts.map(title).join('')
}

/** `UserProfile` -> `user-profile`. Used for filenames. */
export function kebab(input: string): string {
  const parts = words(input)
  return parts.length === 0 ? '_' : parts.join('-')
}

function title(w: string): string {
  return w.charAt(0).toUpperCase() + w.slice(1)
}

/**
 * Make a string safe to use as a bare identifier on every target.
 *
 * A leading digit is prefixed rather than dropped (`2fa` -> `_2fa`), because
 * dropping it can collide two distinct spec names onto one identifier — the
 * failure mode is a generated file that overwrites half of itself.
 */
export function ident(input: string): string {
  let out = camel(input)
  if (/^[0-9]/.test(out)) out = `_${out}`
  if (RESERVED.has(out)) out = `${out}_`
  return out
}

/** {@link ident}, but PascalCase — for types, models and components. */
export function typeIdent(input: string): string {
  let out = pascal(input)
  if (/^[0-9]/.test(out)) out = `_${out}`
  if (RESERVED.has(out)) out = `${out}_`
  return out
}

/**
 * A property key as it appears in an object literal.
 *
 * Quoted only when it is not a plain identifier. Emitting `{ "id": ... }` for
 * every key would be uniformly safe and uniformly ugly; the quoting rule is
 * the same one a human writing the file would apply.
 */
export function propKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name)
}

/**
 * Derive a stable operation id from method + path when the spec omits one.
 *
 * `GET /users/{id}/posts` -> `getUsersIdPosts`. Not pretty, but deterministic
 * and collision-free for distinct routes, which is what matters more.
 */
export function operationIdFrom(method: string, path: string): string {
  const segs = path
    .split('/')
    .filter(Boolean)
    .map((s) => (s.startsWith('{') && s.endsWith('}') ? s.slice(1, -1) : s))
  return ident([method.toLowerCase(), ...segs].join(' '))
}

/**
 * Ensure uniqueness within a namespace, deterministically.
 *
 * Collisions get a numeric suffix in FIRST-SEEN order. Callers must therefore
 * feed names in a stable order (the inputs iterate sorted keys) or the suffix
 * assignment churns between runs.
 */
export function uniquifier(): (name: string) => string {
  const seen = new Map<string, number>()
  return (name: string): string => {
    const n = seen.get(name) ?? 0
    seen.set(name, n + 1)
    return n === 0 ? name : `${name}${n + 1}`
  }
}
