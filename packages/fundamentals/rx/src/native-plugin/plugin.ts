// How `@pyreon/rx` crosses to native: `const active = rx.filter(todos, p)` becomes a computed over the source signal's
// collection, rendered as the idiomatic native collection call on each target.
//
//   Swift   → `todos.filter(p)`, `Array(todos.prefix(n))`, `todos.reduce(seed, f)`, …
//   Kotlin  → `todos.filter(p)`, `todos.take(n)`, `todos.fold(seed, f)`, …
//
// Two call forms lower, both resolved through the IMPORT and never the bare name: the namespace (`rx.filter`, the object
// literally named `rx`) and the standalone transforms (`filter(src, p)` — an alias such as `filter as keep` is the export, a
// same-named import from elsewhere is not). `pipe` does not lower (measured: each stage would emit as an
// immediately-applied closure that loses its parameter type and fails to compile on both targets).

import {
  NATIVE_COMPILER_PLUGIN_API_VERSION,
  type CompilerPlugin,
  type DeclCallRecognizer,
  type ExprEmitter,
  type ExprIR,
  type ExtExprIR,
  type ModuleScanner,
  type TypeIR,
} from '@pyreon/native-compiler/plugin-api'

// biome-ignore lint/suspicious/noExplicitAny: ESTree nodes are read structurally, as in the compiler.
type AnyNode = any

export const RX_PLUGIN_NAME = '@pyreon/rx'
const EXPR_TYPE = 'rx-call'
const IMPORTED_KEY = '@pyreon/rx:imported'

const RX_V1_METHODS: ReadonlySet<string> = new Set([
  'filter',
  'map',
  'reverse',
  'count',
  'sum',
  'min',
  'max',
  'first',
  'last',
  'take',
  'skip',
  'takeWhile',
  'dropWhile',
  'find',
  'some',
  'every',
  'unique',
  'compact',
  'flatten',
  'reduce',
  'average',
])

const methodOf = (e: ExtExprIR): string => (e.payload as { method: string }).method

/** The local names imported from `@pyreon/rx`, mapped to their ORIGINAL export name. The `rx` namespace has its own recognizer. */
const scanRx: ModuleScanner = (scan) => {
  const imported = scan.fileState(IMPORTED_KEY, () => new Map<string, string>())
  for (const node of scan.body as readonly AnyNode[]) {
    if (node.type !== 'ImportDeclaration' || node.source?.value !== RX_PLUGIN_NAME) continue
    for (const spec of (node.specifiers as AnyNode[] | undefined) ?? []) {
      if (spec.type !== 'ImportSpecifier') continue
      const exported = spec.imported?.name as string | undefined
      const local = spec.local?.name as string | undefined
      if (exported && local && exported !== 'rx') imported.set(local, exported)
    }
  }
}

const recognizeRx: DeclCallRecognizer = (site, ctx) => {
  const callee = site.callee as AnyNode
  let methodName: string | undefined
  let namespaceForm = false
  if (callee?.type === 'MemberExpression') {
    const obj = callee.object as AnyNode | undefined
    if (obj?.type !== 'Identifier' || obj.name !== 'rx') return undefined
    const prop = callee.property as AnyNode | undefined
    // Any member read of `rx` is claimed, written as a method name or not (`rx['filter'](…)`, `rx[m](…)`): `rx` is not a native
    // symbol, so letting such a binding fall through would emit uncompilable `let r = rx["filter"](…)`.
    if (prop?.type !== 'Identifier') return null
    methodName = prop.name as string | undefined
    namespaceForm = true
  } else if (callee?.type === 'Identifier') {
    // STANDALONE form, resolved through the IMPORT — never the bare name.
    methodName = ctx.fileState(IMPORTED_KEY, () => new Map<string, string>()).get(callee.name as string)
    if (methodName === undefined) return undefined
  } else {
    return undefined
  }
  if (!methodName) return namespaceForm ? null : undefined
  // A reported limitation on the NAMESPACE form is a claim (`rx` is not a native symbol, so binding it as a value would emit
  // uncompilable `let r = rx.method(...)`); the standalone form declines and the rest of the chain handles the binding.
  const refuse = namespaceForm ? null : undefined
  if (methodName === 'pipe') {
    ctx.warn(
      'pipe() has no native lowering — each stage would emit as an immediately-applied closure, which loses its parameter type and fails to compile on both targets. Chain the standalone transforms instead (const a = filter(src, p); const b = map(a, f)), which do lower, or keep the call behind a `<Web>` escape hatch.',
    )
    return refuse
  }
  const args = site.args
  const sourceArg = args[0]
  if (!sourceArg) {
    ctx.warn(`rx.${methodName} requires a signal source as its first argument.`)
    return refuse
  }
  if (!RX_V1_METHODS.has(methodName)) {
    ctx.warn(
      `rx.${methodName} is not yet lowered to native (v1 covers ${[...RX_V1_METHODS].join(' / ')}; remaining methods need Strategy B runtime ports — see docs/src/content/docs/multiplatform-libraries.md).`,
    )
    return refuse
  }
  // The source signal becomes `signalName()`, the no-arg read the per-target emit lowers to the unwrapped state binding; the
  // remaining arguments (predicate, count, initial value) pass through verbatim.
  const sourceCall: ExprIR = { kind: 'call', callee: ctx.expr(sourceArg), args: [] }
  return { computed: { type: EXPR_TYPE, payload: { method: methodName }, args: [sourceCall, ...args.slice(1).map((a) => ctx.expr(a))] } }
}

