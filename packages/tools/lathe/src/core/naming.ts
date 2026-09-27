/**
 * Identifier derivation.
 *
 * Two rules govern everything here. Output must be a VALID identifier on every
 * target — a spec is free to name a property `2fa-enabled` or `class`, and TS,
 * Swift and Kotlin each disagree about which of those is legal. And the mapping
 * must be STABLE: regenerating an unchanged spec must produce byte-identical
 * files, or every regeneration is an unreviewable diff.
 */

import type { IrOperation } from './ir'

/** Reserved across TS + Swift + Kotlin, unioned. Suffix `_` on a collision. */
const RESERVED = new Set([
  // TypeScript / JS
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for',
  'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return',
  'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void',
  'while', 'with', 'yield', 'let', 'static', 'await', 'implements', 'interface',
  'package', 'private', 'protected', 'public',
  // Not keywords, but a SyntaxError as a binding name in strict (ESM) code.
  'eval', 'arguments',
  // Swift
  'associatedtype', 'deinit', 'extension', 'fileprivate', 'func', 'guard',
  'inout', 'internal', 'operator', 'protocol', 'repeat', 'self', 'struct',
  'subscript', 'where', 'defer', 'init', 'is', 'rethrows', 'throws', 'Any',
  // Kotlin
  'as', 'fun', 'object', 'val', 'when', 'typealias', 'sealed', 'data',
])

/**
 * Global names the GENERATED code itself references, which a model must not
 * shadow. A spec model named `Record` emitted `export type Record = …` into a
 * module whose free-form maps are typed `Record<string, …>` -- the reference
 * then resolves to the model, and the file stops compiling. Suffixed like a
 * keyword. Applies to TYPE identifiers only: an operation named `map` is
 * harmless, a model named `Map` is not.
 */
