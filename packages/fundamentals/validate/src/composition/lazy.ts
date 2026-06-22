/**
 * `LazySchema<T>` — defers resolving the inner schema until first parse,
 * enabling recursive / self-referential schemas:
 *
 * ```ts
 * type Tree = { value: number; children: Tree[] }
 * const tree: Schema<Tree> = s.lazy(() =>
 *   s.object({ value: s.number(), children: s.array(tree) }),
 * )
 * ```
 *
 * The thunk is invoked once and cached. As with every recursive type in
 * TypeScript, the consumer annotates the schema's type explicitly (the
 * compiler can't infer a cyclic type).
 */

import type { ParseCtx } from '../core/ops'
import { Schema as SchemaBase } from '../core/schema'
import type { Schema } from '../core/schema'

export class LazySchema<T> extends SchemaBase<T> {
  readonly _kind = 'lazy' as const
  readonly fn: () => Schema<T>
  private _resolved?: Schema<T>

  constructor(fn: () => Schema<T>) {
    super()
    this.fn = fn
  }

  /** The resolved inner schema (memoised after first access). */
  get schema(): Schema<T> {
    if (!this._resolved) this._resolved = this.fn()
    return this._resolved
  }

  override _compileType(input: unknown, ctx: ParseCtx): unknown {
    return this.schema._runInto(input, ctx)
  }
}

export function lazy<T>(fn: () => Schema<T>): LazySchema<T> {
  return new LazySchema(fn)
}
