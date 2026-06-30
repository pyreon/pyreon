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

import type { DeclIR, ExprIR, StatementIR, StoreDefnIR, StructIR, TypeIR } from './types'

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
  /**
   * Fetch decl name → decoded result type T (from `useFetch<T>(url)`).
   * `x.data` / `x.data()` infer T; `x.isPending` infers boolean —
   * without this, a computed over fetch state (`computed(() =>
   * quotes.data() ?? [])`) degraded to `Any` / unknown and the Swift
   * ForEach over it failed to typecheck.
   */
  fetches: Map<string, TypeIR>
  /**
   * Store hook name → field name → declared field type. Lets the
   * store-read chain `useApp().store.tasks()` infer the field's type
   * the same way a local `tasks()` signal read does — without this, a
   * computed over store state degraded to `Any`
   * (`private var remaining: Any { PyreonStore_app.shared.tasks
   * .filter({...}).count }`), which compiles for interpolation-only
   * consumers but breaks the moment the value feeds arithmetic or a
   * typed position.
   */
  stores: Map<string, Map<string, TypeIR>>
  /**
   * Declared struct / type-alias name → field name → field type. Filled
   * from the module's `type X = { ... }` declarations. Lets member
   * access on a `typeRef`-typed value (`t.id` where `t: Todo`) resolve
   * the field's concrete type — the dominant shape inside a `.map`
   * callback over a typed object array (`todos().map(t => t.id)`).
   * Without this, that member read degraded to `unknown` and the
   * computed's element type collapsed to `Any` (`[Any]` / `Any`), which
   * compiles for interpolation-only consumers but silently loses the
   * real type the moment the value feeds a typed position (a `ForEach`
   * id, arithmetic, a typed function arg).
   */
  structs: Map<string, Map<string, TypeIR>>
}

/**
 * An empty inference context — every map empty. Used as the default
 * `_activeInferCtx` in the emitters before/outside a component body, so the
 * binary-coercion path can still type LITERAL operands (which self-type
 * without ctx) and safely returns `unknown` for identifiers it can't resolve.
 */
export function emptyInferenceCtx(): InferenceCtx {
  return {
    signals: new Map(),
    computeds: new Map(),
    locals: new Map(),
    fetches: new Map(),
    stores: new Map(),
    structs: new Map(),
  }
}

