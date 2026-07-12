/**
 * JIT validator codegen — the "fastest" path.
 *
 * The interpreted pipeline (compileSchema + per-field `_runInto`) pays a
 * virtual `_compileType` dispatch, a checks-array iteration, and several
 * wrapper function calls PER FIELD/element. ArkType wins valid-parse by
 * compiling each schema to ONE flat monomorphic function. This module does
 * the same, RECURSIVELY: a pure object/array/primitive tree compiles to a
 * single specialized `(input, ctx) => value` function via `new Function`,
 * inlining — at every depth —
 *   - object type guards + field access (no `Object.keys` allocation)
 *   - primitive `typeof` type-checks + cheap check conditions
 *   - array element loops, recursing into object/array/primitive elements
 *   - nested objects (recursed inline, not a per-field closure call)
 * while CAPTURING the existing per-check closures + type-issue makers, so
 * the validation logic — and therefore correctness — is identical to the
 * interpreter; only the dispatch is flattened.
 *
 * A subtree it can't inline (optional/nullable/default, transform/refine,
 * union/record/tuple/map/set/intersection/lazy/coerce, serverCheck, nested
 * objects with their own checks or non-strip key policy) falls back to that
 * subtree's `_runInto` (captured closure) — so the rest still inlines. A
 * fallback that resolves ASYNCHRONOUSLY (async `.refine`/`.transform`/
 * registered `.serverCheck` under `parseAsync`) is deferred onto a pending
 * list the root return awaits — interpreter parity for async trees, zero
 * cost on the all-sync path (the list stays `null`). Schemas it can't JIT
 * at all (non-object root, root with its own checks, non-strip root) return
 * `null` → the caller uses the interpreter. Always correct; fast wherever
 * it can be.
 *
 * Assignment is prototype-pollution-safe at every level (a `__proto__` key
 * is written via `Object.defineProperty`, never `obj.__proto__ =`).
 */

import { makeIssue, typeIssue } from './issue'
import type { PathSegment } from './issue'
import type { ParseCtx } from './ops'
import type { Schema, SyncValidator } from './schema'

// Schemas with a simple `typeof`/identity type-check we can inline.
type PrimKind = 'string' | 'number' | 'boolean' | 'bigint' | 'date' | 'null' | 'undefined' | 'literal'
const PRIM_KINDS = new Set<string>(['string', 'number', 'boolean', 'bigint', 'date', 'null', 'undefined', 'literal'])

/** Duck-typed view of a schema for codegen (standalone — avoids the base `_ops` variance). */
interface FieldLike {
  _kind: string
  _ops: ReadonlyArray<{ kind: string; _checkFn?: (v: unknown, ctx: ParseCtx) => void }>
  value?: unknown // literal value
  element?: FieldLike // array element schema
  shape?: Record<string, FieldLike> // object shape
  _unknownKeys?: string
  _catchall?: unknown // object catchall schema — disqualifies inline (unknown-key validation)
  _coerce?: boolean // overridden _compileType (coercion) → never inline
  _runInto(input: unknown, ctx: ParseCtx): unknown
}

type CheckOpLike = {
  kind: string
  n?: number
  lo?: number // check:number:between lower bound
  hi?: number // check:number:between upper bound
  s?: string // check:string:starts-with / ends-with / includes needle
  _checkFn?: (v: unknown, ctx: ParseCtx) => void
}

/** Inline expression that is TRUE when `v` is the WRONG type for `kind`. */
function typeFailExpr(kind: PrimKind, v: string, litRef: string): string {
  switch (kind) {
    case 'string':
      return `typeof ${v} !== "string"`
    case 'number':
      // a valid number is a non-NaN number (matches NumberSchema._compileType)
      return `typeof ${v} !== "number" || Number.isNaN(${v})`
    case 'boolean':
      return `typeof ${v} !== "boolean"`
    case 'bigint':
      return `typeof ${v} !== "bigint"`
    case 'date':
      return `(${v} instanceof Date) === false || Number.isNaN(${v}.getTime())`
    case 'null':
      return `${v} !== null`
    case 'undefined':
      return `${v} !== undefined`
    case 'literal':
      return `${v} !== ${litRef}`
  }
}

/** A prim kind whose ONLY ops are checks (no modifier/transform/refine → inline-safe). */
function isInlinePrimitive(field: FieldLike): boolean {
  if (!PRIM_KINDS.has(field._kind)) return false
  if (field._coerce) return false // coercion is an overridden _compileType → interpreter
  for (const op of field._ops) if (!op.kind.startsWith('check:')) return false
  return true
}

