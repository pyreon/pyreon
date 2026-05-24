// Type inference for computed expressions.
//
// The original emitter hardcoded computed return types as `Int`. That
// works for the early fixtures (all integer arithmetic) but breaks
// the moment a computed produces a string, bool, or array — neither
// SwiftUI's computed properties nor Compose's `derivedStateOf<T>` infer
// strongly enough to recover the type implicitly across targets.
//
// This module walks the expression tree to infer a concrete `TypeIR`
// given the surrounding component's signal declarations. Phase 0 scope:
// literals, identifier reads, signal-call reads, binary arithmetic +
// string concatenation, member access on known object types, ternaries
// where both branches infer the same type. Anything outside that set
// degrades to `{ kind: 'unknown' }` and the caller's emit code falls
// back to a target-specific Any-ish type.
//
// The inference is intentionally NOT full TypeScript type inference —
// that would require a real type checker. It covers the shapes the
// emitter actually emits, which is a fixed-and-growing surface.

import type { DeclIR, ExprIR, StatementIR, TypeIR } from './types'

export interface InferenceCtx {
  /** Signal name → declared type. Filled from the component's decls. */
  signals: Map<string, TypeIR>
  /** Computed name → already-inferred return type. */
  computeds: Map<string, TypeIR>
  /**
   * Local `let` bindings inside the currently-walked computed/function
   * body (Phase 2 follow-up). Populated when inferring a multi-statement
   * body so member-access infers transitively (e.g. `xs.filter(...)`
   * where `let xs = todos()` was set above the return).
   */
  locals: Map<string, TypeIR>
}

export function buildInferenceCtx(decls: DeclIR[]): InferenceCtx {
  const ctx: InferenceCtx = { signals: new Map(), computeds: new Map(), locals: new Map() }
  // Pass 1: collect signals. Their types come from `signal<T>(...)`
  // generics, which `parse.ts` already extracted.
  for (const d of decls) {
    if (d.kind === 'signal') ctx.signals.set(d.name, d.type)
  }
  // Pass 2: infer computeds. A computed can reference signals AND
  // other computeds declared above it in source order; we infer
  // top-to-bottom so by the time we hit `total = computed(() => a() + doubled())`,
  // `doubled` is already in the map.
  for (const d of decls) {
    if (d.kind === 'computed') {
      ctx.locals = new Map()
      ctx.computeds.set(d.name, inferComputedReturnType(d, ctx))
    }
  }
  return ctx
}

/**
 * Infer a computed's return type from its declaration. Handles both
 * the legacy `expr` shape (single expression) and the Phase 2 `body`
 * shape (multi-statement BlockStatement).
 *
 * For multi-statement bodies, walks the statement tree (including
 * nested if/else branches), populating `ctx.locals` from `let`-
 * bindings encountered above the first return. This makes member-
 * access work for chains like:
 *   const xs = todos()
 *   if (filter() === 'active') return xs.filter(...)
 * where `xs` needs to be known as `Array<Todo>` so `.filter(...)`
 * infers `Array<Todo>` (then the function-level return type is
 * also `Array<Todo>`).
 */
function inferComputedReturnType(
  d: Extract<DeclIR, { kind: 'computed' }>,
  ctx: InferenceCtx,
): TypeIR {
  if (d.expr !== undefined) return inferType(d.expr, ctx)
  if (d.body !== undefined) {
    const ret = findFirstReturnExpr(d.body, ctx)
    if (ret) return inferType(ret, ctx)
  }
  return { kind: 'unknown' }
}

/**
 * Walks statements (including nested if/else) for the first `return expr`.
 * Side-effect: populates `ctx.locals` with `let`-binding types
 * encountered along the way so subsequent inferType calls can resolve
 * the local bindings.
 */
function findFirstReturnExpr(
  stmts: StatementIR[],
  ctx: InferenceCtx,
): ExprIR | undefined {
  for (const s of stmts) {
    if (s.kind === 'let') {
      ctx.locals.set(s.name, inferType(s.expr, ctx))
      continue
    }
    if (s.kind === 'return' && s.expr !== undefined) return s.expr
    if (s.kind === 'if') {
      const t = findFirstReturnExpr(s.then, ctx)
      if (t) return t
      if (s.elseBody) {
        const e = findFirstReturnExpr(s.elseBody, ctx)
        if (e) return e
      }
    }
  }
  return undefined
}

