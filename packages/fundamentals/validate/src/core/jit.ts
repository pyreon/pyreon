/**
 * JIT validator codegen — the "fastest" path.
 *
 * The interpreted pipeline (compileSchema + per-field `_runInto`) pays a
 * virtual `_compileType` dispatch, a checks-array iteration, and several
 * wrapper function calls PER FIELD. ArkType wins valid-parse because it
 * compiles each schema to ONE flat monomorphic function. This module does
 * the same for the dominant real-world shape — an object of primitives /
 * primitive-arrays — by generating a specialized `(input, ctx) => value`
 * function via `new Function`, INLINING:
 *   - the object type guard + field access (no `Object.keys` allocation)
 *   - each primitive field's `typeof` type-check
 *   - primitive-array element loops
 * while CAPTURING the existing per-check closures + type-issue makers (so
 * the validation logic — and therefore correctness — is identical to the
 * interpreter; only the dispatch is flattened).
 *
 * Anything it can't inline (optional/nullable/default fields, nested
 * objects, transform/refine, unions, records, tuples, coercion, …) falls
 * back PER FIELD to the field's `_runInto` (captured closure). Schemas it
 * can't JIT at all (non-object root, object with its own checks/transforms,
 * non-strip unknown-key policy) return `null` → the caller uses the
 * interpreter. So the JIT is always correct and fast where it can be.
 */

import { typeIssue } from './issue'
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
  _runInto(input: unknown, ctx: ParseCtx): unknown
}