function fieldCheckOps(field: FieldLike): CheckOpLike[] {
  const out: CheckOpLike[] = []
  for (const op of field._ops) if (op.kind.startsWith('check:') && op._checkFn) out.push(op as CheckOpLike)
  return out
}

/** Inline failure-condition for cheap checks; `null` → call the closure. */
// Render a numeric check bound as a code token. Bounds are numbers by the
// schema-API contract (`.min(n: number)` etc.), but this JIT constructs source
// via `new Function`, so a bound is a value flowing into a code-construction
// sink. Coerce through `Number` at emission so the interpolated token is ALWAYS
// a numeric literal: byte-identical for every real bound (incl. `Infinity` →
// `"Infinity"`, a valid JS token), and `NaN` for any non-numeric a raw JS
// caller might sneak past the types — making code injection structurally
// impossible here rather than trusting the caller. `Number()` is also the
// canonical CodeQL sanitizer for a code sink (resolves the jit.ts alert at the
// root, not via a config suppression).
const numLit = (n: unknown): string => String(Number(n))

function inlineCheckCond(op: CheckOpLike, ve: string): string | null {
  switch (op.kind) {
    case 'check:string:min':
    case 'check:array:min':
      return `${ve}.length < ${numLit(op.n)}`
    case 'check:string:max':
    case 'check:array:max':
      return `${ve}.length > ${numLit(op.n)}`
    case 'check:string:length':
    case 'check:array:length':
      return `${ve}.length !== ${numLit(op.n)}`
    case 'check:string:nonempty':
      return `${ve}.length < 1`
    case 'check:number:min':
      return `${ve} < ${numLit(op.n)}`
    case 'check:number:max':
      return `${ve} > ${numLit(op.n)}`
    case 'check:number:gt':
      return `!(${ve} > ${numLit(op.n)})`
    case 'check:number:lt':
      return `!(${ve} < ${numLit(op.n)})`
    case 'check:number:safe':
      return `!(${ve} >= -9007199254740991 && ${ve} <= 9007199254740991)`
    case 'check:number:int':
      return `!Number.isInteger(${ve})`
    case 'check:number:finite':
      return `!Number.isFinite(${ve})`
    case 'check:number:positive':
      return `!(${ve} > 0)`
    case 'check:number:negative':
      return `!(${ve} < 0)`
    case 'check:number:non-negative':
      return `!(${ve} >= 0)`
    case 'check:number:non-positive':
      return `!(${ve} <= 0)`
    // between: pass = `v >= lo && v <= hi` → fail = `v < lo || v > hi`
    // (the value has already passed the numeric type-guard at the call site).
    case 'check:number:between':
      return `${ve} < ${numLit(op.lo)} || ${ve} > ${numLit(op.hi)}`
    // multipleOf: pass = `v % n === 0` → fail = `v % n !== 0` (no epsilon in the
    // check impl, so a direct `%` is byte-exact).
    case 'check:number:multiple-of':
      return `${ve} % ${numLit(op.n)} !== 0`
    // positional string checks: pass = `v.startsWith/endsWith/includes(s)` →
    // fail = `!v.<method>(s)`. The needle is baked as a string literal.
    case 'check:string:starts-with':
      return `!${ve}.startsWith(${JSON.stringify(op.s)})`
    case 'check:string:ends-with':
      return `!${ve}.endsWith(${JSON.stringify(op.s)})`
    case 'check:string:includes':
      return `!${ve}.includes(${JSON.stringify(op.s)})`
    default:
      return null
  }
}

/**
 * Path state carried through CODEGEN (not runtime): the EFFECTIVE path of the
 * current position is `ctx.path` (the flushed, real portion) + `[dynIdx]` (an
 * enclosing array's loop-index variable, if any) + `suffix` (static object
 * keys accumulated since the last flush). Fully-inline subtrees never touch
 * `ctx.path` on the VALID path — the dominant per-field cost of the old
 * emission (measured ~23ns on a 4-field object) — and reconstruct the full
 * path only at FAILURE sites via {@link jitEffectivePath}. Array loops and
 * `_runInto` fallbacks FLUSH the pending segments onto the real `ctx.path`
 * first (fallback subtrees + always-called format-check closures read it).
 */
interface PathState {
  dynIdx: string | null
  suffix: string[]
}