export function buildInferenceCtx(
  decls: DeclIR[],
  storeDefs: StoreDefnIR[] = [],
  structDefs: StructIR[] = [],
): InferenceCtx {
  const ctx: InferenceCtx = {
    signals: new Map(),
    computeds: new Map(),
    locals: new Map(),
    structs: new Map(
      structDefs.map((s) => [s.name, new Map(s.fields.map((f) => [f.name, f.type]))]),
    ),
    fetches: new Map(
      decls.flatMap((d) => (d.kind === 'fetch' ? [[d.name, d.type] as const] : [])),
    ),
    stores: new Map(
      storeDefs.map((s) => {
        const perHook = new Map(s.fields.map((f) => [f.name, f.type]))
        // v2 — store computeds: infer each one's type against the
        // store's OWN fields so a COMPONENT computed reading
        // `useApp().store.remaining()` resolves it like a field.
        if (s.computeds !== undefined && s.computeds.length > 0) {
          const storeCtx: InferenceCtx = {
            signals: new Map(s.fields.map((f) => [f.name, f.type])),
            computeds: new Map(),
            locals: new Map(),
            fetches: new Map(),
            stores: new Map(),
            structs: new Map(
              structDefs.map((sd) => [
                sd.name,
                new Map(sd.fields.map((f) => [f.name, f.type])),
              ]),
            ),
          }
          for (const c of s.computeds) {
            const t = inferType(c.expr, storeCtx)
            storeCtx.computeds.set(c.name, t)
            perHook.set(c.name, t)
          }
        }
        return [s.hookName, perHook]
      }),
    ),
  }
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

/**
 * Infer a FUNCTION's return type from its params + body, for functions
 * declared WITHOUT an explicit `: T` return annotation (where the IR
 * returnType is `unknown`). Builds a scratch ctx with the params bound as
 * locals (so `(x: number) => x * 2` infers `number`), walks the body for the
 * first `return <expr>` (also binding body-`let`s along the way), and infers
 * that expr's type. Returns `unknown` when it can't determine the type — the
 * caller then emits NO annotation (the existing behavior), so a wrong guess
 * is never possible.
 *
 * Note: a destructured param (`({ x, y }: Point) => x + y`) binds the
 * synthetic `__pN: Point` param, but the body's `x`/`y` come from prepended
 * `let x = __pN.x` member reads that this ctx can't resolve to Point's fields
 * → returns `unknown` → no annotation (the documented annotate-the-return
 * workaround still applies for that shape).
 */
export function inferReturnType(
  params: { name: string; type: TypeIR }[],
  body: StatementIR[],
  ctx: InferenceCtx,
): TypeIR {
  const scratch: InferenceCtx = {
    signals: ctx.signals,
    computeds: ctx.computeds,
    locals: new Map(ctx.locals),
    fetches: ctx.fetches,
    stores: ctx.stores,
    structs: ctx.structs,
  }
  for (const p of params) scratch.locals.set(p.name, p.type)
  const ret = findFirstReturnExpr(body, scratch)
  return ret ? inferType(ret, scratch) : { kind: 'unknown' }
}

/**
 * Match the store-read chain shape `useX().store.FIELD()` (zero args at
 * both call sites) against the ctx's store registry. Returns the
 * field's declared type, or undefined when the expression isn't a
 * store read / the hook or field is unknown.
 */
function resolveStoreReadType(
  expr: Extract<ExprIR, { kind: 'call' }>,
  ctx: InferenceCtx,
): TypeIR | undefined {
  if (expr.args.length !== 0) return undefined
  const fieldMember = expr.callee
  if (fieldMember.kind !== 'member') return undefined
  const storeMember = fieldMember.object
  if (storeMember.kind !== 'member' || storeMember.property !== 'store') {
    return undefined
  }
  const hookCall = storeMember.object
  if (
    hookCall.kind !== 'call' ||
    hookCall.args.length !== 0 ||
    hookCall.callee.kind !== 'identifier'
  ) {
    return undefined
  }
  return ctx.stores.get(hookCall.callee.name)?.get(fieldMember.property)
}

/**
 * True iff a type is OPTIONAL — a bare `null` / `undefined`, or a union that
 * carries a `null` / `undefined` branch (the `T | undefined` shape produced by
 * `.find` / `.findLast` / `.at` / a `T | null` field). Mirrors the
 * optional-receiver test the emitters already use for the `?.`-vs-`.` decision
 * (`recvProvablyNonNull`), exported so the ternary-condition lowering shares ONE
 * definition of "optional" across both targets. Used to lower a JS truthiness
 * test on an optional (`opt ? a : b`) to an explicit `opt != nil` / `opt != null`
 * — Swift/Kotlin reject an optional/nullable as a Bool condition (where JS
 * coerces null→false, non-null→true).
 */
export function typeIsOptional(t: TypeIR): boolean {
  if (t.kind === 'null' || t.kind === 'undefined') return true
  return (
    t.kind === 'union' &&
    t.branches.some((b) => b.kind === 'null' || b.kind === 'undefined')
  )
}

/**
 * Classify a CONDITION expression for optional-truthiness lowering. JS treats
 * an optional/nullable as truthy-when-PRESENT and a `!optional` as truthy-when-
 * ABSENT, but Swift/Kotlin reject an optional/nullable (and `!optional`) as a
 * Bool. Returns the lowering form so each condition site (ternary, `&&`, `Show
 * when`, `if`/`while`) emits the explicit nil-comparison the target requires:
 *   - bare optional `t`     → `'present'` → emit `t != nil` / `t != null`
 *   - negated optional `!t` → `'absent'`  → emit `t == nil` / `t == null`
 *                             (carries the inner `argument` so the `!` is
 *                              dropped — `!t` is itself an error on an optional)
 *   - anything else (a real Bool / number-compare / `.some(...)`) → `null`
 *     (no lowering — the emitter renders the condition verbatim).
 * One definition of the two forms, shared across both targets and every site.
 */
export function classifyOptionalCondition(
  e: ExprIR,
  ctx: InferenceCtx,
): { form: 'present' } | { form: 'absent'; argument: ExprIR } | null {
  if (
    e.kind === 'unary' &&
    e.op === '!' &&
    typeIsOptional(inferType(e.argument, ctx))
  ) {
    return { form: 'absent', argument: e.argument }
  }
  if (typeIsOptional(inferType(e, ctx))) return { form: 'present' }
  return null
}

/**
 * Seed a handler / action body's local `const`/`let` bindings into `ctx.locals`
 * so type-dependent emit INSIDE that body resolves them. Component-level decls
 * (signals / computeds / stores) are already in the ctx; handler-LOCAL vars
 * (`const t = todos.find(…)` inside `onTap = () => { … }`) were not — so e.g. a
 * later `if (t)` couldn't see `t`'s optional type and emitted the bare optional
 * (a non-Bool condition swiftc/kotlinc reject). Walks the statements IN ORDER,
 * inferring each `let` init against the locals seeded so far (so a chain `const
 * a = …; const b = a` resolves), onto a COPY of the existing locals map.
 * Returns the ORIGINAL map so the caller restores it after emitting the body
 * (`ctx.locals = saved`) — keeping the seeding scoped to this one body and
 * re-entrant-safe for nested handlers.
 */
export function seedHandlerLocals(
  stmts: StatementIR[],
  ctx: InferenceCtx,
): Map<string, TypeIR> {
  const saved = ctx.locals
  ctx.locals = new Map(saved)
  for (const s of stmts) {
    if (s.kind === 'let') ctx.locals.set(s.name, inferType(s.expr, ctx))
  }
  return saved
}

/**
 * Recognise a 2-param array-method callback `(element, index) => …` — the JS
 * `.map`/`.forEach` index form. Returns the arrow IR (so the emitter can read
 * `params` + `body`) when `args` is exactly one 2-param arrow, else null. Used
 * by both targets to lower to the index-aware native variant (Swift
 * `enumerated().map { (idx, el) in … }`, Kotlin `mapIndexed { idx, el -> … }` —
 * both index-FIRST, so the emitters bind the params swapped). 1-param callbacks
 * return null and fall through to the generic `.map`/`.forEach` emit.
 */
export function indexedArrayCallback(
  args: ExprIR[],
): Extract<ExprIR, { kind: 'arrow' }> | null {
  const cb = args[0]
  return args.length === 1 && cb?.kind === 'arrow' && cb.params.length === 2 ? cb : null
}

export function inferType(expr: ExprIR, ctx: InferenceCtx): TypeIR {
  switch (expr.kind) {
    case 'literal': {
      if (typeof expr.value === 'string') return { kind: 'string' }
      if (typeof expr.value === 'number') {
        // A FRACTIONAL literal (`9.99`, `0.08`) is a Double on both
        // targets; an integer-valued literal (`7`, and `3.0` —
        // `Number.isInteger` is true for it) stays Int, the ergonomic
        // default for counts/ids/indices. This mirrors the boundary
        // `parse.ts`'s `inferTypeFromInitial` already uses for the
        // signal-decl path, so a `signal(9.99)` and a
        // `computed(() => 9.99)` now AGREE on Double.
        //
        // Without the `float` flag here, the core inferType degraded
        // every fractional literal in a computed / return / arithmetic
        // position to `{ kind: 'number' }` → `Int`: `computed(() => 9.99)`
        // emitted `private var tax: Int { 9.99 }` (a swiftc type error),
        // and the literal contributed no float-ness to surrounding
        // arithmetic (`rate() + 0.02` lost its Double-ness). The
        // signal/struct/reduce-seed cases were patched by the parse-layer
        // refinement passes; the computed/expression path was the
        // remaining root gap. Float is contagious through the binary
        // case below, so this also fixes all-float-operand arithmetic.
        return Number.isInteger(expr.value)
          ? { kind: 'number' }
          : { kind: 'number', float: true }
      }
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
      // `Object.keys(<object-typed expr>)` → static `[String]` of the
      // struct field names. A synthesized struct's keys are statically
      // known at compile time, so the rewrite lowers the call to a plain
      // string-array literal and the result type is precisely
      // `Array<String>`. Inferring the rewritten array (rather than
      // hard-coding the type here) keeps ONE source of truth for the
      // detection + lowering (the emitters call the same `rewriteObjectKeys`).
      {
        const rw = rewriteObjectKeys(expr, ctx)
        if (rw !== null) return inferType(rw, ctx)
      }
      // Zero-arg call on a bare identifier is the canonical signal /
      // computed read shape: `count()` reads signal `count`. Walk the
      // callee identifier and look up the type.
      if (expr.callee.kind === 'identifier' && expr.args.length === 0) {
        const sig = ctx.signals.get(expr.callee.name)
        if (sig) return sig
        const cmp = ctx.computeds.get(expr.callee.name)
        if (cmp) return cmp
      }
      // Numeric-cast globals: `parseInt(x)` → Int, `parseFloat(x)` /
      // `Number(x)` → Double. Without this they degraded to `Any` (the emit
      // — `(Int(x) ?? 0)` etc. — typechecks, but the computed annotation was
      // `Any` instead of the precise number type, losing it for downstream
      // arithmetic / typed positions). `Number` coerces to a float-capable
      // number, so it maps to the Double (float) shape like parseFloat.
      if (expr.callee.kind === 'identifier' && expr.args.length >= 1) {
        if (expr.callee.name === 'parseInt') return { kind: 'number' }
        if (expr.callee.name === 'parseFloat' || expr.callee.name === 'Number') {
          return { kind: 'number', float: true }
        }
      }
      // Fetch-field read: `quotes.data()` (CALL form — web reads the
      // signal). data → T; isPending → boolean; error → unknown.
      if (
        expr.args.length === 0 &&
        expr.callee.kind === 'member' &&
        expr.callee.object.kind === 'identifier' &&
        ctx.fetches.has(expr.callee.object.name)
      ) {
        if (expr.callee.property === 'data') return ctx.fetches.get(expr.callee.object.name)!
        if (expr.callee.property === 'isPending') return { kind: 'boolean' }
      }
      // Store-read chain: `useApp().store.tasks()` — zero-arg call on a
      // field of `.store` on a zero-arg store-hook call. Resolves to
      // the store field's declared type so method chains over store
      // state (`.filter(...).length`) infer like local signal reads.
      const storeRead = resolveStoreReadType(expr, ctx)
      if (storeRead !== undefined) return storeRead
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
        // `.fill(v)` → Array<typeof v>. Handled BEFORE the array-type gate
        // because the canonical `Array(n).fill(v)` shape has `Array(n)` as
        // the object, which does NOT infer as an array — so gating on
        // `objType.kind === 'array'` would miss it (→ `Any`). A generic
        // `arr.fill(v)` on a real array also lands here with the same result.
        if (method === 'fill' && expr.args.length === 1) {
          return { kind: 'array', element: inferType(expr.args[0]!, ctx) }
        }
        if (objType.kind === 'array') {
          switch (method) {
            case 'at':
              // JS `.at(i)` → `T | undefined` (Optional). Mirror find/findLast
              // so the computed is annotated `T?`, not `Any`.
              return { kind: 'union', branches: [objType.element, { kind: 'undefined' }] }
            case 'filter':
            case 'concat':
            case 'slice':
            case 'reverse':
            case 'sort':
              // `.sort(cmp)` keeps the element type (Swift `.sorted(by:)` /
              // Kotlin `.sortedWith` both return the same array). It was
              // MISSING here, so a sort inferred `Any` and broke any CHAINED
              // method after it — `[...xs].sort(cmp).slice(0, n)` emitted a
              // bare `.slice(...)` because the slice lowering gates on
              // `objType.kind === 'array'`. `.sort` was already in the EMIT
              // switch; this aligns inference with it.
              return objType // Array<T> → Array<T>
            case 'map': {
              // Element type is the arrow's RETURN type. Bind the callback's
              // param to the source's element type, then infer the body —
              // `nums.map(n => n * 2)` → Array<Int>; `objs.map(o => o.field)`
              // → Array<fieldType> when the element is object-typed. Falls
              // back to Array<unknown> when the body can't be inferred.
              const cb = expr.args[0]
              if (cb !== undefined && cb.kind === 'arrow' && cb.params.length >= 1) {
                const scratch: InferenceCtx = { ...ctx, locals: new Map(ctx.locals) }
                scratch.locals.set(cb.params[0]!, objType.element)
                let bodyType: TypeIR = { kind: 'unknown' }
                if (cb.stmts !== undefined) {
                  const ret = findFirstReturnExpr(cb.stmts, scratch)
                  if (ret) bodyType = inferType(ret, scratch)
                } else {
                  bodyType = inferType(cb.body, scratch)
                }
                if (bodyType.kind !== 'unknown') return { kind: 'array', element: bodyType }
              }
              return { kind: 'array', element: { kind: 'unknown' } }
            }
            case 'some':
            case 'every':
            case 'includes':
              return { kind: 'boolean' }
            case 'find':
              // JS `.find` returns `T | undefined` — Swift `.first(where:)`
              // and Kotlin `.find` BOTH return Optional. Annotating the
              // result `T` (non-optional) made `private var x: Item` while
              // the value is `Item?` → swiftc "cannot convert 'Item?' to
              // 'Item'". The nullable union maps to `Item?` / `Item?` via
              // swiftUnionType / kotlinUnionType, matching the real return.
              return { kind: 'union', branches: [objType.element, { kind: 'undefined' }] }
            case 'findLast':
              // JS `.findLast` returns `T | undefined` — Swift `last(where:)`
              // and Kotlin `findLast` BOTH return Optional. Mirror the `.find`
              // Optional shape so the computed is annotated `T?` (not the
              // `Any` it degraded to with no case), matching the real return.
              return { kind: 'union', branches: [objType.element, { kind: 'undefined' }] }
            case 'indexOf':
            case 'findIndex':
              return { kind: 'number' }
            case 'join':
              return { kind: 'string' }
            case 'reduce': {
              // `arr.reduce((acc, x) => body, seed)` → the accumulator type.
              // Infer the reducer body with `acc` bound to the seed's type
              // and the element param bound to the array element type;
              // fall back to the seed's own type. Without this, a computed
              // over a reduce degraded to `unknown` → `Any` → `String(<Any>)`
              // fails swiftc (`no exact matches in call to initializer`).
              const reducer = expr.args[0]
              const seed = expr.args[1]
              const seedType: TypeIR =
                seed !== undefined ? inferType(seed, ctx) : { kind: 'unknown' }
              if (reducer !== undefined && reducer.kind === 'arrow' && reducer.params.length >= 1) {
                const scratch: InferenceCtx = { ...ctx, locals: new Map(ctx.locals) }
                scratch.locals.set(reducer.params[0]!, seedType)
                if (reducer.params.length >= 2) {
                  scratch.locals.set(reducer.params[1]!, objType.element)
                }
                let bodyType: TypeIR = { kind: 'unknown' }
                if (reducer.stmts !== undefined) {
                  const ret = findFirstReturnExpr(reducer.stmts, scratch)
                  if (ret) bodyType = inferType(ret, scratch)
                } else {
                  bodyType = inferType(reducer.body, scratch)
                }
                if (bodyType.kind !== 'unknown') return bodyType
              }
              return seedType
            }
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
            case 'charAt': // 1-char string
            case 'padStart':
            case 'padEnd':
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
    case 'index': {
      // `xs[i]` on an array-typed object → the element type.
      const idxObj = inferType(expr.object, ctx)
      if (idxObj.kind === 'array') return idxObj.element
      return { kind: 'unknown' }
    }
    case 'member': {
      // Fetch-field read, property form (`quotes.data` — the native
      // shape). Mirrors the call-form branch above.
      if (expr.object.kind === 'identifier' && ctx.fetches.has(expr.object.name)) {
        if (expr.property === 'data') return ctx.fetches.get(expr.object.name)!
        if (expr.property === 'isPending') return { kind: 'boolean' }
      }
      // `item.label` on an object-typed signal returns the field's
      // declared type. Used when an object signal is destructured in
      // a computed body (`item.price * item.qty` etc.).
      const objType = inferType(expr.object, ctx)
      if (objType.kind === 'object') {
        const field = objType.fields.find((f) => f.name === expr.property)
        if (field) return field.type
      }
      // `t.id` where `t: Todo` (a declared `type Todo = { ... }`). The
      // element type of a typed object array is a `typeRef`, so this is
      // the path that makes `todos().map(t => t.id)` infer `[Int]`
      // instead of `[Any]` — the dominant real-app shape. Without it the
      // member read returned `unknown` and the `.map` element collapsed.
      if (objType.kind === 'typeRef') {
        const field = ctx.structs.get(objType.name)?.get(expr.property)
        if (field) return field
      }
      if (objType.kind === 'array') {
        // `.length` and `.at()` etc. — minimal coverage for now.
        if (expr.property === 'length') return { kind: 'number' }
      }
      // `s.length` on a string → number (Swift `.count`). Without this,
      // `words().map(w => w.length)` over a `string[]` inferred the element as
      // `unknown` → the map result became `[Any]`, which `swiftc -typecheck`
      // rejects the moment it's consumed (`.reduce`, indexing, …). The `array`
      // case above already covered array `.length`; strings were the gap.
      if (objType.kind === 'string' && expr.property === 'length') {
        return { kind: 'number' }
      }
      return { kind: 'unknown' }
    }
    case 'template':
      // A template literal always produces a string (native interpolation).
      return { kind: 'string' }
    case 'binary': {
      const left = inferType(expr.left, ctx)
      const right = inferType(expr.right, ctx)
      // String concat: `'a' + name` or `name + 'b'` — if EITHER side
      // is a string and the op is `+`, the result is a string.
      if (expr.op === '+' && (left.kind === 'string' || right.kind === 'string')) {
        return { kind: 'string' }
      }
      // Division is ALWAYS fractional in JS — `7 / 2 === 3.5`, never 3.
      // Swift/Kotlin integer `/` truncates, so the result type MUST be
      // Double (and the emit coerces to float division — see emit-swift /
      // emit-kotlin binary `/`). Applies whenever a numeric is involved;
      // a non-numeric `/` is invalid TS anyway.
      if (expr.op === '/' && (left.kind === 'number' || right.kind === 'number')) {
        return { kind: 'number', float: true }
      }
      // Exponent is Double-domain too — `pow(...)` / `Math.pow(...)` return
      // Double on both targets (and JS `**` yields a Number). So the result
      // type MUST be `{ float: true }` or a `var x: Int { pow(...) }` Swift
      // computed mismatches its Double body.
      if (expr.op === '**' && (left.kind === 'number' || right.kind === 'number')) {
        return { kind: 'number', float: true }
      }
      // Numeric arithmetic: both sides numeric ⇒ number. Float is
      // contagious — Int + Double is Double on both targets, so if EITHER
      // side is fractional the result is fractional. (Drives the
      // reduce-seed refinement: `s + m.growth` over a Double field infers
      // `{ float: true }` so the seed flips to `0.0`.)
      if (left.kind === 'number' && right.kind === 'number') {
        return { kind: 'number', float: left.float === true || right.float === true }
      }
      // One side unknown but other side concrete numeric/string — fall
      // through to the other side's type (best-effort). Aligned with
      // TypeScript's behavior for `x + 1` where `x: number`. Preserve the
      // concrete side's float-ness; omit `float` when not true
      // (`exactOptionalPropertyTypes` forbids an explicit `undefined`).
      if (left.kind === 'number') {
        return left.float === true ? { kind: 'number', float: true } : { kind: 'number' }
      }
      if (right.kind === 'number') {
        return right.float === true ? { kind: 'number', float: true } : { kind: 'number' }
      }
      return { kind: 'unknown' }
    }
    case 'paren':
      return inferType(expr.inner, ctx)
    case 'comparison':
    case 'logical':
      // `===` / `!==` / `<` / `>` and `&&` / `||` produce boolean.
      // Pyreon source uses these in if-conditions + filter predicates;
      // returning `boolean` here lets downstream inference flow.
      // `??` is the exception: `a ?? b` produces the (unwrapped)
      // operand type — try the left side first, fall back to the
      // right (the fallback expression is usually the more literal,
      // e.g. `quotes.data ?? []`).
      if (expr.kind === 'logical' && expr.op === '??') {
        return inferType(expr.left, ctx) ?? inferType(expr.right, ctx)
      }
      return { kind: 'boolean' }
    case 'unary': {
      // `!x` → boolean; `-x` / `+x` → number, PRESERVING the argument's
      // float-ness (`-rate()` over a Double stays Double; was always Int →
      // a wrong Int annotation / coercion downstream).
      if (expr.op === '!') return { kind: 'boolean' }
      const at = inferType(expr.argument, ctx)
      // Only attach `float` when true — `exactOptionalPropertyTypes` forbids
      // an explicit `float: undefined`.
      return at.kind === 'number' && at.float === true
        ? { kind: 'number', float: true }
        : { kind: 'number' }
    }
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
    case 'rx-call': {
      // RX-2 — type-infer `rx.METHOD(...)` results so the emitted
      // computed properties get useful Swift return-type annotations.
      // Mirrors the per-method dispatch in emit-{swift,kotlin}.ts.
      const sourceType = inferType(expr.source, ctx)
      const elementType: TypeIR =
        sourceType.kind === 'array' ? sourceType.element : { kind: 'unknown' }
      switch (expr.method) {
        // Transforms preserving the source's element type → Array<T>.
        case 'filter':
        case 'reverse':
        case 'take':
        case 'skip':
        case 'takeWhile':
        case 'dropWhile':
          return { kind: 'array', element: elementType }
        // map / compact / flatten — element type would need arrow body
        // typeflow (map) or per-method semantics (compact strips null,
        // flatten unwraps a level). Degrade to Array<unknown> — Swift
        // will still typecheck via the per-call closure inference.
        case 'map':
        case 'compact':
        case 'flatten':
        case 'unique':
          return { kind: 'array', element: { kind: 'unknown' } }
        // Scalar accessors — return the element type (Swift first/last
        // are Optional<T>, but the IR has no Optional kind; Swift
        // accepts the unwrapped type at the consumer site because
        // these properties are typed contextually).
        case 'first':
        case 'last':
        case 'find':
          return elementType
        // Boolean predicates.
        case 'some':
        case 'every':
          return { kind: 'boolean' }
        // Numeric aggregations.
        case 'count':
        case 'sum':
        case 'min':
        case 'max':
        case 'average':
        case 'reduce':
          return { kind: 'number' }
      }
      return { kind: 'unknown' }
    }
    case 'arrow':
    case 'jsx-element':
    case 'jsx-fragment':
      // Not a value-typed expression in this context — degrade. (Kept
      // separate from `array` below so the `array` case narrows to the
      // array variant; falling through would widen `expr` and `.elements`
      // would not typecheck.)
      return { kind: 'unknown' }
    case 'array': {
      // Infer the element type from an array expression used inside a
      // computed — the dominant shape is the spread-copy `[...xs]` (the
      // idiomatic non-mutating sort is `[...xs].sort(cmp)`). Without this the
      // spread degraded to `Any`, breaking any chained method after it
      // (`[...xs].sort(cmp).slice(0, n)`). Each element contributes: a spread
      // `...x` → x's ELEMENT type (when x is an array); a plain value → its
      // own type. If every element agrees on one non-unknown element type the
      // array is `[that]`; a heterogeneous / un-inferrable / empty array
      // degrades to `unknown` (safe — the prior behaviour).
      const els = expr.elements
      if (els.length === 0) return { kind: 'unknown' }
      let elemType: TypeIR | undefined
      for (const el of els) {
        let t: TypeIR
        if (el.kind === 'spread') {
          const src = inferType(el.argument, ctx)
          if (src.kind !== 'array') return { kind: 'unknown' }
          t = src.element
        } else {
          t = inferType(el, ctx)
        }
        if (t.kind === 'unknown') return { kind: 'unknown' }
        if (elemType === undefined) elemType = t
        else if (JSON.stringify(elemType) !== JSON.stringify(t)) return { kind: 'unknown' }
      }
      return elemType !== undefined ? { kind: 'array', element: elemType } : { kind: 'unknown' }
    }
    case 'object':
      // An object literal inside a computed expression is the separate
      // anonymous-object → struct gap; degrade for now.
      return { kind: 'unknown' }
  }
}

/**
 * `Object.keys(<object-literal-typed expr>)` → a static string-array ExprIR
 * of the object's field names (declaration order).
 *
 * JS runtime key enumeration has no native analog — Swift structs and Kotlin
 * data classes carry no runtime key reflection (you'd need `Mirror`). But a
 * synthesized struct's field names ARE statically known at compile time, so
 * the keys lower to a plain `["a","b"]` / `listOf("a","b")` literal, which
 * both targets accept as a homogeneous `[String]` / `List<String>`.
 *
 * Returns `null` (→ generic path, which warns; see the emitters) when:
 *   - the call isn't `Object.keys(...)` (covers `.values` / `.entries`,
 *     whose value arrays are heterogeneous → `[Any]`, deliberately out of
 *     scope), or
 *   - the single arg's inferred type isn't a known object/struct shape
 *     (a dictionary / unknown value can't enumerate keys at compile time).
 *
 * ONE source of truth for the detection + lowering: `inferType`'s `call`
 * case calls it for the result TYPE, and both emitters call it to recurse
 * into the array VALUE emit — so the type annotation and the emitted value
 * can never disagree.
 */
export function rewriteObjectKeys(expr: ExprIR, ctx: InferenceCtx): ExprIR | null {
  if (expr.kind !== 'call') return null
  const callee = expr.callee
  if (
    callee.kind !== 'member' ||
    callee.object.kind !== 'identifier' ||
    callee.object.name !== 'Object' ||
    callee.property !== 'keys'
  ) {
    return null
  }
  if (expr.args.length !== 1) return null
  const arg = expr.args[0]!
  // Inline object literal — `Object.keys({ a: 1, b: 2 })`. The field names
  // are read straight off the ExprIR, no type resolution needed, so this
  // works regardless of whether signal-of-object type inference has landed.
  // A spread (`{ ...x }`) makes the key set non-static → bail (degrade-warn).
  // The `schemaName` object variant carries no `fields` → also bails.
  if (arg.kind === 'object' && 'fields' in arg && (arg.spreads?.length ?? 0) === 0) {
    return {
      kind: 'array',
      elements: arg.fields.map((f) => ({ kind: 'literal', value: f.name })),
    }
  }
  // Otherwise resolve the arg's type — a signal / computed / local of a
  // known struct shape (`Object.keys(cfg())`). This path activates once
  // object-literal *type* inference (signal → struct type) is in place;
  // until then such a signal infers as `Any` and the call degrade-warns.
  const argType = inferType(arg, ctx)
  if (argType.kind !== 'object') return null
  return {
    kind: 'array',
    elements: argType.fields.map((f) => ({ kind: 'literal', value: f.name })),
  }
}