const rxExpr: ExprEmitter = {
  // The node was a closed `rx-call` expression kind before it moved here; the struct names the compiler derives from an
  // expression's shape hash it under that name, so emitted names did not move.
  legacyHash: (e) => ({ kind: EXPR_TYPE, method: methodOf(e), source: e.args[0], args: e.args.slice(1) }),
  typing: {
    // Type the computed so it gets a useful return-type annotation. Mirrors the per-method dispatch in the emitters.
    type(e, infer): TypeIR {
      const sourceType = infer(e.args[0] as ExprIR)
      const elementType: TypeIR = sourceType.kind === 'array' ? sourceType.element : { kind: 'unknown' }
      switch (methodOf(e)) {
        // Transforms preserving the source's element type.
        case 'filter':
        case 'reverse':
        case 'take':
        case 'skip':
        case 'takeWhile':
        case 'dropWhile':
          return { kind: 'array', element: elementType }
        // The element type would need arrow-body typeflow (map) or per-method semantics (compact strips null, flatten unwraps
        // a level): degrade, and the per-call closure inference still typechecks.
        case 'map':
        case 'compact':
        case 'flatten':
        case 'unique':
          return { kind: 'array', element: { kind: 'unknown' } }
        // Swift `.first` / `.last` / `.first(where:)` and Kotlin `.firstOrNull` / `.find` all return Optional<T>, and so does
        // JS `rx.first(arr)` (`T | undefined`). The computed MUST be annotated `T?`: the bare element type emitted
        // `var x: T { arr.first }`, which does not typecheck.
        case 'first':
        case 'last':
        case 'find':
          return { kind: 'union', branches: [elementType, { kind: 'undefined' }] }
        case 'some':
        case 'every':
          return { kind: 'boolean' }
        // min / max are Optional (nil on an empty array); count / sum / average / reduce always produce a value.
        case 'min':
        case 'max':
          return { kind: 'union', branches: [{ kind: 'number' }, { kind: 'undefined' }] }
        // average = sum / count, always Double (the emit computes `Double(sum) / Double(count)`).
        case 'average':
          return { kind: 'number', float: true }
        case 'count':
        case 'sum':
        case 'reduce':
          return { kind: 'number' }
      }
      return { kind: 'unknown' }
    },
  },
  // `rx.reduce(xs, cb, seed)`: the same (source, reducer, seed) an array `xs.reduce(cb, seed)` has, so an integer seed over a
  // fractional accumulation is widened to a Double exactly as that form's is.
  reduce: (e) =>
    methodOf(e) === 'reduce' && e.args.length === 3
      ? { source: e.args[0] as ExprIR, reducer: e.args[1] as ExprIR, seed: e.args[2] as ExprIR }
      : undefined,
  swift(e, ctx) {
    const src = ctx.expr(e.args[0] as ExprIR)
    const arg = (i: number): string => (e.args[i + 1] === undefined ? '' : ctx.expr(e.args[i + 1] as ExprIR))
    switch (methodOf(e)) {
      case 'filter':
        return `${src}.filter(${arg(0)})`
      case 'map':
        return `${src}.map(${arg(0)})`
      case 'reverse':
        return `${src}.reversed()`
      // JS rx.compact drops null/undefined; Swift Array<T?> uses compactMap, which unwraps and drops nil.
      case 'compact':
        return `${src}.compactMap { $0 }`
      // joined() is a FlattenSequence; Array(...) makes it the concrete Array<T> consumers expect.
      case 'flatten':
        return `Array(${src}.joined())`
      // Order-preserving, because that is what rx does: rx returns FIRST-occurrence order ([3,1,2,3,4] → [3,1,2,4]) and
      // Kotlin's `distinct()` preserves it too, where `Array(Set(_:))` did not (a `<For>` over unique(...) rendered in an
      // arbitrary order on iOS and a stable one everywhere else). O(n²) against Set's O(n) — the right trade for a UI
      // list, since the alternative is the wrong answer — and it needs only Equatable, where Set needed Hashable.
      // `reduce(into: [])` would be the obvious spelling and does NOT typecheck: the empty seed leaves the accumulator
      // ambiguous, so `contains` resolves to `contains(where:)` and swiftc asks for the missing label. It reads `src`
      // twice, which is safe because a source is a pure computed-property read.
      case 'unique':
        return `${src}.enumerated().filter { ${src}.firstIndex(of: $0.element) == $0.offset }.map { $0.element }`
      // `.prefix(_:)` / `.dropFirst(_:)` return ArraySlice; Array(...) promotes to a concrete Array<T>.
      case 'take':
        return `Array(${src}.prefix(${arg(0)}))`
      case 'skip':
        return `Array(${src}.dropFirst(${arg(0)}))`
      case 'takeWhile':
        return `Array(${src}.prefix(while: ${arg(0)}))`
      case 'dropWhile':
        return `Array(${src}.drop(while: ${arg(0)}))`
      case 'first':
        return `${src}.first`
      case 'last':
        return `${src}.last`
      case 'find':
        return `${src}.first(where: ${arg(0)})`
      case 'some':
        return `${src}.contains(where: ${arg(0)})`
      case 'every':
        return `${src}.allSatisfy(${arg(0)})`
      case 'count':
        return `${src}.count`
      // Swift Array<Numeric> has reduce(_:_:) but no direct .sum().
      case 'sum':
        return `${src}.reduce(0, +)`
      case 'min':
        return `${src}.min()`
      case 'max':
        return `${src}.max()`
      // JS argument order is (reducer, initial); Swift's is (initial, reducer) — flipped.
      case 'reduce':
        return `${src}.reduce(${arg(1)}, ${arg(0)})`
      // A multi-statement closure (bind the sum, branch on empty, divide) as an IIFE for expression position.
      case 'average':
        return `({ let __xs = ${src}; return __xs.isEmpty ? 0 : Double(__xs.reduce(0, +)) / Double(__xs.count) }())`
      default:
        // Defensive: the recognizer's method set is the gate, but a method that slips through emits a noisy marker so a
        // missing dispatch is obvious in failed compiler output.
        return `/* unsupported rx.${methodOf(e)} */ ${src}`
    }
  },
  kotlin(e, ctx) {
    const src = ctx.expr(e.args[0] as ExprIR)
    const arg = (i: number): string => (e.args[i + 1] === undefined ? '' : ctx.expr(e.args[i + 1] as ExprIR))
    const intArg = (i: number): string => (e.args[i + 1] === undefined ? '' : ctx.intArg(e.args[i + 1] as ExprIR))
    switch (methodOf(e)) {
      case 'filter':
        return `${src}.filter(${arg(0)})`
      case 'map':
        return `${src}.map(${arg(0)})`
      case 'reverse':
        return `${src}.reversed()`
      case 'compact':
        return `${src}.filterNotNull()`
      case 'flatten':
        return `${src}.flatten()`
      // distinct() is insertion-order-preserving, matching rx.unique.
      case 'unique':
        return `${src}.distinct()`
      case 'take':
        return `${src}.take(${intArg(0)})`
      case 'skip':
        return `${src}.drop(${intArg(0)})`
      case 'takeWhile':
        return `${src}.takeWhile(${arg(0)})`
      case 'dropWhile':
        return `${src}.dropWhile(${arg(0)})`
      // Kotlin's first/last throw on empty; the *OrNull variants match Swift's Optional<T>.
      case 'first':
        return `${src}.firstOrNull()`
      case 'last':
        return `${src}.lastOrNull()`
      case 'find':
        return `${src}.find(${arg(0)})`
      case 'some':
        return `${src}.any(${arg(0)})`
      case 'every':
        return `${src}.all(${arg(0)})`
      // `.size` is an Int; a TS count is a Long.
      case 'count':
        return `${src}.size.toLong()`
      // Iterable<Int>.sum() / Iterable<Double>.sum() are stdlib extensions; a non-numeric source should use reduce.
      case 'sum':
        return `${src}.sum()`
      case 'min':
        return `${src}.minOrNull()`
      case 'max':
        return `${src}.maxOrNull()`
      // Same argument flip as Swift: JS order is reducer-then-initial.
      case 'reduce':
        return `${src}.fold(${arg(1)}, ${arg(0)})`
      // Kotlin's average() is NaN for empty; rx.average is 0, so an explicit empty check.
      case 'average':
        return `(${src}.let { if (it.isEmpty()) 0.0 else it.sum().toDouble() / it.size })`
      default:
        return `/* unsupported rx.${methodOf(e)} */ ${src}`
    }
  },
}

/** The `@pyreon/rx` native plugin — discovered from the package manifest when a source imports it. */
export const rxPlugin: CompilerPlugin = Object.freeze({
  name: RX_PLUGIN_NAME,
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  modules: Object.freeze([RX_PLUGIN_NAME]),
  scanModule: scanRx,
  declCalls: recognizeRx,
  exprs: Object.freeze({ [EXPR_TYPE]: rxExpr }),
  unlowered: Object.freeze({
    [RX_PLUGIN_NAME]: Object.freeze({
      // The NAMESPACE form lowers (`import { rx } from '@pyreon/rx'` → `rx.filter` / `rx.map` / …), and so do the standalone
      // COLLECTION transforms (source-first: `map(src, fn)` is structurally `rx.map(src, fn)`, and rx's own manifest reaches
      // for them 43 times against 5 for the namespace). `pipe` is deliberately not in the supported set. A package-wide
      // warning would fire on `rx` itself and break the lowering lock — the over-warning failure a per-package list invites.
      advice:
        'this export has no native lowering yet. The standalone COLLECTION transforms DO lower (filter / map / take / unique / …, source-first) — chain those through consts, or compose with `computed()`',
      supported: Object.freeze(['rx', ...RX_V1_METHODS]),
    }),
  }),
})