/** Reconstruct the effective path at a FAILURE site (see {@link PathState}). */
export function jitEffectivePath(
  c: ParseCtx,
  suffix: ReadonlyArray<string>,
  idx?: number,
): ReadonlyArray<PathSegment> {
  if (idx === undefined && suffix.length === 0) return c.path
  return idx === undefined ? [...c.path, ...suffix] : [...c.path, idx, ...suffix]
}

type CheckFn = (v: unknown, ctx: ParseCtx) => void

/**
 * Wrap a check closure so it observes the correct `ctx.path` under path
 * elision: pushes the pending segments (enclosing array index + static
 * suffix) around the call, restoring after. Identity (no wrapper, no cost)
 * when there is nothing pending — the root-scalar hot path is byte-identical
 * to the pre-elision emission.
 */
function wrapCheckWithPath(fn: CheckFn, suffix: ReadonlyArray<string>, hasDynIdx: boolean): CheckFn {
  if (suffix.length === 0 && !hasDynIdx) return fn
  return (v: unknown, c: ParseCtx, idx?: number) => {
    const p = c.path
    let n = 0
    if (idx !== undefined) {
      p.push(idx)
      n++
    }
    for (const seg of suffix) {
      p.push(seg)
      n++
    }
    try {
      fn(v, c)
    } finally {
      while (n-- > 0) p.pop()
    }
  }
}

/**
 * A plain object we can recurse into (no own checks/transforms, strip policy,
 * NO catchall — a catchall validates unknown keys, which the inline shape-only
 * loop would silently skip).
 */
const isPlainObject = (s: FieldLike): boolean =>
  s._kind === 'object' &&
  Array.isArray(s._ops) &&
  s._ops.length === 0 &&
  s._unknownKeys === 'strip' &&
  !s._catchall
/**
 * An array we can recurse into: has an element schema AND its OWN ops are
 * all checks (min/max/length). An array carrying a modifier/transform/refine
 * is NOT inline-able — the element loop would silently drop those ops — so it
 * falls back to its `_runInto` (correct).
 */
const isInlineArray = (s: FieldLike): boolean =>
  s._kind === 'array' && !!s.element && Array.isArray(s._ops) && s._ops.every((op) => op.kind.startsWith('check:'))

/**
 * Whether a field's VALID value is provably never `undefined` — lets
 * `genObjectBody` drop the redundant `if (r !== undefined || (k in src))`
 * strip-assignment guard. True for inline objects/arrays (freshly built) and
 * inline primitives whose type-guard excludes `undefined` (everything except
 * the `undefined` kind and `literal`, whose literal value could itself be
 * `undefined`). Anything routed to the `_runInto` fallback (optional / default
 * / nullable / union / …) can legitimately yield `undefined`, so it is NOT
 * covered here and keeps the guard.
 */
function fieldDefinedWhenValid(field: FieldLike): boolean {
  if (isPlainObject(field) || isInlineArray(field)) return true
  if (isInlinePrimitive(field)) return field._kind !== 'undefined' && field._kind !== 'literal'
  return false
}

/**
 * Try to JIT-compile `schema`. Returns a specialized validator, or `null`
 * if the root isn't an inline-able object (caller → interpreter). Never
 * throws — any codegen error returns `null`.
 */
