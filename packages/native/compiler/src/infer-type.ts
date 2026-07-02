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

import { exprReferencesIdent, isReReadableExpr } from './expr-utils'
import type { DeclIR, ExprIR, StatementIR, StoreDefnIR, StructIR, TypeIR } from './types'

export interface InferenceCtx {
  /** Signal name → declared type. Filled from the component's decls. */
  signals: Map<string, TypeIR>
  /** Computed name → already-inferred return type. */
  computeds: Map<string, TypeIR>
  /**
   * Component-level value-const name → inferred type. `const pageSize = 2` /
   * `const steps = ["a","b","c"]` at component scope. PERSISTENT (unlike the
   * per-computed `locals`, which is reset each computed), so a computed or
   * handler that references one infers its real type instead of degrading to
   * `Any` — which on Swift makes the computed emit `private var x: Any { … }`
   * and a downstream `String(x())` fail ("no exact matches in call to
   * initializer"). The dominant data-table / wizard shape.
   */
  valueConsts: Map<string, TypeIR>
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
    valueConsts: new Map(),
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
    valueConsts: new Map(),
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
            valueConsts: new Map(),
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
  // Pass 1.5: value-consts (`const pageSize = 2` / `const steps = […]`).
  // PERSISTENT (not the per-computed `locals`), inferred in source order so a
  // const referencing a signal or an earlier const resolves. Seeds the type so
  // a computed / handler that references one infers a real type instead of
  // `Any` (`.length`, `/ pageSize`, `steps[i]` etc. — the data-table / wizard
  // shape). `locals` is empty here, so a bare `let` inside the const's own expr
  // is not resolvable — fine, value-consts are top-level expressions.
  for (const d of decls) {
    if (d.kind === 'value') ctx.valueConsts.set(d.name, inferType(d.expr, ctx))
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
    valueConsts: ctx.valueConsts,
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
 * Unwrap an optional/nullable `T | undefined` (a `union` carrying a null/undefined
 * branch — the shape `.find(…)` etc. produce) to its sole non-nullish branch, so
 * a member read on it (`selected().name`) resolves the real field type instead of
 * degrading to `unknown` → the computed's type collapsing to `Any`. A non-union,
 * or a union without exactly one non-nullish branch, is returned unchanged.
 */
export function unwrapOptionalType(t: TypeIR): TypeIR {
  if (t.kind !== 'union') return t
  const nonNull = t.branches.filter((b) => b.kind !== 'null' && b.kind !== 'undefined')
  return nonNull.length === 1 ? nonNull[0]! : t
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
 * Structural equality over the small ExprIR subset that can be an optional
 * "base" in the find-then-field idiom — a bare identifier (`f`), a zero/equal-
 * arg computed/signal read (`selected()`), or a member chain (`a.b`). Lets
 * `optionalMemberTernary` confirm the ternary's COND and the then-branch's member
 * OBJECT are the SAME expression (`selected() ? selected().name : …`) without
 * pulling in a full expression comparator.
 */
function sameOptionalBase(a: ExprIR, b: ExprIR): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'identifier' && b.kind === 'identifier') return a.name === b.name
  if (a.kind === 'call' && b.kind === 'call') {
    return (
      a.args.length === b.args.length &&
      sameOptionalBase(a.callee, b.callee) &&
      a.args.every((arg, i) => sameOptionalBase(arg, b.args[i]!))
    )
  }
  if (a.kind === 'member' && b.kind === 'member') {
    return (
      a.property === b.property &&
      a.optional === b.optional &&
      sameOptionalBase(a.object, b.object)
    )
  }
  return false
}

/**
 * Detect the `opt ? opt.prop : else` "find-then-field" idiom so the emit can
 * lower it to optional-chaining + nil-coalescing — `(opt?.prop ?? else)` (Swift)
 * / `(opt?.prop ?: else)` (Kotlin). Neither target narrows the optional in a
 * ternary then-branch the way JS does:
 *   • Swift rejects `opt != nil ? opt.prop : …` ("value of optional type 'T?'
 *     must be unwrapped to refer to member 'prop'").
 *   • Kotlin SMART-CASTS a bare-`val` local (`if (f != null) f.text else …`
 *     compiles), but a `selected()` read is a `by remember { derivedStateOf }`
 *     DELEGATED property whose getter can't be smart-cast ("smart cast to 'Item'
 *     is impossible, because 'selected' is a delegated property") — the dominant
 *     master-detail shape (`const selected = computed(() => items().find(…))`).
 * Optional-chaining sidesteps both uniformly. Matches the simplest shape: COND
 * is structurally-EQUAL to the then-branch's member OBJECT (a bare identifier, a
 * computed/signal read, or a member chain), the then is a NON-optional single
 * member access, and the cond infers as a present optional. Returns the optional
 * base + property, or null (anything else falls through to the general path).
 */
export function optionalMemberTernary(
  e: ExprIR,
  ctx: InferenceCtx,
): { opt: ExprIR; property: string } | null {
  if (e.kind !== 'ternary') return null
  const { cond, then } = e
  if (
    then.kind === 'member' &&
    then.optional !== true &&
    sameOptionalBase(cond, then.object) &&
    classifyOptionalCondition(cond, ctx)?.form === 'present'
  ) {
    return { opt: cond, property: then.property }
  }
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

/**
 * Build the native concat expression for an array literal containing one or
 * more spreads (`[...a, 9, ...b]`). Target-neutral algorithm shared by both
 * emitters: emit each SPREAD's argument bare and group consecutive NON-spread
 * elements into a literal (`litWrap` renders `[e1, e2]` on Swift / `listOf(e1,
 * e2)` on Kotlin), then join the parts with ` + `. Parenthesised for ≥2 parts
 * so a method applied to the literal binds to the WHOLE concat, not just the
 * trailing run (`[...a, 9].length` → `(a + [9]).count`, not `a + [9].count`).
 * Returns null when there is NO spread (the caller emits a plain literal).
 *   [...a, ...b] → a + b   ·   [...a, 9] → (a + [9])   ·   [...a] → a
 */
export function buildArraySpreadConcat(
  elements: ExprIR[],
  emitEl: (e: ExprIR) => string,
  litWrap: (rendered: string) => string,
): string | null {
  if (!elements.some((el) => el.kind === 'spread')) return null
  const parts: string[] = []
  let litRun: ExprIR[] = []
  const flushLit = () => {
    if (litRun.length > 0) {
      parts.push(litWrap(litRun.map(emitEl).join(', ')))
      litRun = []
    }
  }
  for (const el of elements) {
    if (el.kind === 'spread') {
      flushLit()
      parts.push(emitEl(el.argument))
    } else {
      litRun.push(el)
    }
  }
  flushLit()
  if (parts.length === 0) return litWrap('')
  if (parts.length === 1) return parts[0]!
  return `(${parts.join(' + ')})`
}

/**
 * Classify the two dominant NEGATIVE-index `.slice` idioms so the emitters can
 * lower them (Swift/Kotlin `.slice`/`.drop`/`.take` count from the FRONT and
 * can't take a JS negative-from-the-end index). Target-neutral — returns the
 * idiom + the magnitude (the `n` in `-n`, already emitted by `emitArg`):
 *   `arr.slice(-m)`    → { kind: 'last',     n: 'm' }  (last m → suffix/takeLast)
 *   `arr.slice(0, -n)` → { kind: 'dropLast', n: 'n' }  (drop last n → dropLast)
 * Any other shape (mixed signs, non-zero start with a negative end, a negative
 * start with a positive end) returns null and falls through to the caller's
 * non-negative path / generic emit — those are far rarer and ambiguous to
 * clamp, deliberately left for a follow-up.
 */
export function classifyNegativeSlice(
  args: ExprIR[],
  emitArg: (e: ExprIR) => string,
):
  | { kind: 'last'; n: string }
  | { kind: 'dropLast'; n: string }
  | { kind: 'dropFirstLast'; s: string; n: string }
  | { kind: 'suffixDropLast'; m: string; n: string }
  | null {
  const neg = (a: ExprIR | undefined): a is Extract<ExprIR, { kind: 'unary' }> =>
    a?.kind === 'unary' && a.op === '-'
  if (args.length === 1 && neg(args[0])) {
    return { kind: 'last', n: emitArg(args[0].argument) }
  }
  // Two-arg forms with a NEGATIVE end (drop-from-the-end). The start decides
  // the front operation:
  //   slice(0, -n)  -> dropLast(n)                (drop last n)
  //   slice(s, -n)  -> dropFirst(s).dropLast(n)   (s a positive literal)
  //   slice(-m, -n) -> suffix(m).dropLast(n)      (last m, then drop last n)
  // A NON-literal non-negative start (a variable) with a negative end can't be
  // proven front-anchored, so it falls through to null (a follow-up shape).
  if (args.length === 2 && neg(args[1])) {
    const endN = emitArg(args[1].argument)
    const start = args[0]
    if (start?.kind === 'literal' && typeof start.value === 'number' && start.value >= 0) {
      return start.value === 0
        ? { kind: 'dropLast', n: endN }
        : { kind: 'dropFirstLast', s: emitArg(start), n: endN }
    }
    if (neg(start)) {
      return { kind: 'suffixDropLast', m: emitArg(start.argument), n: endN }
    }
  }
  return null
}

/**
 * Rewrite the MAP form of `Array.from` — `Array.from(src, fn)` — into the
 * equivalent `src.map(fn)` member call, so both the emitters and the inference
 * reuse the existing `.map` machinery (element type = the callback's return
 * type; closure emit identical). Returns null for anything that ISN'T the
 * 2-arg map form (so the caller handles the 1-arg copy / `isArray` / range
 * shapes itself). The `{ length: n }` RANGE form (object-literal first arg) is
 * excluded here — it needs a numeric-range source the caller warns about.
 */
/**
 * Classify the numeric-RANGE form of `Array.from` —
 * `Array.from({ length: n }, (_, i) => expr)` — so the emitters can lower it to
 * `(0..<n).map { i in expr }` (Swift) / `(0 until n).map { i -> expr }`
 * (Kotlin). Returns the length expr, the INDEX param name (the 2nd arrow param,
 * bound to the range variable), and the body — or null when it isn't this form.
 *
 * Requirements (anything else falls through to the caller's named warning):
 *   • first arg is exactly `{ length: <expr> }` (one field, no spreads);
 *   • second arg is a ≥2-param arrow with an EXPRESSION body (block bodies
 *     deferred);
 *   • the ELEMENT param (the 1st) is NOT referenced in the body — a `{ length }`
 *     source yields `undefined` elements, so there's no faithful native value
 *     for it; referencing it defers to the warning rather than mis-emit.
 */
export function objectLengthRangeForm(
  expr: ExprIR,
): { lenExpr: ExprIR; indexParam: string; body: ExprIR } | null {
  if (
    expr.kind !== 'call' ||
    expr.callee.kind !== 'member' ||
    expr.callee.object.kind !== 'identifier' ||
    expr.callee.object.name !== 'Array' ||
    expr.callee.property !== 'from' ||
    expr.args.length !== 2
  ) {
    return null
  }
  const obj = expr.args[0]!
  const fn = expr.args[1]!
  if (
    obj.kind !== 'object' ||
    obj.spreads !== undefined ||
    obj.fields.length !== 1 ||
    obj.fields[0]!.name !== 'length'
  ) {
    return null
  }
  if (fn.kind !== 'arrow' || fn.params.length < 2 || fn.stmts !== undefined) return null
  if (exprReferencesIdent(fn.body, fn.params[0]!)) return null
  return { lenExpr: obj.fields[0]!.value, indexParam: fn.params[1]!, body: fn.body }
}

export function arrayFromMapRewrite(expr: ExprIR): ExprIR | null {
  if (
    expr.kind !== 'call' ||
    expr.callee.kind !== 'member' ||
    expr.callee.object.kind !== 'identifier' ||
    expr.callee.object.name !== 'Array' ||
    expr.callee.property !== 'from' ||
    expr.args.length !== 2
  ) {
    return null
  }
  const src = expr.args[0]!
  if (src.kind === 'object') return null // `{ length: n }` range form — caller warns
  return {
    kind: 'call',
    callee: { kind: 'member', object: src, property: 'map' },
    args: [expr.args[1]!],
  }
}

/**
 * Infer the result type of the two static `Array.*` calls the emitters lower:
 *   `Array.isArray(x)`  → boolean (a typed source is statically an array →
 *                         the emit is the literal `true`).
 *   `Array.from(x)`     → the source's array type (shallow copy preserves it;
 *                         falls back to Array<unknown> for a non-array source).
 *   `Array.from(x, fn)` → the `.map` result (element = the callback's return),
 *                         via `arrayFromMapRewrite`.
 * Returns null for any other callee / the `{ length: n }` range form, so those
 * degrade unchanged. Without this the computed annotation degraded to `Any`,
 * losing the array type for any chained method / typed position downstream.
 */
export function inferArrayStaticCall(expr: ExprIR, ctx: InferenceCtx): TypeIR | null {
  if (
    expr.kind !== 'call' ||
    expr.callee.kind !== 'member' ||
    expr.callee.object.kind !== 'identifier' ||
    expr.callee.object.name !== 'Array'
  ) {
    return null
  }
  const fn = expr.callee.property
  if (fn === 'isArray') return { kind: 'boolean' }
  if (fn === 'from') {
    // Range form: `Array.from({ length: n }, (_, i) => body)` → the mapped
    // array whose element is the body's type (index bound to a number).
    const range = objectLengthRangeForm(expr)
    if (range !== null) {
      const scratch: InferenceCtx = { ...ctx, locals: new Map(ctx.locals) }
      scratch.locals.set(range.indexParam, { kind: 'number' })
      const el = inferType(range.body, scratch)
      return { kind: 'array', element: el }
    }
    const mapForm = arrayFromMapRewrite(expr)
    if (mapForm !== null) return inferType(mapForm, ctx)
    if (expr.args.length === 1 && expr.args[0]!.kind !== 'object') {
      const src = inferType(expr.args[0]!, ctx)
      return src.kind === 'array' ? src : { kind: 'array', element: { kind: 'unknown' } }
    }
  }
  return null
}

/**
 * Infer the result type of a `Math.*(…)` call, or null when it isn't one. A
 * computed RETURNING `Math.ceil(x)` etc. otherwise had no inference case → `Any`,
 * so Swift emitted `private var x: Any { ceil(…) }` and a downstream `String(x())`
 * / arithmetic failed ("no exact matches in call to initializer" / "cannot
 * convert 'Any' to 'Int'") — the paginated data-table shape. Types match the
 * per-fn emit RESULT (`emit-swift.ts` Math.* switch):
 *   • ceil/floor/round/trunc → INT. These are INTEGER-VALUED in JS (page counts,
 *     indices), and the emit wraps them `Int(ceil(Double(x)))` etc. so the value
 *     stays an Int usable in `page < pageCount` and printed "4" not "4.0".
 *   • sqrt/pow + the trig/log/exp free functions → DOUBLE (irrational results).
 *   • abs → PRESERVES the arg's numeric type (generic `abs(Int)` stays Int).
 *   • min/max → the args' COMMON type (Double if any arg is fractional).
 * Kotlin's `derivedStateOf` infers on its own (and allows Int↔Double comparison),
 * so this only feeds Swift's annotation — but it's target-neutral inference.
 */
function inferMathCall(expr: ExprIR, ctx: InferenceCtx): TypeIR | null {
  if (
    expr.kind !== 'call' ||
    expr.callee.kind !== 'member' ||
    expr.callee.object.kind !== 'identifier' ||
    expr.callee.object.name !== 'Math'
  ) {
    return null
  }
  const fn = expr.callee.property
  if (fn === 'ceil' || fn === 'floor' || fn === 'round' || fn === 'trunc') {
    return { kind: 'number' } // integer-valued → Int
  }
  const DOUBLE = new Set([
    'sqrt', 'pow', 'cbrt', 'hypot', 'sin', 'cos', 'tan', 'asin', 'acos',
    'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'log', 'log10', 'log2', 'exp',
  ])
  if (DOUBLE.has(fn)) return { kind: 'number', float: true }
  if (fn === 'abs') {
    const a =
      expr.args[0] !== undefined ? inferType(expr.args[0], ctx) : { kind: 'unknown' as const }
    return a.kind === 'number' && a.float === true
      ? { kind: 'number', float: true }
      : { kind: 'number' }
  }
  if (fn === 'min' || fn === 'max') {
    const anyFloat = expr.args.some((a) => {
      const t = inferType(a, ctx)
      return t.kind === 'number' && t.float === true
    })
    return anyFloat ? { kind: 'number', float: true } : { kind: 'number' }
  }
  return null
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
      const vc = ctx.valueConsts.get(expr.name)
      if (vc) return vc
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
      // `Object.values(<object-typed expr>)` → same one-source-of-truth
      // shape: infer the rewritten member-access array (its element type
      // is the struct's homogeneous field type).
      {
        const rw = rewriteObjectValues(expr, ctx)
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
      // `Array.from(x)` / `Array.from(x, fn)` / `Array.isArray(x)` — the
      // emitters lower these; mirror their result type here (array copy /
      // mapped array / boolean) so a computed over them isn't annotated `Any`.
      {
        const a = inferArrayStaticCall(expr, ctx)
        if (a !== null) return a
      }
      // Math.* numeric builtins — see `inferMathCall`.
      {
        const m = inferMathCall(expr, ctx)
        if (m !== null) return m
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
            case 'flatMap': {
              // `.flatMap(x => [E])` flattens one level → `[E]` (the callback's
              // ARRAY body type ITSELF, unlike `.map(x => [E])` which wraps it →
              // `[[E]]`). Bind the param to the element type + infer the body; if
              // it's a concrete array, return it directly (the flattened result).
              // The emit is the generic native `flatMap` (both targets have it) —
              // only the inference lagged (result degraded to `Any`, so a chained
              // `.length` / typed use failed). A body that doesn't infer to a
              // concrete array (e.g. the `cond ? [x] : []` filter-map idiom, whose
              // empty branch has no element type) stays Array<unknown> — a
              // follow-up needs empty-array-in-ternary unification.
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
                if (bodyType.kind === 'array') return bodyType
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
              // Seeded → the seed's type; SEEDLESS (`reduce(fn)`) → JS seeds the
              // accumulator with the FIRST element, so the accumulator (and
              // result) type is the array's ELEMENT type (`objType.element`).
              // Without this a seedless reduce degraded to `unknown` → `Any`
              // (e.g. the max idiom `(a, b) => a > b ? a : b`).
              const seedType: TypeIR =
                seed !== undefined ? inferType(seed, ctx) : objType.element
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
      // Member access on an OPTIONAL base (`selected().name` where `selected`
      // is `computed(() => items().find(…))` → `T | undefined`, a union): unwrap
      // to the non-nullish branch so the field lookup resolves the real type.
      // Without this the read degraded to `unknown` and the computed's type
      // collapsed to `Any` — which compiles for a bare `Text(detail)`
      // interpolation but breaks `String(detailQty())` / arithmetic
      // ("no exact matches in call to initializer"). The find-then-field idiom
      // is the dominant master-detail shape; the EMIT lowers it to
      // optional-chaining (`optionalMemberTernary`), and this resolves its TYPE.
      const objType = unwrapOptionalType(inferType(expr.object, ctx))
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
        return left.float === true || right.float === true
          ? { kind: 'number', float: true }
          : { kind: 'number' }
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
        // `a ?? b` yields the NON-nullish form of `a` — the fallback only fires
        // when `a` is null/undefined, so the result is `NonNullable<a> | b`.
        // (The old code was `inferType(left) ?? inferType(right)` — a JS `??`
        // on the results, but `inferType` NEVER returns null/undefined, so it
        // ALWAYS returned the LEFT type INCLUDING its optional branch. So
        // `nums().at(-1) ?? 0` typed `Int?` instead of `Int`, and consuming it
        // — `String(out())`, arithmetic, a typed position — failed on Swift
        // ("value of optional type 'Int?' must be unwrapped"). This affects the
        // whole idiomatic optional-consumption family: `.at()`, `.find()`,
        // `.findLast()`, `fetch.data() ?? []`, a store/optional read `?? def`.)
        const unwrapped = unwrapOptionalType(inferType(expr.left, ctx))
        // When the left resolves to a concrete non-optional type, that's the
        // result. Otherwise the fallback (right) carries the type — the more
        // literal side (`quotes.data() ?? []` → the `[]` array type).
        if (unwrapped.kind !== 'unknown' && !typeIsOptional(unwrapped)) return unwrapped
        return inferType(expr.right, ctx)
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
      // Empty-array-literal branch unification — `cond ? [x] : []` (the
      // conditional filter-map idiom, esp. as a `.flatMap` body) and the
      // mirrored `cond ? [] : [x]`. A bare `[]` carries no element type so
      // it infers `unknown`, degrading the whole ternary (and the computed's
      // annotation) to `Any` — but the VALUE is statically an empty array,
      // and JS types `cond ? T[] : []` as `T[]`. Both emits already compile
      // under the unified annotation (Swift types `[]` bidirectionally from
      // context; Kotlin's `listOf()` is `List<Nothing>`, a subtype). Gated on
      // the branch EXPR being an untyped empty array LITERAL — never on a
      // mere `unknown` type, which could be anything.
      const isEmptyArrayLit = (x: ExprIR): boolean =>
        x.kind === 'array' && x.elements.length === 0 && x.elementType === undefined
      if (t.kind === 'array' && isEmptyArrayLit(expr.otherwise)) return t
      if (o.kind === 'array' && isEmptyArrayLit(expr.then)) return o
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
      // A TYPED-EMPTY array (`[] as T[]`) carries its element type — mirror it so
      // a computed / reduce-seed over it types `[T]` instead of degrading to `Any`.
      if (els.length === 0) {
        return expr.elementType !== undefined
          ? { kind: 'array', element: expr.elementType }
          : { kind: 'unknown' }
      }
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
    case 'object': {
      // Match the literal's field-set against a DECLARED struct — mirrors the
      // emit's `_structFieldsToName` first-wins lookup (emit-swift/kotlin) — so
      // a computed returning the literal (or a `.reduce`/`.map`/… producing it)
      // types the struct instead of `Any`, and a downstream `x.field` resolves.
      // A literal matching NO declared struct stays `unknown` (the emit
      // synthesizes an anonymous struct for it, but inference can't name that
      // without the emitter's per-run registry — a separate follow-up).
      if (expr.spreads === undefined || expr.spreads.length === 0) {
        const fieldSet = expr.fields.map((f) => f.name).sort().join(',')
        for (const [name, fields] of ctx.structs) {
          if ([...fields.keys()].sort().join(',') === fieldSet) {
            return { kind: 'typeRef', name, args: [] }
          }
        }
      }
      return { kind: 'unknown' }
    }
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
  const fields = objectFieldsOf(argType, ctx)
  if (fields === null) return null
  return {
    kind: 'array',
    elements: fields.map((f) => ({ kind: 'literal', value: f.name })),
  }
}

/**
 * Resolve an object-shaped type to its FIELD list — an inline `object` type
 * carries them directly; a `typeRef` (the dominant declared-struct shape,
 * `signal<P>`) resolves through the module's struct registry. Null for
 * anything else. Shared by the `Object.keys` / `Object.values` rewrites —
 * pre-fix, keys() only handled the inline shape, so `Object.keys(p())` on a
 * DECLARED type silently degrade-warned.
 */
function objectFieldsOf(
  t: TypeIR,
  ctx: InferenceCtx,
): { name: string; type: TypeIR }[] | null {
  if (t.kind === 'object') return t.fields
  if (t.kind === 'typeRef') {
    const m = ctx.structs.get(t.name)
    if (m !== undefined) {
      return [...m.entries()].map(([name, type]) => ({ name, type }))
    }
  }
  return null
}

/**
 * `Object.values(<object-typed expr>)` → a static member-access array
 * (`[p.a, p.b]` — field order = declaration order, matching JS's
 * insertion-order guarantee for string keys). Two gates keep it faithful:
 *   - ALL field types must be IDENTICAL (JSON.stringify equality — JS's
 *     mixed `(string|number)[]` values array has no native analog), and
 *   - the arg must be RE-READABLE (`isReReadableExpr` — it's named once per
 *     field; a chained method receiver would re-run work).
 * The inline-literal form (`Object.values({a: 1, b: 2})`) lowers to the
 * value exprs directly under the same homogeneity gate. Anything else
 * returns null → the emitters' existing degrade-warn (never a silent drop).
 * `Object.entries` stays degrade-warn: tuple arrays don't map cleanly to
 * either target's idioms.
 */
export function rewriteObjectValues(expr: ExprIR, ctx: InferenceCtx): ExprIR | null {
  if (expr.kind !== 'call') return null
  const callee = expr.callee
  if (
    callee.kind !== 'member' ||
    callee.object.kind !== 'identifier' ||
    callee.object.name !== 'Object' ||
    callee.property !== 'values'
  ) {
    return null
  }
  if (expr.args.length !== 1) return null
  const arg = expr.args[0]!
  const homogeneous = (types: TypeIR[]): boolean => {
    if (types.length === 0) return false
    const first = JSON.stringify(types[0])
    return types.every((t) => JSON.stringify(t) === first)
  }
  if (arg.kind === 'object' && 'fields' in arg && (arg.spreads?.length ?? 0) === 0) {
    const valueTypes = arg.fields.map((f) => inferType(f.value, ctx))
    if (!homogeneous(valueTypes)) return null
    return { kind: 'array', elements: arg.fields.map((f) => f.value) }
  }
  const fields = objectFieldsOf(inferType(arg, ctx), ctx)
  if (fields === null || !homogeneous(fields.map((f) => f.type))) return null
  if (!isReReadableExpr(arg)) return null
  return {
    kind: 'array',
    elements: fields.map((f) => ({ kind: 'member', object: arg, property: f.name })),
  }
}
