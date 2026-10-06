/**
 * The scoped slot the moved Swift chart emitters read the compiler through.
 *
 * About two hundred functions emit one chart host. Threading an `EmitContext`
 * through each of them would change every signature for no gain, so the
 * plugin's `emit.swift(el, ctx)` installs `ctx` here for exactly the duration
 * of the call and every function reads it through {@link host}. The slot is
 * saved and restored in `finally` (the discipline `withRegistries` uses): a
 * nested element emitted through `ctx.emit` that re-enters this plugin installs
 * its own context and the outer one is back afterwards, and a throw never
 * leaves a stale one behind. It is synchronous only — every emit is — and it
 * holds nothing between calls, so two compilers in one process share no state.
 *
 * This is the ONLY door to the compiler from this directory: nothing here
 * imports an emitter or the parser (`tests/plugin-boundary.test.ts`).
 */

import type { HostStateSlot, StaticAttrValue, SwiftEmitContext } from '../../emit-context'
import type { RawChartTheme } from '../../chart-hosts'
import type { ExprIR, ExtDecl, JsxElementIR, TypeIR } from '../../types'

let active: SwiftEmitContext | undefined

function current(): SwiftEmitContext {
  if (active === undefined) {
    throw new Error(
      '[Pyreon] a @pyreon/charts Swift emitter ran outside `withSwiftContext` — the chart hosts read the compiler through the slot the plugin installs, so a call from anywhere else has nothing to read.',
    )
  }
  return active
}

/** Run `fn` with `ctx` installed as the context the chart emitters read; restore the previous one afterwards. */
export function withSwiftContext<T>(ctx: SwiftEmitContext, fn: () => T): T {
  const previous = active
  active = ctx
  try {
    return fn()
  } finally {
    active = previous
  }
}

/** The facade, read through the slot. One member per `SwiftEmitContext` capability the chart emitters use. */
export const host = Object.freeze({
  warn: (message: string): void => current().warn(message),
  expr: (e: ExprIR, at: number): string => current().expr(e, at),
  exprAs: (type: TypeIR | undefined, e: ExprIR, at: number): string => current().exprAs(type, e, at),
  staticAttr: (el: JsxElementIR, name: string): StaticAttrValue | undefined => current().staticAttr(el, name),
  stringAttr: (el: JsxElementIR, name: string, at: number): string | undefined => current().stringAttr(el, name, at),
  layoutModifiers: (el: JsxElementIR): string => current().layoutModifiers(el),
  action: (handler: ExprIR, at: number): string => current().action(handler, at),
  handlerName: (handler: ExprIR): string | undefined => current().handlerName(handler),
  constExpr: (name: string): ExprIR | undefined => current().constExpr(name),
  markColorSchemeUsed: (): void => current().markColorSchemeUsed(),
  decls: (plugin: string, type: string): readonly ExtDecl[] => current().decls(plugin, type),
  resolveDeferred: (key: string, value: string): void => current().resolveDeferred(key, value),
  /** The enclosing colour-mode scope as the chart theme it resolved to, or `undefined` outside any. */
  colorScope: (): RawChartTheme | undefined => current().colorScope<RawChartTheme>(),
  get hostState(): HostStateSlot {
    return current().hostState
  },
})