/** Inline expression that is TRUE when `v` is the WRONG type for `kind`. */
function typeFailExpr(kind: PrimKind, v: string, litRef: string): string {
  switch (kind) {
    case 'string':
      return `typeof ${v} !== "string"`
    case 'number':
      return `typeof ${v} !== "number"`
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

/** True if a field is an inline-able primitive: a prim kind whose ONLY ops are checks. */
function isInlinePrimitive(field: FieldLike): boolean {
  if (!PRIM_KINDS.has(field._kind)) return false
  for (const op of field._ops) {
    if (!op.kind.startsWith('check:')) return false // a modifier/transform/refine → not inline
  }
  return true
}

type CheckOpLike = { kind: string; n?: number; _checkFn?: (v: unknown, ctx: ParseCtx) => void }

/** Collect the check ops from a field's ops (in order). */
function fieldCheckOps(field: FieldLike): CheckOpLike[] {
  const out: CheckOpLike[] = []
  for (const op of field._ops) {
    if (op.kind.startsWith('check:') && op._checkFn) out.push(op as CheckOpLike)
  }
  return out
}

/**
 * Inline failure-condition for cheap checks (length / numeric comparisons).
 * When available, the generated code runs ONLY this inline test on the hot
 * (success) path and gates the captured check closure (which builds the
 * issue) behind it — so a passing field pays no function call. Returns
 * `null` for checks with no cheap inline form (email / regex / uuid / …)
 * → those always call the closure (their regex test dominates anyway).
 */
function inlineCheckCond(op: CheckOpLike, ve: string): string | null {
  switch (op.kind) {
    case 'check:string:min':
      return `${ve}.length < ${op.n}`
    case 'check:string:max':
      return `${ve}.length > ${op.n}`
    case 'check:string:length':
      return `${ve}.length !== ${op.n}`
    case 'check:string:nonempty':
      return `${ve}.length < 1`
    case 'check:number:min':
      return `${ve} < ${op.n}`
    case 'check:number:max':
      return `${ve} > ${op.n}`
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
    case 'check:array:min':
      return `${ve}.length < ${op.n}`
    case 'check:array:max':
      return `${ve}.length > ${op.n}`
    case 'check:array:length':
      return `${ve}.length !== ${op.n}`
    default:
      return null
  }
}

const isObject = (s: FieldLike): boolean => s._kind === 'object' && Array.isArray(s._ops)
const isArray = (s: FieldLike): boolean => s._kind === 'array' && !!s.element

/**
 * Try to JIT-compile `schema`. Returns a specialized validator, or `null`
 * if the schema isn't in the supported subset (caller falls back to the
 * interpreter). Never throws — on any codegen error it returns `null`.
 */
export function tryCompileJit(schema: Schema<unknown>): SyncValidator | null {
  const root = schema as unknown as FieldLike
  // Only JIT a pure object root (strip, no own checks/transforms/refines).
  if (!isObject(root)) return null
  if (root._ops.length > 0) return null
  if (root._unknownKeys !== 'strip') return null

  try {
    const helpers: unknown[] = []
    const cap = (h: unknown): string => {
      helpers.push(h)
      return `H[${helpers.length - 1}]`
    }
    const keyLit = (k: string): string => JSON.stringify(k)

    const shape = root.shape as Record<string, FieldLike>
    const lines: string[] = []
    // Captured type-issue makers PUSH directly into ctx (void helpers).
    const tiObject = cap((v: unknown, c: ParseCtx) => {
      c.issues.push(typeIssue('object', v, c.path))
    })
    lines.push(`if (typeof input !== "object" || input === null || Array.isArray(input)) { ${tiObject}(input, ctx); return input; }`)
    lines.push(`var out = {}; var P = ctx.path; var v, arr, e;`)

    // Generate the check sequence for a value-expr: inline the cheap
    // condition (success path pays no call), gate the issue-building
    // closure behind it; always-call for checks with no inline form.
    const genChecks = (ops: CheckOpLike[], ve: string): string =>
      ops
        .map((op) => {
          const cond = inlineCheckCond(op, ve)
          const call = `${cap(op._checkFn)}(${ve}, ctx);`
          return cond ? `if (${cond}) { ${call} }` : call
        })
        .join(' ')

    for (const key of Object.keys(shape)) {
      const field = shape[key]!
      const kl = keyLit(key)
      lines.push(`P.push(${kl});`)
      lines.push(`v = input[${kl}];`)

      if (isInlinePrimitive(field)) {
        const kind = field._kind as PrimKind
        const litRef = kind === 'literal' ? cap(field.value) : ''
        const ti = cap((val: unknown, c: ParseCtx) => {
          c.issues.push(typeIssue(kind, val, c.path))
        })
        const checkCalls = genChecks(fieldCheckOps(field), 'v')
        lines.push(`if (${typeFailExpr(kind, 'v', litRef)}) { ${ti}(v, ctx); } else { ${checkCalls} out[${kl}] = v; }`)
      } else if (isArray(field) && field.element && isInlinePrimitive(field.element)) {
        const el = field.element
        const ekind = el._kind as PrimKind
        const eLitRef = ekind === 'literal' ? cap(el.value) : ''
        const tiArr = cap((val: unknown, c: ParseCtx) => {
          c.issues.push(typeIssue('array', val, c.path))
        })
        const eti = cap((val: unknown, c: ParseCtx) => {
          c.issues.push(typeIssue(ekind, val, c.path))
        })
        const eCheckCalls = genChecks(fieldCheckOps(el), 'e')
        // also honor the array schema's own checks (min/max/length)
        const arrCheckCalls = genChecks(fieldCheckOps(field), 'v')
        lines.push(
          `if (!Array.isArray(v)) { ${tiArr}(v, ctx); } else { ${arrCheckCalls} arr = []; for (var j = 0; j < v.length; j++) { e = v[j]; P.push(j); if (${typeFailExpr(ekind, 'e', eLitRef)}) { ${eti}(e, ctx); } else { ${eCheckCalls} arr.push(e); } P.pop(); } out[${kl}] = arr; }`,
        )
      } else {
        // Fallback: run the field's own compiled validator against the shared ctx.
        const run = cap((val: unknown, c: ParseCtx) => (field as { _runInto(i: unknown, c: ParseCtx): unknown })._runInto(val, c))
        lines.push(
          `var fv = ${run}(v, ctx); if (fv && typeof fv.then === "function") { ctx.issues.push({ message: "[Pyreon] async schema used in sync parse — use parseAsync", path: P.slice() }); } else if (fv !== undefined || (${kl} in input)) { if (${kl} === "__proto__") { Object.defineProperty(out, ${kl}, { value: fv, enumerable: true, writable: true, configurable: true }); } else { out[${kl}] = fv; } }`,
        )
      }
      lines.push(`P.pop();`)
    }
    lines.push(`return out;`)

    const body = lines.join('\n')
    // eslint-disable-next-line no-new-func
    const factory = new Function('H', `return function jitValidate(input, ctx) {\n${body}\n}`) as (
      h: unknown[],
    ) => SyncValidator
    return factory(helpers)
  } catch {
    return null // any codegen problem → interpreter
  }
}
