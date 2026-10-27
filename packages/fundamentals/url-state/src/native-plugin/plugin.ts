// How `@pyreon/url-state` crosses to native: `useUrlState(key, default)`, a signal-shaped binding over ONE search
// parameter of the active router.
//
//   `const page = useUrlState('page', 1)`   → `PyreonUrlStateInt(router, "page", 1)`
//   `page()` / `page.set(v)`                 → the web call shape survives (`callAsFunction` / `operator invoke`)
//
// The value type is inferred from the DEFAULT literal with the integer-vs-fractional rule every other lowering
// uses (`useUrlState('page', 1)` is an Int binding, `'zoom', 1.5` a Double, `'open', false` a Bool), so
// interpolation reads "Page 1" on web and on both targets. A URL carries strings, so each non-string type emits a
// codec that mirrors the web's `inferSerializer`. Both arguments must be literals: the key is BAKED into the emit.
// An ARRAY default of scalar literals (`useUrlState('tags', ['a', 'b'])`) lowers to a list binding over the web's
// comma format, with the element type taken from the literals exactly as the web takes it from the first element
// (an empty array carries none, so its elements stay strings). An object default is a JSON codec with no native type
// to decode into at this call site, so it reports why and stays on the web.

import {
  swiftStr,
  type CallRecognizer,
  type CompilerPlugin,
  type DeclEmitter,
  type ExtDecl,
  type TypeIR,
} from '@pyreon/native-compiler/plugin-api'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

export const URL_STATE_PLUGIN_NAME = '@pyreon/url-state'
const DECL_TYPE = 'url-state'

type ScalarType = 'string' | 'int' | 'double' | 'boolean'
type ListType = 'strings' | 'ints' | 'doubles' | 'booleans'
type ValueType = ScalarType | ListType

interface UrlStatePayload {
  readonly key: string
  /** Target syntax, not a value: quoted for a string, bare for a number or boolean. Empty for a list (see `elements`). */
  readonly defaultValue: string
  readonly valueType: ValueType
  /** A list default's elements, as plain text: a string's characters, or a number / boolean's source text. */
  readonly elements?: readonly string[]
}

const urlStateOf = (decl: ExtDecl): UrlStatePayload => decl.payload as unknown as UrlStatePayload

/**
 * Value type → emitted helper. A total `Record` rather than a lookup with a fallback: adding a `valueType` without an
 * emitter is then a compile error, not a silent default to the string helper. The helpers are declared in the
 * router runtimes (`native-router-swift` / `native-router-kotlin`), which own the search-parameter API.
 */
const HELPER: Record<ValueType, string> = {
  string: 'PyreonUrlState',
  int: 'PyreonUrlStateInt',
  double: 'PyreonUrlStateDouble',
  boolean: 'PyreonUrlStateBool',
  strings: 'PyreonUrlStateStrings',
  ints: 'PyreonUrlStateInts',
  doubles: 'PyreonUrlStateDoubles',
  booleans: 'PyreonUrlStateBools',
}

/** What `binding()` returns for a list binding, so a method chained onto it (`tags().length`) lowers with a typed receiver. */
const LIST_TYPE: Record<ListType, TypeIR> = {
  strings: { kind: 'array', element: { kind: 'string' } },
  ints: { kind: 'array', element: { kind: 'number' } },
  doubles: { kind: 'array', element: { kind: 'number', float: true } },
  booleans: { kind: 'array', element: { kind: 'boolean' } },
}

const isListType = (t: ValueType): t is ListType => t in LIST_TYPE

/**
 * Why a default was rejected — the reason has to match the SHAPE. Every rejection used to say "an array or object
 * default", which sent the author of `useUrlState('k', 1e999)` (a literal that parses to `Infinity`) looking for a
 * collection they never wrote.
 */
function defaultRejection(defNode: AnyNode | undefined): string {
  const inner =
    defNode?.type === 'UnaryExpression' && (defNode.operator === '-' || defNode.operator === '+')
      ? (defNode.argument as AnyNode | undefined)
      : defNode
  if (inner?.type === 'ArrayExpression') {
    return 'an array default lowers only when every element is a string, number or boolean LITERAL of ONE type (the web types the elements from the first one, so a mixed array is a type the native lists cannot hold).'
  }
  if (inner?.type === 'ObjectExpression') {
    return 'an object default infers a JSON codec on the web, and there is no native type to decode into at this call site.'
  }
  const nonFinite =
    (inner?.type === 'Literal' && typeof inner.value === 'number' && !Number.isFinite(inner.value)) ||
    (inner?.type === 'Identifier' && (inner.name === 'Infinity' || inner.name === 'NaN'))
  if (nonFinite) {
    return 'this default is a NON-FINITE number (`Infinity` / `NaN` — a literal like `1e999` overflows to `Infinity`), which has no Int or Double literal on either native target and does not round-trip through the URL.'
  }
  return 'this default is not a literal, so its type cannot be decided at compile time.'
}

