/**
 * `IntersectionSchema<A & B>` — the input must satisfy BOTH schemas. For
 * the common object-and-object case the two validated outputs are merged
 * (shallow); otherwise the right-hand output wins. Issues from either side
 * surface (both must pass).
 */

import type { ParseCtx } from '../core/ops'
import { Schema as SchemaBase, registerIntersectionFactory } from '../core/schema'
import type { Schema } from '../core/schema'

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export class IntersectionSchema<A, B> extends SchemaBase<A & B> {
  readonly _kind = 'intersection' as const
  readonly left: Schema<A>
  readonly right: Schema<B>

  constructor(left: Schema<A>, right: Schema<B>) {
    super()
    this.left = left
    this.right = right
  }

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    const before = ctx.issues.length
    const a = this.left._runInto(input, ctx)
    const b = this.right._runInto(input, ctx)
    if (a instanceof Promise || b instanceof Promise) {
      // An async side (async `.refine`/`.transform`/registered `.serverCheck`)
      // — defer the merge until both settle. `parseAsync` awaits this; a sync
      // `parse()` sees the Promise at the root and reports async-in-sync.
      return Promise.all([a, b]).then(([av, bv]) => {
        if (ctx.issues.length !== before) return input
        if (isPlainObject(av) && isPlainObject(bv)) return { ...av, ...bv }
        return bv
      })
    }
    if (ctx.issues.length !== before) return input
    // Both passed — merge object outputs, else prefer the right side.
    if (isPlainObject(a) && isPlainObject(b)) return { ...a, ...b }
    return b
  }
}

// Self-registers the `.and()` factory from this initializer (tree-shake-safe).
export const intersection = registerIntersectionFactory(
  <A, B>(left: Schema<A>, right: Schema<B>): IntersectionSchema<A, B> => new IntersectionSchema(left, right),
)
