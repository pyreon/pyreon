/**
 * The scoped slot the moved `@pyreon/charts` emitters read the compiler through
 * — the part both targets share.
 *
 * About two hundred functions emit one chart host per target. Threading an
 * `EmitContext` through each of them would change every signature for no gain,
 * so the plugin's `emit.swift` / `emit.kotlin` installs `ctx` in a slot for
 * exactly the duration of the call and every function reads it through a
 * `host` object. The slot is saved and restored in `finally` (the discipline
 * `withRegistries` uses): a nested element emitted through `ctx.emit` that
 * re-enters this plugin installs its own context and the outer one is back
 * afterwards, and a throw never leaves a stale one behind. It is synchronous
 * only — every emit is — and holds nothing between calls, so two compilers in
 * one process share no state. Each target gets its OWN slot
 * (`createContextSlot` per target), so a Swift emitter can never read a Kotlin
 * context.
 *
 * `swift-facade.ts` and `kotlin-facade.ts` are the ONLY doors to the compiler
 * from this directory: nothing here imports an emitter or the parser
 * (`tests/plugin-boundary.test.ts`).
 */

import type { RawChartTheme } from './hosts'
import type { EmitContext, ExprIR, ExtDecl, JsxElementIR, StaticAttrValue, TypeIR } from '@pyreon/native-compiler/plugin-api'

export interface ContextSlot<C extends EmitContext> {
  /** The installed context; throws outside {@link ContextSlot.run}. */
  current(): C
  /** Run `fn` with `ctx` installed; restore the previous one afterwards, throw or not. */
  run<T>(ctx: C, fn: () => T): T
}

/** One target's slot. `entry` names the function the plugin calls (it appears in the error a stray call gets). */
export function createContextSlot<C extends EmitContext>(target: string, entry: string): ContextSlot<C> {
  let active: C | undefined
  return {
    current() {
      if (active === undefined) {
        throw new Error(
          `[Pyreon] a @pyreon/charts ${target} emitter ran outside \`${entry}\` — the chart hosts read the compiler through the slot the plugin installs, so a call from anywhere else has nothing to read.`,
        )
      }
      return active
    },
    run(ctx, fn) {
      const previous = active
      active = ctx
      try {
        return fn()
      } finally {
        active = previous
      }
    },
  }
}

/** The facade members both targets' chart emitters use, read through `current`. One member per shared `EmitContext` capability. */
export function sharedHost(current: () => EmitContext) {
  return {
    warn: (message: string): void => current().warn(message),
    expr: (e: ExprIR, at: number): string => current().expr(e, at),
    exprAs: (type: TypeIR | undefined, e: ExprIR, at: number): string => current().exprAs(type, e, at),
    staticAttr: (el: JsxElementIR, name: string): StaticAttrValue | undefined => current().staticAttr(el, name),
    stringAttr: (el: JsxElementIR, name: string, at: number): string | undefined => current().stringAttr(el, name, at),
    layoutModifiers: (el: JsxElementIR): string => current().layoutModifiers(el),
    action: (handler: ExprIR, at: number): string => current().action(handler, at),
    constExpr: (name: string): ExprIR | undefined => current().constExpr(name),
    decls: (plugin: string, type: string): readonly ExtDecl[] => current().decls(plugin, type),
    resolveDeferred: (key: string, value: string): void => current().resolveDeferred(key, value),
    /** The enclosing colour-mode scope as the chart theme it resolved to, or `undefined` outside any. */
    colorScope: (): RawChartTheme | undefined => current().colorScope<RawChartTheme>(),
  }
}