const TYPE_RESERVED = new Set([
  'Record', 'Partial', 'Required', 'Readonly', 'NonNullable', 'Array', 'ReadonlyArray',
  'Promise', 'Map', 'Set', 'Date', 'Error', 'Object', 'String', 'Number', 'Boolean',
  'Symbol', 'BigInt', 'JSON', 'Math', 'Function', 'Infer', 'Schema', 'Blob', 'File',
  'FormData', 'URLSearchParams', 'Response', 'Request', 'Headers',
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
  if (RESERVED.has(out) || TYPE_RESERVED.has(out)) out = `${out}_`
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
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return name
  // `JSON.stringify` leaves U+2028 / U+2029 RAW, and both are line terminators
  // in JavaScript source even though they are legal inside a JSON string -- so
  // a property name carrying one would end the emitted literal.
  return JSON.stringify(name).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
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
 * Assign unique identifiers to a list of raw names, deterministically.
 *
 * Two rules, and the second is the one a numeric-suffix counter got wrong:
 *
 *  1. A raw name that is ALREADY its own identifier keeps it. Those are
 *     reserved first, so `User2` in the spec is `User2` in the output no matter
 *     where it sorts.
 *  2. Every other name takes the first FREE candidate -- `base`, `base2`,
 *     `base3`, … -- checked against every name assigned so far.
 *
 * The previous counter tracked how often each BASE had been seen and never
 * checked the suffixed result against names already taken, so `User`,
 * `User2`, `user` became `User`, `User2`, `User2`: one `User2` overwrote the
 * other, and a `$ref` to the integer `User2` silently bound to the boolean
 * one. Collisions are never resolved by DROPPING an entry.
 *
 * `derive` must be deterministic; `raws` must arrive in a stable order.
 * Returns one name per input, index-aligned (duplicate raws get distinct names).
 */
export function assignNames(raws: readonly string[], derive: (raw: string) => string): string[] {
  const out: (string | undefined)[] = raws.map(() => undefined)
  const taken = new Set<string>()
  // Pass 1: exact names reserve themselves (first occurrence only).
  raws.forEach((raw, i) => {
    const d = derive(raw)
    if (d === raw && !taken.has(d)) {
      taken.add(d)
      out[i] = d
    }
  })
  // Pass 2: everything else takes the first free candidate.
  raws.forEach((raw, i) => {
    if (out[i] !== undefined) return
    const base = derive(raw)
    let name = base
    for (let n = 2; taken.has(name); n++) name = `${base}${n}`
    taken.add(name)
    out[i] = name
  })
  return out as string[]
}

/**
 * The file-name stem for a tag: `Pet Store` -> `pet-store`.
 *
 * Lowercased, so two tags that differ only in case map to ONE file; the input
 * layer makes tags unique under this function before any emitter sees them.
 */
export function tagFile(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'default'
}

/**
 * Names the EMITTED modules already bind, per namespace (audit A14).
 *
 * {@link RESERVED} protects against the three LANGUAGES. These protect against
 * the generator itself: an operation called `api` emitted
 * `import { api } from '../client'; export const api = api.endpoint(...)`, a
 * model called `Record` turned every emitted `Record<string, …>` into a
 * reference to the model, and an operation called `query` produced a hook
 * named `useQuery` beside the imported `useQuery`. None of these is exotic —
 * DNS APIs have a `Record` model, search APIs a `query` operation.
 *
 * VALUE names are what an operation id becomes (an endpoint `const`, and
 * `use<Id>` for its hook). TYPE names are what a model becomes.
 */
const EMITTER_VALUES = new Set([
  // client + validator bindings in the endpoint modules
  'api', 's', 'z', 'standardSchema', 'createHttp',
  // exports of the generated entries
  'keys', 'configureApi', 'auth', 'optimisticUpdate', 'setDevTransport', 'installMocks', 'mockRoutes', 'mockRouteTable',
  'routes', 'mock', 'faker', 'mockOperation', 'resetMocks', 'mockCalls', 'apiBaseUrl', 'createMock',
  // `use<Id>` must never equal an imported hook
  'query', 'mutation', 'queryClient', 'infiniteQuery', 'queries', 'isFetching', 'isMutating',
])
const EMITTER_TYPES = new Set([
  // helpers the emitters import or reference by name
  'Infer', 'Schema', 'MockRoute', 'HttpMiddleware', 'Endpoint', 'EndpointKey', 'EndpointArgs',
  'QueryValue', 'QueryOptionsLike', 'MutationOptionsLike', 'DevRequest', 'DevAnswer',
  'DevTransport', 'LatheHttpError', 'StandardSchema', 'StandardResult', 'AxiosInstance',
  'KyInstance', 'ApiConfig', 'ValidateMode', 'MockedOperation', 'Credential',
  // globals the emitted TYPES spell
  'Record', 'Partial', 'Array', 'ReadonlyArray', 'Promise', 'Readonly', 'Omit', 'Pick',
  'Required', 'NonNullable', 'ReturnType', 'Awaited', 'Parameters', 'Exclude', 'Extract',
  'Error', 'Date', 'Blob', 'File', 'FormData', 'Response', 'Request', 'Headers', 'URL',
  'URLSearchParams', 'ReadableStream', 'ArrayBuffer', 'Uint8Array', 'AbortSignal', 'Map',
  'Set', 'Object', 'String', 'Number', 'Boolean', 'Symbol', 'BigInt', 'Function', 'JSON',
])

/**
 * An operation id that cannot shadow anything the emitters bind.
 *
 * Suffixed with a WORD, not `_`: the id is re-cased into `use<Id>` for its
 * hook, and `pascal()` drops underscores, so `query_` would become `useQuery`
 * all over again.
 */
export function operationIdent(input: string): string {
  const out = ident(input)
  return EMITTER_VALUES.has(out) ? `${out}Op` : out
}

/** A model name that cannot shadow anything the emitters bind. Same reasoning. */
export function modelIdent(input: string): string {
  const out = typeIdent(input)
  return EMITTER_TYPES.has(out) ? `${out}Model` : out
}

/**
 * The query / mutation hook an operation gets, or `undefined` when the config
 * (or a plugin) turned it off. ONE derivation for every emitter that names a
 * hook -- the queries module, the previews, the infinite hook and the docs --
 * so a `naming.hook` rename can never reach some of them and not others.
 */
export function hookOf(op: IrOperation): string | undefined {
  if (op.hook === false) return undefined
  return op.hook ?? `use${typeIdent(op.id)}`
}
