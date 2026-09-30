/**
 * The ARGUMENT SHAPES of the JS Array/String methods PMTC maps.
 *
 * Both emitters lower a JS method call through a `switch (prop)` whose arms
 * are gated on an argument count (or a literal-argument shape). An arm that
 * does not match `break`s out into the GENERIC member emit, which re-emits the
 * call VERBATIM under its web name. For a method the native stdlib spells the
 * same way that is fine; for every other one it is a silent mis-emit —
 * `s.toUpperCase('tr')` became Swift `s.toUpperCase("tr")`, `xs.filter(fn,
 * ctx)` became `xs.filter(fn, ctx)`, `xs.indexOf(x, 2)` became Kotlin
 * `xs.indexOf(x, 2)` on a `List` — none of which exist, and none warned.
 *
 * `unmappedMethodWarning` (unlowered-props.ts) catches methods with NO arm.
 * This module catches the other half of the same class: methods that ARE
 * mapped, reached with an argument shape their arm does not cover. It is keyed
 * on the method's JS signature rather than on each arm, so a new arm cannot
 * forget to name its own uncovered shapes.
 *
 * Two outcomes, never a silent verbatim emit:
 *
 *   - arguments JS ITSELF ignores (a `thisArg` handed to an arrow callback,
 *     any argument to `toUpperCase()` / `trim()` / `reverse()`) are DROPPED —
 *     the lowering of the core arity is then exactly what JS computes — with a
 *     named warning, because the dropped argument is also not evaluated;
 *   - every other uncovered shape reaches the verbatim emit with a named
 *     warning saying what to write instead.
 *
 * The faithfully expressible extra arguments (`indexOf` / `includes`
 * `fromIndex`, `startsWith` `position`, `endsWith` `endPosition`, `split`
 * `limit`) are LOWERED in the emitters' own arms and never reach here.
 */
import type { TypeIR } from './types'

export type MethodReceiver = 'array' | 'string' | 'number'

function receiverNoun(r: MethodReceiver): string {
  return r === 'array' ? 'an array' : r === 'string' ? 'a string' : 'a number'
}

function own<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined
}

/** The receiver kind an Array/String method dispatches on, or undefined. */
export function methodReceiverKind(t: TypeIR): MethodReceiver | undefined {
  const base = t.kind === 'union' ? t.branches.find((b) => b.kind !== 'null' && b.kind !== 'undefined') : t
  if (base?.kind === 'array' || base?.kind === 'string' || base?.kind === 'number') return base.kind
  return undefined
}

/** JS parameter names per mapped method, by receiver — used to NAME an uncovered argument. */
const JS_METHOD_PARAMS: Readonly<Record<MethodReceiver, Readonly<Record<string, readonly string[]>>>> = {
  array: {
    at: ['index'],
    concat: ['...items'],
    every: ['predicate', 'thisArg'],
    fill: ['value', 'start', 'end'],
    filter: ['predicate', 'thisArg'],
    find: ['predicate', 'thisArg'],
    findIndex: ['predicate', 'thisArg'],
    findLast: ['predicate', 'thisArg'],
    flat: ['depth'],
    flatMap: ['callback', 'thisArg'],
    forEach: ['callback', 'thisArg'],
    includes: ['searchElement', 'fromIndex'],
    indexOf: ['searchElement', 'fromIndex'],
    join: ['separator'],
    lastIndexOf: ['searchElement', 'fromIndex'],
    map: ['callback', 'thisArg'],
    reduce: ['callback', 'initialValue'],
    reverse: [],
    slice: ['start', 'end'],
    some: ['predicate', 'thisArg'],
    toString: [],
  },
  string: {
    at: ['index'],
    charAt: ['index'],
    charCodeAt: ['index'],
    concat: ['...strings'],
    endsWith: ['searchString', 'endPosition'],
    includes: ['searchString', 'position'],
    indexOf: ['searchString', 'position'],
    lastIndexOf: ['searchString', 'position'],
    padEnd: ['targetLength', 'padString'],
    padStart: ['targetLength', 'padString'],
    repeat: ['count'],
    replace: ['pattern', 'replacement'],
    replaceAll: ['pattern', 'replacement'],
    slice: ['start', 'end'],
    split: ['separator', 'limit'],
    startsWith: ['searchString', 'position'],
    substring: ['start', 'end'],
    toLowerCase: [],
    toString: [],
    toUpperCase: [],
    trim: [],
    trimEnd: [],
    trimStart: [],
  },
  number: {
    toFixed: ['digits'],
    toLocaleString: ['locales', 'options'],
    toString: ['radix'],
  },
}

/**
 * The `thisArg` methods: dropping the `thisArg` is faithful, because it only
 * binds `this` for a `function` callback and PMTC lowers no `this` — every
 * callback it accepts is an arrow or a helper reference. `core` is the arity
 * the lowering is re-run with. (Arguments past a method's declared parameter
 * list are handled generically in `ignoredTrailingArgs`.)
 */
const IGNORED_TRAILING: Readonly<Record<MethodReceiver, Readonly<Record<string, number>>>> = {
  array: {
    every: 1,
    filter: 1,
    find: 1,
    findIndex: 1,
    findLast: 1,
    flatMap: 1,
    forEach: 1,
    map: 1,
    some: 1,
  },
  string: {},
  number: {},
}

/**
 * When `method` on `receiver` was called with arguments JS ignores, the arity
 * to lower it at instead, plus the warning naming what was dropped. Two
 * sources: the table above, and — for every mapped method — any argument past
 * its declared parameter list, which a JS function never reads
 * (`s.charCodeAt(0, 1)` is `s.charCodeAt(0)`).
 */
