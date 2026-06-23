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
 * union/record/tuple/map/set/intersection/lazy/coerce, nested objects with
 * their own checks or non-strip key policy) falls back to that subtree's
 * `_runInto` (captured closure) — so the rest still inlines. Schemas it
 * can't JIT at all (non-object root, root with its own checks, non-strip
 * root) return `null` → the caller uses the interpreter. Always correct;
 * fast wherever it can be.
 *
 * Assignment is prototype-pollution-safe at every level (a `__proto__` key
 * is written via `Object.defineProperty`, never `obj.__proto__ =`).
 */

import { makeIssue, typeIssue } from './issue'
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

type CheckOpLike = { kind: string; n?: number; _checkFn?: (v: unknown, ctx: ParseCtx) => void }

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
function inlineCheckCond(op: CheckOpLike, ve: string): string | null {
  switch (op.kind) {
    case 'check:string:min':
    case 'check:array:min':
      return `${ve}.length < ${op.n}`
    case 'check:string:max':
    case 'check:array:max':
      return `${ve}.length > ${op.n}`
    case 'check:string:length':
    case 'check:array:length':
      return `${ve}.length !== ${op.n}`
    case 'check:string:nonempty':
      return `${ve}.length < 1`
    case 'check:number:min':
      return `${ve} < ${op.n}`
    case 'check:number:max':
      return `${ve} > ${op.n}`
    case 'check:number:gt':
      return `!(${ve} > ${op.n})`
    case 'check:number:lt':
      return `!(${ve} < ${op.n})`
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
    default:
      return null
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
 * Whether `s` (or any nested field) carries a `serverCheck` op. The JIT emits
 * SYNCHRONOUS code; a `serverCheck` resolved by an async registered validator
 * returns a Promise, which the generated code can't await — so any tree with a
 * `serverCheck` must fall back to the (now async-aware) interpreter. Bounded
 * recursion (a deeper tree disqualifies — conservative, never wrong).
 */
const treeHasServerCheck = (s: FieldLike, depth = 0): boolean => {
  if (depth > 30) return true
  if (Array.isArray(s._ops)) for (const op of s._ops) if (op.kind === 'serverCheck') return true
  if (s.shape)
    for (const k in s.shape) {
      const child = s.shape[k]
      if (child && treeHasServerCheck(child, depth + 1)) return true
    }
  return !!s.element && treeHasServerCheck(s.element, depth + 1)
}

/**
 * Try to JIT-compile `schema`. Returns a specialized validator, or `null`
 * if the root isn't an inline-able object (caller → interpreter). Never
 * throws — any codegen error returns `null`.
 */
export function tryCompileJit(schema: Schema<unknown>): SyncValidator | null {
  const root = schema as unknown as FieldLike
  // A `serverCheck` anywhere in the tree forces the interpreter (the JIT can't
  // await an async registered validator). Cheap scan, before any codegen.
  if (treeHasServerCheck(root)) return null
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

    const genChecks = (ops: CheckOpLike[], ve: string): string =>
      ops
        .map((op) => {
          const cond = inlineCheckCond(op, ve)
          const call = `${cap(op._checkFn)}(${ve}, ctx);`
          // Inline ONLY cheap literal conditions (length / numeric compares):
          // the valid path then pays no closure CALL. Format/regex checks
          // deliberately stay closure-calls — MEASURED 3.5× FASTER than
          // inlining `H[k].test(v)` into the generated function (a small
          // monomorphic closure is better optimized than regex-via-array-
          // indirection in `new Function` code).
          return cond ? `if (${cond}) { ${call} }` : call
        })
        .join(' ')

    // Prototype-pollution-safe assignment of `valExpr` into `target[kl]`.
    const assign = (target: string, kl: string, key: string, valExpr: string): string =>
      key === '__proto__'
        ? `Object.defineProperty(${target}, ${kl}, { value: ${valExpr}, enumerable: true, writable: true, configurable: true });`
        : `${target}[${kl}] = ${valExpr};`

    const lines: string[] = []

    // Async-in-sync diagnostics, matching the interpreter's two messages.
    const ASYNC_FIELD = '[Pyreon] async schema used in sync parse — use parseAsync'
    const ASYNC_ELEMENT = '[Pyreon] async element schema used in sync parse — use parseAsync'

    // Bound generated-function size + codegen recursion on a pathologically
    // deep schema: beyond this nesting depth a subtree uses its `_runInto`
    // closure (still correct, just not inlined). The `try/catch` around
    // codegen is the backstop; this keeps the emitted function reasonable.
    const MAX_DEPTH = 24

    // Validate `srcVar`; on success emit `onValid(resultExpr)`. The caller
    // has already pushed any path segment. Recurses for object/array.
    // `asyncMsg` is the diagnostic pushed if the fallback subtree turns out
    // to be async (interpreter parity: element vs field wording).
    const genValue = (field: FieldLike, srcVar: string, onValid: (r: string) => string, asyncMsg: string, depth: number): void => {
      if (isInlinePrimitive(field)) {
        const kind = field._kind as PrimKind
        const litRef = kind === 'literal' ? cap(field.value) : ''
        // The literal type-mismatch issue must match the interpreter's
        // `invalid_literal` shape (LiteralSchema._compileType) — "Expected
        // <value>" — NOT the generic typeIssue ("Expected literal, …").
        const ti =
          kind === 'literal'
            ? cap((val: unknown, c: ParseCtx) => {
                const lit = field.value
                c.issues.push(
                  makeIssue({
                    code: 'invalid_literal',
                    key: 'validate.literal.mismatch',
                    params: { expected: lit, actual: val },
                    fallback: `Expected ${String(lit)}`,
                    message: `Expected ${String(lit)}`,
                    path: c.path,
                  }),
                )
              })
            : cap((val: unknown, c: ParseCtx) => {
                c.issues.push(typeIssue(kind, val, c.path))
              })
        const checks = genChecks(fieldCheckOps(field), srcVar)
        lines.push(`if (${typeFailExpr(kind, srcVar, litRef)}) { ${ti}(${srcVar}, ctx); } else { ${checks} ${onValid(srcVar)} }`)
        return
      }
      if (depth <= MAX_DEPTH && isPlainObject(field)) {
        const ti = cap((val: unknown, c: ParseCtx) => {
          c.issues.push(typeIssue('object', val, c.path))
        })
        const outV = nv()
        lines.push(`if (typeof ${srcVar} !== "object" || ${srcVar} === null || Array.isArray(${srcVar})) { ${ti}(${srcVar}, ctx); } else {`)
        lines.push(`var ${outV} = {};`)
        genObjectBody(field.shape as Record<string, FieldLike>, srcVar, outV, depth + 1)
        lines.push(onValid(outV))
        lines.push(`}`)
        return
      }
      if (depth <= MAX_DEPTH && isInlineArray(field) && field.element) {
        const ti = cap((val: unknown, c: ParseCtx) => {
          c.issues.push(typeIssue('array', val, c.path))
        })
        const arrV = nv()
        const iV = nv()
        const eV = nv()
        const beforeV = nv()
        const arrChecks = genChecks(fieldCheckOps(field), srcVar)
        lines.push(`if (!Array.isArray(${srcVar})) { ${ti}(${srcVar}, ctx); } else {`)
        lines.push(`var ${arrV} = []; var ${beforeV} = ctx.issues.length;`)
        lines.push(`for (var ${iV} = 0; ${iV} < ${srcVar}.length; ${iV}++) { var ${eV} = ${srcVar}[${iV}]; P.push(${iV});`)
        // element pushed within its own type-ok branch (a failed element pushes
        // issues → the overall parse fails → the array value is discarded), so
        // the hot path pays no extra guard. Matches the interpreter element loop.
        genValue(field.element, eV, (r) => `${arrV}.push(${r});`, ASYNC_ELEMENT, depth + 1)
        lines.push(`P.pop(); }`)
        // The array's OWN checks (min/max/length) run AFTER element validation
        // and ONLY when no element failed — exactly the interpreter's
        // "type-check produced issues → skip checks" contract (compileSchema).
        if (arrChecks) lines.push(`if (ctx.issues.length === ${beforeV}) { ${arrChecks} }`)
        lines.push(onValid(arrV))
        lines.push(`}`)
        return
      }
      // Fallback: this subtree's compiled validator against the shared ctx.
      const run = cap((val: unknown, c: ParseCtx) => field._runInto(val, c))
      const fv = nv()
      lines.push(
        `var ${fv} = ${run}(${srcVar}, ctx); if (${fv} && typeof ${fv}.then === "function") { ctx.issues.push({ message: ${JSON.stringify(asyncMsg)}, path: P.slice() }); } else { ${onValid(fv)} }`,
      )
    }

    function genObjectBody(shape: Record<string, FieldLike>, srcVar: string, outVar: string, depth: number): void {
      for (const key of Object.keys(shape)) {
        const field = shape[key]!
        const kl = keyLit(key)
        const vV = nv()
        lines.push(`P.push(${kl}); var ${vV} = ${srcVar}[${kl}];`)
        genValue(field, vV, (r) => `if (${r} !== undefined || (${kl} in ${srcVar})) { ${assign(outVar, kl, key, r)} }`, ASYNC_FIELD, depth)
        lines.push(`P.pop();`)
      }
    }

    lines.push(`var P = ctx.path;`)
    // Validate the root via the same recursive generator: on a valid value
    // `return` it; if the root type-guard fails the issue was pushed and we
    // fall through to `return input` (the raw value — the parse has failed).
    genValue(root, 'input', (r) => `return ${r};`, ASYNC_FIELD, 0)
    lines.push(`return input;`)

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