/**
 * The second argument as the native initializer text plus the value type the emit builds a codec for. A missing
 * default stays the empty string (the web would carry `undefined` through its `default:` serializer arm; native has
 * no null-valued binding to represent that). `null` for anything that is not a scalar literal.
 */
interface ResolvedDefault {
  readonly defaultValue: string
  readonly valueType: ValueType
  readonly elements?: readonly string[]
}

/** One array element as plain text plus its scalar kind, or `null` for anything that is not a finite scalar literal. */
function listElement(node: AnyNode | undefined): { text: string; kind: 'string' | 'number' | 'boolean' } | null {
  if (!node) return null
  let sign = ''
  let lit = node
  if (lit.type === 'UnaryExpression' && (lit.operator === '-' || lit.operator === '+')) {
    const inner = lit.argument as AnyNode | undefined
    if (inner?.type !== 'Literal' || typeof inner.value !== 'number') return null
    if (lit.operator === '-') sign = '-'
    lit = inner
  }
  if (lit.type !== 'Literal') return null
  const v = lit.value
  if (typeof v === 'string') return { text: v, kind: 'string' }
  if (typeof v === 'boolean') return { text: String(v), kind: 'boolean' }
  if (typeof v === 'number' && Number.isFinite(v)) return { text: `${sign}${v}`, kind: 'number' }
  return null
}

/**
 * An array default, typed the way the web types it (`inferElementCodec` reads the FIRST element; an empty array has none,
 * so its elements stay strings). Every element must be a literal of that one kind — a mixed array would need a native
 * type neither target has — and a number list is Int unless some element is fractional, the repo-wide
 * `inferTypeFromInitial` rule applied to the whole list.
 */
function resolveListDefault(arr: AnyNode): ResolvedDefault | null {
  const nodes = (arr.elements as (AnyNode | null)[] | undefined) ?? []
  const items: { text: string; kind: 'string' | 'number' | 'boolean' }[] = []
  for (const n of nodes) {
    const el = n === null ? null : listElement(n)
    if (el === null) return null
    items.push(el)
  }
  if (items.length === 0) return { defaultValue: '', valueType: 'strings', elements: [] }
  const kind = items[0]!.kind
  if (items.some((i) => i.kind !== kind)) return null
  const elements = items.map((i) => i.text)
  if (kind === 'string') return { defaultValue: '', valueType: 'strings', elements }
  if (kind === 'boolean') return { defaultValue: '', valueType: 'booleans', elements }
  const fractional = items.some((i) => !Number.isInteger(Number(i.text)))
  return { defaultValue: '', valueType: fractional ? 'doubles' : 'ints', elements }
}

function resolveDefault(defNode: AnyNode | undefined): ResolvedDefault | null {
  if (defNode === undefined) return { defaultValue: '""', valueType: 'string' }
  if (defNode.type === 'ArrayExpression') return resolveListDefault(defNode)
  // `useUrlState('offset', -1)` parses as a unary wrapping the literal.
  let node = defNode
  let sign = ''
  if (node.type === 'UnaryExpression' && (node.operator === '-' || node.operator === '+')) {
    const inner = node.argument as AnyNode | undefined
    if (inner?.type !== 'Literal' || typeof inner.value !== 'number') return null
    // A leading `+` is identity in both target languages but reads as an operator; keep only a real negation.
    if (node.operator === '-') sign = '-'
    node = inner
  }
  if (node.type !== 'Literal') return null
  const v = node.value
  if (typeof v === 'string') return { defaultValue: JSON.stringify(v), valueType: 'string' }
  if (typeof v === 'boolean') return { defaultValue: String(v), valueType: 'boolean' }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null
    return Number.isInteger(v)
      ? { defaultValue: `${sign}${v}`, valueType: 'int' }
      : { defaultValue: `${sign}${v}`, valueType: 'double' }
  }
  return null
}