export function ignoredTrailingArgs(
  method: string,
  argc: number,
  receiver: MethodReceiver | undefined,
): { core: number; warning: string } | undefined {
  if (receiver === undefined) return undefined
  // `Object.hasOwn`, not a bare index: `toString` / `constructor` are
  // inherited members of every plain object.
  const params = own(JS_METHOD_PARAMS[receiver], method)
  if (params === undefined) return undefined
  const variadic = params.some((p) => p.startsWith('...'))
  const core = own(IGNORED_TRAILING[receiver], method) ?? (variadic ? undefined : params.length)
  if (core === undefined || argc <= core) return undefined
  const dropped = params[core]
  const extra = argc - core === 1 ? 'argument' : 'arguments'
  const why =
    dropped === 'thisArg'
      ? 'a `thisArg` only binds `this` inside a `function` callback, and native closures have no `this` — use the value directly inside the callback'
      : `JS \`.${method}(${params.slice(0, core).join(', ')})\` takes ${core === 0 ? 'no arguments' : core === 1 ? '1 argument' : `${core} arguments`} and ignores the rest` +
        `${method === 'toUpperCase' || method === 'toLowerCase' ? ` (the locale-aware form is \`.toLocale${method.slice(2)}()\`, which has no native lowering)` : ''} — delete ${argc - core === 1 ? 'it' : 'them'}`
  return {
    core,
    warning:
      `\`.${method}(…)\` on ${receiverNoun(receiver)}: the extra ${dropped === 'thisArg' ? '`thisArg` argument' : extra} ` +
      `${argc - core === 1 ? 'is' : 'are'} dropped on iOS and Android and NOT evaluated — ${why}.`,
  }
}

/**
 * `method/argc` (or `receiver.method/argc`) shapes whose VERBATIM re-emit is valid native with JS
 * semantics — measured against swiftc / kotlinc. Everything else that reaches
 * the verbatim emit for a mapped method warns.
 */
const VERBATIM_OK: Readonly<Record<'swift' | 'kotlin', ReadonlySet<string>>> = {
  // Swift's Sequence spells these the same way with the same closure shape.
  swift: new Set(['map/1', 'forEach/1', 'filter/1', 'flatMap/1']),
  kotlin: new Set([
    'map/1',
    'forEach/1',
    'filter/1',
    'flatMap/1',
    'find/1',
    'findLast/1',
    // Kotlin `reduce { acc, x -> }` is JS's seedless reduce.
    'reduce/1',
    'indexOf/1',
    'lastIndexOf/1',
    'substring/1',
    'substring/2',
    'split/1',
    'startsWith/1',
    'endsWith/1',
    'repeat/1',
    'trim/0',
    'trimStart/0',
    'trimEnd/0',
    // Kotlin `List.toString()` is `[1, 2]` where JS gives `1,2` — not arrays.
    'string.toString/0',
    'number.toString/0',
  ]),
}

/** Per-method remedy for an uncovered shape — what to write instead. */
const SHAPE_REMEDY: Readonly<Record<string, string>> = {
  at: 'index with `xs[i]` (or `.at(i)` on an array)',
  charAt: 'pass exactly one index',
  charCodeAt: 'pass exactly one index',
  concat: 'concatenate one value at a time (`a.concat(b).concat(c)`)',
  fill: 'build the array with `.map((v, i) => …)` instead of a ranged `fill`',
  flat: 'call `.flat()` (depth 1) once per level',
  join: 'pass at most one separator',
  lastIndexOf: 'search a `.slice(…)` of the receiver rather than passing a `fromIndex`',
  padEnd: 'pad with a single-character string literal (or omit it for a space)',
  padStart: 'pad with a single-character string literal (or omit it for a space)',
  reduce: 'pass the reducer and an initial value (`.reduce(fn, seed)`)',
  repeat: 'pass exactly one count',
  replace: 'pass a string pattern and a string replacement',
  replaceAll: 'pass a string pattern and a string replacement',
  slice: 'use non-negative indices, or a literal negative (`slice(-2)`, `slice(0, -1)`)',
  substring: 'use non-negative indices',
  toString: 'build the string explicitly (`xs.join(",")` for an array; a radix only lowers on an integer)',
  toLocaleString: 'format the number explicitly — there is no native locale-aware number formatting to lower to',
  toFixed: 'pass one digit count',
}

/**
 * The warning for a MAPPED method reaching the verbatim emit with an argument
 * shape its arm does not cover; undefined when the verbatim form is valid on
 * `target`, or when `method` is not a mapped Array/String method.
 */
export function uncoveredMethodShapeWarning(
  method: string,
  argc: number,
  receiver: MethodReceiver | undefined,
  target: 'swift' | 'kotlin',
): string | undefined {
  if (receiver === undefined) return undefined
  const params = own(JS_METHOD_PARAMS[receiver], method)
  if (params === undefined) return undefined
  const ok = VERBATIM_OK[target]
  if (ok.has(`${method}/${argc}`) || ok.has(`${receiver}.${method}/${argc}`)) return undefined
  const shown = params.join(', ')
  const remedy = own(SHAPE_REMEDY, method) ?? `pass the arguments PMTC lowers (\`.${method}(${shown})\`)`
  return (
    `\`.${method}(…)\` on ${receiverNoun(receiver)} with ${argc} argument${argc === 1 ? '' : 's'} ` +
    `has no ${target === 'swift' ? 'Swift' : 'Kotlin'} ` +
    `lowering for this argument shape — it is emitted VERBATIM under its web name, which does not compile ` +
    `(or does not mean what JS means). Instead, ${remedy}.`
  )
}