export function inferType(expr: ExprIR, ctx: InferenceCtx): TypeIR {
  switch (expr.kind) {
    case 'literal': {
      if (typeof expr.value === 'string') return { kind: 'string' }
      if (typeof expr.value === 'number') return { kind: 'number' }
      if (typeof expr.value === 'boolean') return { kind: 'boolean' }
      return { kind: 'unknown' }
    }
    case 'identifier': {
      // Bare identifier — check locals (Phase 2 follow-up — `let`
      // bindings inside multi-statement computed bodies), then
      // signals/computeds. Falls through to unknown for function
      // parameters (`(item) => ...` in a For child) which need
      // dataflow into the For source we don't yet have.
      const loc = ctx.locals.get(expr.name)
      if (loc) return loc
      const sig = ctx.signals.get(expr.name)
      if (sig) return sig
      const cmp = ctx.computeds.get(expr.name)
      if (cmp) return cmp
      return { kind: 'unknown' }
    }
    case 'call': {
      // Zero-arg call on a bare identifier is the canonical signal /
      // computed read shape: `count()` reads signal `count`. Walk the
      // callee identifier and look up the type.
      if (expr.callee.kind === 'identifier' && expr.args.length === 0) {
        const sig = ctx.signals.get(expr.callee.name)
        if (sig) return sig
        const cmp = ctx.computeds.get(expr.callee.name)
        if (cmp) return cmp
      }
      // Phase 2 follow-up — method calls on known-typed objects. Lets
      // computed-property return types flow through common TS method
      // chains like `arr.filter(...).length` (→ number) and
      // `arr.some(p)` (→ boolean). Closes the
      // "Any cannot conform to RandomAccessCollection" typecheck blocker
      // by making `private var remaining: Int { ... }` instead of
      // `private var remaining: Any { ... }`.
      if (expr.callee.kind === 'member') {
        const objType = inferType(expr.callee.object, ctx)
        const method = expr.callee.property
        if (objType.kind === 'array') {
          switch (method) {
            case 'filter':
            case 'concat':
            case 'slice':
            case 'reverse':
              return objType // Array<T> → Array<T>
            case 'map':
              // Element type is the arrow's return — typeflow doesn't
              // walk into arrow bodies yet. Return Array<unknown>.
              return { kind: 'array', element: { kind: 'unknown' } }
            case 'some':
            case 'every':
            case 'includes':
              return { kind: 'boolean' }
            case 'find':
              return objType.element
            case 'indexOf':
            case 'findIndex':
              return { kind: 'number' }
            case 'join':
              return { kind: 'string' }
          }
        }
        if (objType.kind === 'string') {
          switch (method) {
            case 'trim':
            case 'toLowerCase':
            case 'toUpperCase':
            case 'substring':
            case 'slice':
            case 'replace':
            case 'concat':
              return { kind: 'string' }
            case 'split':
              return { kind: 'array', element: { kind: 'string' } }
            case 'includes':
            case 'startsWith':
            case 'endsWith':
              return { kind: 'boolean' }
            case 'indexOf':
              return { kind: 'number' }
          }
        }
      }
      return { kind: 'unknown' }
    }
    case 'member': {
      // `item.label` on an object-typed signal returns the field's
      // declared type. Used when an object signal is destructured in
      // a computed body (`item.price * item.qty` etc.).
      const objType = inferType(expr.object, ctx)
      if (objType.kind === 'object') {
        const field = objType.fields.find((f) => f.name === expr.property)
        if (field) return field.type
      }
      if (objType.kind === 'array') {
        // `.length` and `.at()` etc. — minimal coverage for now.
        if (expr.property === 'length') return { kind: 'number' }
      }
      return { kind: 'unknown' }
    }
    case 'binary': {
      const left = inferType(expr.left, ctx)
      const right = inferType(expr.right, ctx)
      // String concat: `'a' + name` or `name + 'b'` — if EITHER side
      // is a string and the op is `+`, the result is a string.
      if (expr.op === '+' && (left.kind === 'string' || right.kind === 'string')) {
        return { kind: 'string' }
      }
      // Numeric arithmetic: both sides numeric ⇒ number.
      if (left.kind === 'number' && right.kind === 'number') return { kind: 'number' }
      // One side unknown but other side concrete numeric/string — fall
      // through to the other side's type (best-effort). Aligned with
      // TypeScript's behavior for `x + 1` where `x: number`.
      if (left.kind === 'number') return { kind: 'number' }
      if (right.kind === 'number') return { kind: 'number' }
      return { kind: 'unknown' }
    }
    case 'paren':
      return inferType(expr.inner, ctx)
    case 'comparison':
    case 'logical':
      // Both `===` / `!==` / `<` / `>` and `&&` / `||` produce boolean.
      // Pyreon source uses these in if-conditions + filter predicates;
      // returning `boolean` here lets downstream inference flow.
      return { kind: 'boolean' }
    case 'unary':
      // `!x` → boolean; `-x` / `+x` → number.
      if (expr.op === '!') return { kind: 'boolean' }
      return { kind: 'number' }
    case 'ternary': {
      // `cond ? a : b` — return the type of either branch (assuming
      // both branches have the same type). If they differ, degrade
      // to unknown.
      const t = inferType(expr.then, ctx)
      const o = inferType(expr.otherwise, ctx)
      if (t.kind === o.kind) return t
      return { kind: 'unknown' }
    }
    case 'update':
      // `x++` / `x--` — operates on numbers in valid JS; result is
      // number.
      return { kind: 'number' }
    case 'spread':
      // Bare spread outside a context — degrade. The array case
      // handles the common path.
      return { kind: 'unknown' }
    case 'arrow':
    case 'jsx-element':
    case 'jsx-fragment':
    case 'array':
    case 'object':
      // These shouldn't appear inside a computed's expression in the
      // Phase 0 fixtures. Document and degrade.
      return { kind: 'unknown' }
  }
}