export function tryCompileJit(schema: Schema<unknown>): SyncValidator | null {
  const root = schema as unknown as FieldLike
  // JIT a composite root (object/array) OR an inline-primitive root (string /
  // number / … with only checks). A primitive root inlines its `typeof` +
  // cheap check conditions with zero closure calls on the valid path —
  // beating the interpreter's per-check closure dispatch. Other roots (union,
  // record, coerce, modifier-wrapped, …) gain nothing from flattening, so the
  // interpreter handles them.
  if (!isPlainObject(root) && !isInlineArray(root) && !isInlinePrimitive(root)) return null

  try {
    const helpers: unknown[] = []
    const cap = (h: unknown): string => {
      helpers.push(h)
      return `H[${helpers.length - 1}]`
    }
    const keyLit = (k: string): string => JSON.stringify(k)
    let uid = 0
    const nv = (): string => `t${uid++}`

    const genChecks = (ops: CheckOpLike[], ve: string, ps: PathState): string => {
      const idxArg = ps.dynIdx ? `, ${ps.dynIdx}` : ''
      return ops
        .map((op) => {
          const cond = inlineCheckCond(op, ve)
          // Check closures read `ctx.path` when they push an issue — under
          // path elision they get a wrapper that reinstates the pending
          // segments around the call (identity when nothing is pending, so
          // the root-scalar path is unchanged). Cheap inline conds call the
          // closure on FAILURE only; format checks call it always (the
          // wrapper's push/pop then costs the same as the old per-field
          // P.push — never more).
          const call = `${cap(wrapCheckWithPath(op._checkFn!, ps.suffix, ps.dynIdx !== null))}(${ve}, ctx${idxArg});`
          // Inline ONLY cheap literal conditions (length / numeric compares):
          // the valid path then pays no closure CALL. Format/regex checks
          // deliberately stay closure-calls — MEASURED 3.5× FASTER than
          // inlining `H[k].test(v)` into the generated function (a small
          // monomorphic closure is better optimized than regex-via-array-
          // indirection in `new Function` code).
          return cond ? `if (${cond}) { ${call} }` : call
        })
        .join(' ')
    }

    // Prototype-pollution-safe assignment of `valExpr` into `target[kl]`.
    const assign = (target: string, kl: string, key: string, valExpr: string): string =>
      key === '__proto__'
        ? `Object.defineProperty(${target}, ${kl}, { value: ${valExpr}, enumerable: true, writable: true, configurable: true });`
        : `${target}[${kl}] = ${valExpr};`

    // Emit the real `ctx.path` pushes for the pending segments (an enclosing
    // array's dynamic index + the static key suffix) and the matching pops.
    // Used before an array element loop / a `_runInto` fallback — the two
    // places that need the REAL path to be current.
    const flushPath = (ps: PathState): { pre: string; post: string } => {
      const pushes: string[] = []
      if (ps.dynIdx) pushes.push(`P.push(${ps.dynIdx});`)
      for (const seg of ps.suffix) pushes.push(`P.push(${JSON.stringify(seg)});`)
      const n = (ps.dynIdx ? 1 : 0) + ps.suffix.length
      return { pre: pushes.join(' '), post: n === 0 ? '' : Array(n).fill('P.pop();').join(' ') }
    }

    const lines: string[] = []

    // Bound generated-function size + codegen recursion on a pathologically
    // deep schema: beyond this nesting depth a subtree uses its `_runInto`
    // closure (still correct, just not inlined). The `try/catch` around
    // codegen is the backstop; this keeps the emitted function reasonable.
    const MAX_DEPTH = 24

    // Validate `srcVar`; on success emit `onValid(resultExpr)`. The caller
    // has already pushed any path segment. Recurses for object/array.
    // `onAsync(promiseExpr)` is emitted when a FALLBACK subtree returns a
    // Promise (async `.refine`/`.transform`/registered `.serverCheck` under
    // `parseAsync`) — it defers the result application onto the function-level
    // pending list `A`, which the root return awaits (interpreter parity: the
    // whole parse resolves to a Promise; a sync `parse()` reports the ONE
    // canonical async-in-sync issue at the root).
    const genValue = (field: FieldLike, srcVar: string, onValid: (r: string) => string, onAsync: (p: string) => string, depth: number, ps: PathState): void => {
      // Failure-site issue makers reconstruct the effective path from the
      // captured static suffix + the (runtime) enclosing array index — the
      // VALID path never touches `ctx.path` for inline subtrees.
      const sfx = ps.suffix
      const idxArg = ps.dynIdx ? `, ${ps.dynIdx}` : ''
      if (isInlinePrimitive(field)) {
        const kind = field._kind as PrimKind
        const litRef = kind === 'literal' ? cap(field.value) : ''
        // The literal type-mismatch issue must match the interpreter's
        // `invalid_literal` shape (LiteralSchema._compileType) — "Expected
        // <value>" — NOT the generic typeIssue ("Expected literal, …").
        const ti =
          kind === 'literal'
            ? cap((val: unknown, c: ParseCtx, idx?: number) => {
                const lit = field.value
                c.issues.push(
                  makeIssue({
                    code: 'invalid_literal',
                    key: 'validate.literal.mismatch',
                    params: { expected: lit, actual: val },
                    fallback: `Expected ${String(lit)}`,
                    message: `Expected ${String(lit)}`,
                    path: jitEffectivePath(c, sfx, idx),
                  }),
                )
              })
            : cap((val: unknown, c: ParseCtx, idx?: number) => {
                c.issues.push(typeIssue(kind, val, jitEffectivePath(c, sfx, idx)))
              })
        const checks = genChecks(fieldCheckOps(field), srcVar, ps)
        lines.push(`if (${typeFailExpr(kind, srcVar, litRef)}) { ${ti}(${srcVar}, ctx${idxArg}); } else { ${checks} ${onValid(srcVar)} }`)
        return
      }
      if (depth <= MAX_DEPTH && isPlainObject(field)) {
        const ti = cap((val: unknown, c: ParseCtx, idx?: number) => {
          c.issues.push(typeIssue('object', val, jitEffectivePath(c, sfx, idx)))
        })
        const outV = nv()
        lines.push(`if (typeof ${srcVar} !== "object" || ${srcVar} === null || Array.isArray(${srcVar})) { ${ti}(${srcVar}, ctx${idxArg}); } else {`)
        lines.push(`let ${outV} = {};`)
        genObjectBody(field.shape as Record<string, FieldLike>, srcVar, outV, depth + 1, ps)
        // A pending descendant patches `outV` by reference when it settles, so
        // handing the object to `onValid` NOW is correct — the root return
        // barrier awaits every pending entry before the value escapes.
        lines.push(onValid(outV))
        lines.push(`}`)
        return
      }
      if (depth <= MAX_DEPTH && isInlineArray(field) && field.element) {
        const ti = cap((val: unknown, c: ParseCtx, idx?: number) => {
          c.issues.push(typeIssue('array', val, jitEffectivePath(c, sfx, idx)))
        })
        const arrV = nv()
        const iV = nv()
        const eV = nv()
        const beforeV = nv()
        const a0V = nv()
        // Elements need a REAL current path (their own dynamic index rides on
        // `ps.dynIdx`; fallback elements + format checks read `ctx.path`) —
        // flush this array's pending segments around the whole element block.
        const { pre, post } = flushPath(ps)
        const elemPs: PathState = { dynIdx: iV, suffix: [] }
        // The array's own checks run INSIDE the flushed block (sync case) or
        // at settlement (deferred case) — in BOTH they read the live
        // `ctx.path` unwrapped: flushed = correct full path; deferred = the
        // unwound path, which is EXACTLY what the interpreter's post-await
        // `runPostType` checks observe (parity over prettiness).
        const arrChecks = genChecks(fieldCheckOps(field), srcVar, { dynIdx: null, suffix: [] })
        lines.push(`if (!Array.isArray(${srcVar})) { ${ti}(${srcVar}, ctx${idxArg}); } else {`)
        if (pre) lines.push(pre)
        lines.push(`let ${arrV} = []; let ${beforeV} = ctx.issues.length; let ${a0V} = A === null ? 0 : A.length;`)
        lines.push(`for (let ${iV} = 0; ${iV} < ${srcVar}.length; ${iV}++) { let ${eV} = ${srcVar}[${iV}];`)
        // element pushed within its own type-ok branch (a failed element pushes
        // issues → the overall parse fails → the array value is discarded), so
        // the hot path pays no extra guard. Matches the interpreter element loop.
        // An ASYNC element reserves its positional slot now and is filled when
        // it settles (ArraySchema's slot semantics — order preserved).
        const slotV = nv()
        genValue(
          field.element,
          eV,
          (r) => `${arrV}.push(${r});`,
          (p) =>
            `const ${slotV} = ${arrV}.length; ${arrV}.push(undefined); if (A === null) { A = []; B = []; } A.push(${p}); B.push((${eV}r) => { ${arrV}[${slotV}] = ${eV}r; });`,
          depth + 1,
          elemPs,
        )
        lines.push(`}`)
        // The array's OWN checks (min/max/length) run AFTER element validation
        // and ONLY when no element failed — exactly the interpreter's
        // "type-check produced issues → skip checks" contract (compileSchema).
        // They run while the array's path is still FLUSHED (their closures
        // read `ctx.path` on failure). If the element loop deferred anything,
        // the checks defer too (they must observe the final issue state,
        // post-settlement) — the deferred closure reconstructs the path via
        // its own wrapper, so it runs with `sfxArr` captured, not the live P.
        if (arrChecks) {
          lines.push(
            `if (A === null || A.length === ${a0V}) { if (ctx.issues.length === ${beforeV}) { ${arrChecks} } } else { A.push(Promise.all(A.slice(${a0V})).then(() => { if (ctx.issues.length === ${beforeV}) { ${arrChecks} } })); B.push(NOOP); }`,
          )
        }
        if (post) lines.push(post)
        lines.push(onValid(arrV))
        lines.push(`}`)
        return
      }
      // Fallback: this subtree's compiled validator against the shared ctx —
      // which must observe the REAL current path (issues, pending serverCheck
      // entries, async snapshots), so the pending segments are flushed around
      // the call. A Promise result (async `.refine`/`.transform`/registered
      // `.serverCheck`) routes through `onAsync` — deferred onto `A`, awaited
      // by the root return, exactly like the interpreter's pending collection.
      const run = cap((val: unknown, c: ParseCtx) => field._runInto(val, c))
      const fv = nv()
      const { pre, post } = flushPath(ps)
      lines.push(
        `${pre} let ${fv} = ${run}(${srcVar}, ctx); ${post} if (${fv} && typeof ${fv}.then === "function") { ${onAsync(fv)} } else { ${onValid(fv)} }`,
      )
    }

    function genObjectBody(shape: Record<string, FieldLike>, srcVar: string, outVar: string, depth: number, ps: PathState): void {
      for (const key of Object.keys(shape)) {
        const field = shape[key]!
        const kl = keyLit(key)
        const vV = nv()
        // NO `P.push(key)` — the key rides on the codegen-time suffix; only
        // failure sites / flush points materialize it (the path-elision win).
        const fieldPs: PathState = { dynIdx: ps.dynIdx, suffix: [...ps.suffix, key] }
        lines.push(`let ${vV} = ${srcVar}[${kl}];`)
        // The assignment guard `if (r !== undefined || (k in src))` decides
        // whether strip-mode copies the key. It is REDUNDANT when the value
        // reaching `onValid` is provably-not-`undefined`: an inline primitive
        // is assigned only inside the branch that already passed its
        // `typeof`/identity guard (so `undefined` is excluded — except the
        // `undefined`/`literal` kinds, whose valid value CAN be `undefined`),
        // and an inline object/array is a freshly-built `{}`/`[]`. In those
        // cases we emit the bare assignment — dropping a comparison (+ a
        // potential `in`) per required field on every parse. The fallback
        // path (`_runInto` for optional/default/nullable/union/…) can yield
        // `undefined`, so it KEEPS the guard. Locked by the JIT↔interpreter
        // differential fuzz (strip semantics compared).
        const onValid = fieldDefinedWhenValid(field)
          ? (r: string) => assign(outVar, kl, key, r)
          : (r: string) => `if (${r} !== undefined || (${kl} in ${srcVar})) { ${assign(outVar, kl, key, r)} }`
        // Deferred variant of the same strip-guarded assignment — an async
        // field's resolved value is applied AT THE ROOT BARRIER (A = promises,
        // B = paired apply callbacks), in deferral order. Applying inside each
        // promise's own `.then` would key-order the output by SETTLEMENT order
        // — observably different from the interpreter's field-ordered pend
        // loop (fuzz-found key-order divergence).
        const onAsync = (p: string) =>
          `if (A === null) { A = []; B = []; } A.push(${p}); B.push((${vV}r) => { if (${vV}r !== undefined || (${kl} in ${srcVar})) { ${assign(outVar, kl, key, `${vV}r`)} } });`
        genValue(field, vV, onValid, onAsync, depth, fieldPs)
      }
    }

    lines.push(`var P = ctx.path;`)
    // Function-level pending lists — async fallback subtrees defer here:
    // `A[i]` is the promise, `B[i]` the paired apply-callback run with the
    // resolved value at the root barrier (in deferral = field order, matching
    // the interpreter's pend loop; per-settlement application would key-order
    // the output by settlement order). NOOP pads `B` for self-applying
    // entries (deferred array checks).
    lines.push(`var A = null; var B = null; var NOOP = () => {};`)
    const BARRIER = (r: string) =>
      `return A === null ? ${r} : Promise.all(A).then((vs) => { for (var z = 0; z < vs.length; z++) B[z](vs[z]); return ${r}; });`
    // Validate the root via the same recursive generator: on a valid value
    // `return` it (behind the pending barrier when anything deferred); if the
    // root type-guard fails the issue was pushed and we fall through to
    // `return input` (the raw value — the parse has failed).
    genValue(root, 'input', BARRIER, (p) => `return ${p};`, 0, { dynIdx: null, suffix: [] })
    lines.push(BARRIER('input'))

    const body = lines.join('\n')
    // eslint-disable-next-line no-new-func
    const factory = new Function('H', `return function jitValidate(input, ctx) {\n${body}\n}`) as (
      h: unknown[],
    ) => SyncValidator
    return factory(helpers)
  } catch {
    return null
  }
}
