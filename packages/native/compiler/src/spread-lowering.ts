// Object-SPREAD lowering decisions, shared by both native emitters.
//
// THE BUG CLASS: both emitters recognised exactly ONE spread shape — a single
// identifier spread whose override keys already exist on the source
// (`{ ...t, done: !t.done }`, the TodoMVC idiom) — and every other spelling of
// an object spread fell through to the plain object/tuple emit with ZERO
// warnings. Measured before this module existed:
//
//   { ...p }          Swift `{ var c = p; ; return c }()` — an empty statement
//   { ...p, z: 5 }    a NEW key: `c.z = 5` / `p.copy(z = 5)`, no such member
//   { ...p, ...q }    Swift AND Kotlin `()` — Swift's empty TUPLE, which
//                     COMPILES, so the value is silently Void
//   { a: 9, ...p }    byte-IDENTICAL to `{ ...p, a: 9 }` on both targets,
//                     because the IR kept fields and spreads in two separate
//                     arrays and lost their relative order. JS answers 1 and
//                     9 for those two; the emit answered 9 for both, and
//                     compiled everywhere — the worst half of the class.
//
// The order fix needs the IR to carry it: `fields[i].afterSpreads` is the
// number of spreads that precede that field in SOURCE order. A field only
// WINS when it comes after every spread; one written before a spread that
// also provides the key is dead, exactly as in JS.

import type { DeclIR, ExprIR, StructIR, TypeIR } from './types'

export type ObjectField = { name: string; value: ExprIR; afterSpreads?: number }

/**
 * What the emitter should do with an object literal that has spreads.
 * `null` means NOT CLAIMED — the caller keeps its existing behaviour (which
 * is what makes this seam safe to call first).
 */
export type SpreadPlan = {
  /** `copy` = the source IS the value; `override` = copy then assign. */
  readonly kind: 'copy' | 'override'
  readonly source: ExprIR
  readonly fields: ObjectField[]
  /**
   * Present when the plan is an APPROXIMATION: the shape could not be
   * lowered faithfully and this names why. The plan is still emitted —
   * deliberately. The alternative was the pre-existing fall-through,
   * which rendered `{ ...p, ...q }` as Swift's empty tuple `()`: Void,
   * and it COMPILES, so the value was silently nothing. Emitting the
   * source instead means any use of a field this plan could not carry
   * fails loudly AT THE USE SITE, while the warning names the cause.
   */
  readonly warn?: string
} | null

export interface SpreadResolver {
  /** The field NAMES of the spread source's type, or null when unknown. */
  fieldsOf(expr: ExprIR): ReadonlySet<string> | null
  /** A stable key identifying the source's TYPE, or null when unknown. */
  typeKeyOf(expr: ExprIR): string | null
  /** How to name the source in a warning. */
  label(expr: ExprIR): string
}

/** A field wins iff it is written after EVERY spread (JS: later wins). */
const winners = (fields: ObjectField[], spreadCount: number): ObjectField[] =>
  fields.filter((f) => (f.afterSpreads ?? spreadCount) >= spreadCount)

export function planObjectSpread(
  fields: ObjectField[],
  spreads: readonly ExprIR[],
  r: SpreadResolver,
): SpreadPlan {
  if (spreads.length === 0) return null

  // A non-identifier source (`{ ...makeDefaults() }`, `{ ...cfg.theme }`) was
  // never claimed by either emitter and fell into the plain-literal path,
  // which drops the spread entirely — a silent loss of every inherited field.
  if (spreads.some((s) => s.kind !== 'identifier')) return null

  const last = spreads[spreads.length - 1]!
  const surviving = winners(fields, spreads.length)
  const plan = (warn?: string): SpreadPlan => ({
    kind: surviving.length === 0 ? 'copy' : 'override',
    source: last,
    fields: surviving,
    ...(warn === undefined ? {} : { warn }),
  })

  // MULTIPLE sources. When every source has the SAME type, each one supplies
  // the whole field set, so the LAST spread alone is the merged value — exact,
  // and the `{ ...defaults, ...overrides }` shape people actually write.
  // Different types would produce a union shape that needs a struct this
  // compiler does not synthesize; name it rather than emit `()`.
  if (spreads.length > 1) {
    const keys = spreads.map((s) => r.typeKeyOf(s))
    const same = keys[0] !== null && keys.every((k) => k !== null && k === keys[0])
    if (!same) {
      return plan(
        `An object spread from MULTIPLE sources of different (or un-inferable) types (\`{ ...${spreads.map((s) => r.label(s)).join(', ...')} }\`) has no faithful native lowering — a struct for the merged shape would have to be synthesized. Emitted as the LAST source, so any field only an earlier source carried fails at its use site. Merge into one value of a single type first, or build the result field by field.`,
      )
    }
  }

  const known = r.fieldsOf(last)
  if (known === null) {
    // The source's shape is unknown, so an ADDED key cannot be detected. A
    // plain copy is exact regardless; anything else keeps the caller's
    // existing path rather than guessing.
    return fields.length === 0 ? plan() : null
  }

  const added = fields.filter((f) => !known.has(f.name)).map((f) => f.name)
  if (added.length > 0) {
    // Drop the added keys from the overrides: assigning one is `c.z = 5` on a
    // struct with no `z`, which does not compile at the ASSIGNMENT — a
    // failure that names generated code rather than the source shape.
    const kept = surviving.filter((f) => known.has(f.name))
    surviving.length = 0
    surviving.push(...kept)
    return plan(
      `An object spread that ADDS a key (\`{ ...${r.label(last)}, ${added.join(': …, ')}: … }\`) has no faithful native lowering — the result is a different shape from \`${r.label(last)}\`, and a struct for it would have to be synthesized. The added key is DROPPED, so reading it fails at its use site. Declare the field on the source type (it may be optional), or build the result as a full literal.`,
    )
  }

  return plan()
}

/**
 * Component-scope `const`s whose initializer is a spread-free object literal
 * → their field names. Used by both emitters' spread resolvers: the struct
 * for such a literal (`__ObjN`) is synthesized during EMIT, so the inference
 * ctx cannot name the binding's type.
 */
export function buildObjectConstFields(decls: readonly DeclIR[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const d of decls) {
    if (d.kind !== 'value') continue
    const init = d.expr
    if (init.kind !== 'object') continue
    if (init.spreads !== undefined && init.spreads.length > 0) continue
    out.set(d.name, new Set(init.fields.map((f) => f.name)))
  }
  return out
}

/**
 * The field NAMES of a spread source, from (in order) its inferred object
 * type, a declared struct it names, a component-scope object const, or a
 * body-local object literal. `null` when none of those resolve — which the
 * planner reads as "cannot tell", never as "has no fields".
 */
export function resolveSpreadFields(
  e: ExprIR,
  t: TypeIR,
  structs: readonly StructIR[],
  objectConsts: ReadonlyMap<string, Set<string>>,
  ctx: { objectLocals: Map<string, Extract<ExprIR, { kind: 'object' }>> },
): Set<string> | null {
  if (t.kind === 'object') return new Set(t.fields.map((f) => f.name))
  if (t.kind === 'typeRef') {
    const st = structs.find((s) => s.name === t.name)
    if (st !== undefined) return new Set(st.fields.map((f) => f.name))
  }
  if (e.kind === 'identifier') {
    const byConst = objectConsts.get(e.name)
    if (byConst !== undefined) return byConst
    const local = ctx.objectLocals.get(e.name)
    if (local !== undefined && (local.spreads === undefined || local.spreads.length === 0)) {
      return new Set(local.fields.map((f) => f.name))
    }
  }
  return null
}