const recognizeUrlState: CallRecognizer = (_call, ctx) => {
  const name = ctx.declName
  const keyNode = ctx.args[0] as AnyNode | undefined
  const defNode = ctx.args[1] as AnyNode | undefined
  // Both arguments must be literals so the key can be baked into the emit — the same conservative rule as useFetch's
  // URL and useStorage's key. A dynamic key would need a runtime lookup the value type does not carry.
  const key = ctx.staticString(keyNode)
  if (key === null) {
    // Dropping the declaration silently left every later reference pointing at a binding that no longer existed, so
    // both targets failed to compile with nothing naming the cause.
    ctx.report(
      `const ${name} = useUrlState(…) needs a statically-known key: an inline string, or a module-scope \`const\` holding one. The key is BAKED into the native emit (there is no runtime key lookup in the lowered value), so a computed or imported key cannot be resolved at build time. Move the key into a module-scope const in this file, or keep the call behind a \`<Web>\` escape hatch.`,
    )
    return null
  }
  const resolved = resolveDefault(defNode)
  if (resolved === null) {
    ctx.report(
      `const ${name} = useUrlState(${JSON.stringify(key)}, …) lowers with a STRING, NUMBER or BOOLEAN default — ${defaultRejection(defNode)} Use a scalar and parse it, or keep the call behind a \`<Web>\` escape hatch.`,
    )
    return null
  }
  return {
    type: DECL_TYPE,
    payload: {
      key,
      defaultValue: resolved.defaultValue,
      valueType: resolved.valueType,
      ...(resolved.elements === undefined ? {} : { elements: resolved.elements }),
    },
  }
}

/** One list element as target syntax: a string is quoted by the target's own escaper, a Double always carries its point. */
function listLiteral(valueType: ValueType, text: string, quote: (s: string) => string): string {
  if (valueType === 'strings') return quote(text)
  return valueType === 'doubles' ? doubleLiteral(text) : text
}

/** A number's source text as a Double literal both targets accept (`2` -> `2.0`; Kotlin will not widen an Int literal inside `listOf`). */
const doubleLiteral = (text: string): string => (/[.eE]/.test(text) ? text : `${text}.0`)

const urlStateDecl: DeclEmitter = {
  // The declaration was a closed `url-state` compiler kind before it moved here; the struct names the compiler
  // derives from a declaration's shape hash it under that name, so emitted names did not move.
  legacyKind: DECL_TYPE,
  // `q` is CALLABLE (`callAsFunction` / `operator invoke`), so a reference keeps its parens — unlike `useParams`,
  // which returns a dictionary.
  callable: true,
  // The Swift value type wraps the active router's query, so the View needs the router in its environment.
  usesRouter: true,
  swift(decl, ctx) {
    const { key, defaultValue, valueType, elements } = urlStateOf(decl)
    // `defaultValue` arrives as target syntax, so it is interpolated, not re-stringified.
    const helper = HELPER[valueType]
    const initial = elements === undefined ? defaultValue : `[${elements.map((e) => listLiteral(valueType, e, swiftStr)).join(', ')}]`
    return `private var ${ctx.ident(decl.name)}: ${helper} { ${helper}(router: pyreonRouter, key: ${swiftStr(key)}, defaultValue: ${initial}) }`
  },
  kotlin(decl, ctx) {
    const { key, defaultValue, valueType, elements } = urlStateOf(decl)
    const initial =
      elements === undefined ? defaultValue : `listOf(${elements.map((e) => listLiteral(valueType, e, ctx.stringLiteral)).join(', ')})`
    // The router comes from `LocalPyreonRouter.current`, NOT a `useRouter()` call: router-kotlin ships useNavigate /
    // useParams / useLoaderData and no useRouter at all. The emit once called one and the STUB declared it, so every
    // stub-level check passed while a real `gradle assembleDebug` failed — a superset stub masking a real emit bug.
    return `val ${ctx.ident(decl.name)} = ${HELPER[valueType]}(LocalPyreonRouter.current, ${ctx.stringLiteral(key)}, ${initial})`
  },
  // Only a LIST binding has a type worth declaring: a scalar interpolates through `callAsFunction` regardless, and giving
  // it a type here would change what every existing url-state emit infers.
  typing: {
    value(decl) {
      const { valueType } = urlStateOf(decl)
      return isListType(valueType) ? LIST_TYPE[valueType] : undefined
    },
  },
}

/**
 * The `@pyreon/url-state` native plugin. Shipped by `@pyreon/url-state` itself and discovered from its manifest
 * (`pyreon.native.plugin`) when a source file imports the package.
 */
export const urlStatePlugin: CompilerPlugin = Object.freeze({
  name: URL_STATE_PLUGIN_NAME,
  apiVersion: 2,
  modules: Object.freeze([URL_STATE_PLUGIN_NAME]),
  calls: Object.freeze({ useUrlState: recognizeUrlState }),
  decls: Object.freeze({ [DECL_TYPE]: urlStateDecl }),
})
