// How `@pyreon/rx` crosses to native: `const active = rx.filter(todos, p)` becomes a computed over the source signal's
// collection, rendered as the idiomatic native collection call on each target.
//
//   Swift   → `todos.filter(p)`, `Array(todos.prefix(n))`, `todos.reduce(seed, f)`, …
//   Kotlin  → `todos.filter(p)`, `todos.take(n)`, `todos.fold(seed, f)`, …
//
// Namespace and standalone calls lower recursively, resolved through their lexical IMPORT (including aliases). A
// standalone transform (`filter(src, p)` — an alias such as `filter as keep` is the export, a
// same-named import from elsewhere is not). `pipe` does not lower (measured: each stage would emit as an
// immediately-applied closure that loses its parameter type and fails to compile on both targets).

import {
  type CompilerPlugin,
  type CallExprRecognizer,
  type ExtExprSpec,
  type ModuleParseContext,
  type ModuleScan,
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

const METHODS_WITH_ARGUMENT = new Set([
  'filter',
  'map',
  'take',
  'skip',
  'takeWhile',
  'dropWhile',
  'find',
  'some',
  'every',
])

const methodOf = (e: ExtExprIR): string => (e.payload as { method: string }).method

type ImportState = {
  imports: Map<string, string>
  reported: WeakSet<object>
  reference?: ModuleScan['isImportedReference'] | undefined
}
const emptyImports = (): ImportState => ({ imports: new Map(), reported: new WeakSet() })

/** Keep the lexical query with this file's imported export names; no state survives the transform. */
const scanRx: ModuleScanner = (scan) => {
  if (typeof scan.isImportedReference !== 'function') {
    throw new Error(
      '[Pyreon] The rx native plugin requires lexical import recognition. Upgrade @pyreon/native-compiler together with @pyreon/rx.',
    )
  }
  const state = scan.fileState(IMPORTED_KEY, emptyImports)
  state.reference = scan.isImportedReference
  for (const node of scan.body as readonly AnyNode[]) {
    if (node.type !== 'ImportDeclaration' || node.source?.value !== RX_PLUGIN_NAME) continue
    for (const spec of (node.specifiers as AnyNode[] | undefined) ?? []) {
      const exported = spec.type === 'ImportNamespaceSpecifier' ? '*' : spec.imported?.name
      const local = spec.local?.name as string | undefined
      if (exported && local) state.imports.set(local, exported)
    }
  }
}

type RecognitionContext = Pick<ModuleParseContext, 'fileState' | 'expr'> & {
  report(message: string): void
}

/** Match the original identifier reference, so a local shadow never becomes a package transform. */
function recognizeCall(
  callee: AnyNode,
  args: readonly AnyNode[],
  ctx: RecognitionContext,
  expression = false,
): ExtExprSpec | null | undefined {
  const state = ctx.fileState(IMPORTED_KEY, emptyImports)
  if (!state.reference || state.imports.size === 0) return undefined
  let methodName: string | undefined
  let namespaceForm = false
  if (callee?.type === 'MemberExpression') {
    const obj = callee.object as AnyNode | undefined
    if (obj?.type !== 'Identifier') return undefined
    const imported = state.imports.get(obj.name)
    if ((imported !== 'rx' && imported !== '*') || !state.reference(obj, RX_PLUGIN_NAME, imported))
      return undefined
    const prop = callee.property as AnyNode | undefined
    if (callee.computed || prop?.type !== 'Identifier') return null
    methodName = prop.name as string | undefined
    namespaceForm = true
  } else if (callee?.type === 'Identifier') {
    methodName = state.imports.get(callee.name as string)
    if (!methodName || !state.reference(callee, RX_PLUGIN_NAME, methodName)) return undefined
  } else {
    return undefined
  }
  if (!methodName) return namespaceForm ? null : undefined
  const refuse = namespaceForm ? null : undefined
  // Curried-looking calls such as pipe(xs, map(fn)) are outside the source-first API. Leave their syntax to the
  // unsupported outer call rather than inventing a collection operation with a missing predicate/count.
  const required = methodName === 'reduce' ? 3 : METHODS_WITH_ARGUMENT.has(methodName) ? 2 : 1
  if (expression && RX_V1_METHODS.has(methodName) && args.length < required) return undefined
  const report = (message: string) => {
    if (state.reported.has(callee)) return
    state.reported.add(callee)
    ctx.report(message)
  }
  if (methodName === 'pipe') {
    report(
      'pipe() has no native lowering — each stage would emit as an immediately-applied closure, which loses its parameter type and fails to compile on both targets. Chain the standalone transforms instead (const a = filter(src, p); const b = map(a, f)), which do lower, or keep the call behind a `<Web>` escape hatch.',
    )
    return refuse
  }
  const sourceArg = args[0]
  if (!sourceArg) {
    report(`rx.${methodName} requires a signal source as its first argument.`)
    return refuse
  }
  if (!RX_V1_METHODS.has(methodName)) {
    report(
      `rx.${methodName} is not yet lowered to native (v1 covers ${[...RX_V1_METHODS].join(' / ')}; remaining methods need Strategy B runtime ports — see docs/src/content/docs/multiplatform-libraries.md).`,
    )
    return refuse
  }
  // A nested transform already denotes its native collection value. Other sources are accessors and need a read.
  const source = ctx.expr(sourceArg)
  const value: ExprIR = isRxExpr(source) ? source : { kind: 'call', callee: source, args: [] }
  return {
    type: EXPR_TYPE,
    payload: { method: methodName },
    args: [value, ...args.slice(1).map((arg) => ctx.expr(arg))],
  }
}

function isRxExpr(expr: ExprIR): expr is ExtExprIR {
  return expr.kind === 'ext-expr' && expr.plugin === RX_PLUGIN_NAME && expr.type === EXPR_TYPE
}

const recognizeRx: DeclCallRecognizer = (site, ctx) => {
  const result = recognizeCall(site.callee, site.args, { ...ctx, report: ctx.warn })
  return result ? { computed: result } : result
}

const recognizeRxExpression: CallExprRecognizer = (site, ctx) => {
  if (site.construct) return undefined
  // The JS transform returns an accessor; native rx IR is its value. Consume an immediate accessor read exactly once.
  const callee = site.callee as AnyNode
  if (callee.type === 'CallExpression' && site.args.length === 0) {
    const result = recognizeCall(callee.callee, callee.arguments, ctx, true)
    if (result !== undefined) return result
  }
  return recognizeCall(callee, site.args, ctx, true)
}

const rxExpr: ExprEmitter = {
  // The node was a closed `rx-call` expression kind before it moved here; the struct names the compiler derives from an
  // expression's shape hash it under that name, so emitted names did not move.
  legacyHash: (e) => ({
    kind: EXPR_TYPE,
    method: methodOf(e),
    source: e.args[0],
    args: e.args.slice(1),
  }),
  typing: {
    // Type the computed so it gets a useful return-type annotation. Mirrors the per-method dispatch in the emitters.
    type(e, infer): TypeIR {
      const sourceType = infer(e.args[0] as ExprIR)
      const elementType: TypeIR =
        sourceType.kind === 'array' ? sourceType.element : { kind: 'unknown' }
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
    const arg = (i: number): string =>
      e.args[i + 1] === undefined ? '' : ctx.expr(e.args[i + 1] as ExprIR)
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
    const arg = (i: number): string =>
      e.args[i + 1] === undefined ? '' : ctx.expr(e.args[i + 1] as ExprIR)
    const intArg = (i: number): string =>
      e.args[i + 1] === undefined ? '' : ctx.intArg(e.args[i + 1] as ExprIR)
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
  apiVersion: 2,
  modules: Object.freeze([RX_PLUGIN_NAME]),
  scanModule: scanRx,
  declCalls: recognizeRx,
  callExprs: recognizeRxExpression,
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
