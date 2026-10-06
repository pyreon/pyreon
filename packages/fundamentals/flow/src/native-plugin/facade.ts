/**
 * The scoped slot the moved `@pyreon/flow` emitters read the compiler through —
 * the part both targets share.
 *
 * Hundreds of lines of flow lowering emit per target. Threading an
 * `EmitContext` through each function would change every signature for no gain,
 * so the plugin's entry points (`emit.swift`, `receivers.swift.expr`,
 * `decls.swift`, …) install `ctx` in a slot for exactly the duration of the call
 * and every function reads it through a `host` object. The slot is saved and
 * restored in `finally` (the discipline `withRegistries` uses): a nested element
 * emitted through `ctx.emit` that re-enters this plugin installs its own context
 * and the outer one is back afterwards, and a throw never leaves a stale one
 * behind. It is synchronous only — every emit is — and holds nothing between
 * calls, so two compilers in one process share no state. Each target gets its OWN
 * slot, so a Swift emitter can never read a Kotlin context.
 *
 * `swift-facade.ts` and `kotlin-facade.ts` are the ONLY doors to the compiler
 * from this directory: nothing here imports an emitter or the parser
 * (`tests/plugin-boundary.test.ts`).
 */

import type {
  ChildIR,
  ComponentInfo,
  EmitContext,
  ExprIR,
  ExtDecl,
  JsxElementIR,
  StaticAttrValue,
  StructRegistry,
  TypeIR,
  WebViewFacade,
} from '@pyreon/native-compiler/plugin-api'

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
          `[Pyreon] a @pyreon/flow ${target} emitter ran outside \`${entry}\` — the flow lowering reads the compiler through the slot the plugin installs, so a call from anywhere else has nothing to read.`,
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

/** The facade members both targets' flow emitters use, read through `current`. One member per shared `EmitContext` capability. */
export function sharedHost(current: () => EmitContext) {
  return {
    warn: (message: string): void => current().warn(message),
    warnOnce: (message: string): void => current().warnOnce(message),
    expr: (e: ExprIR, at: number): string => current().expr(e, at),
    exprAs: (type: TypeIR | undefined, e: ExprIR, at: number): string => current().exprAs(type, e, at),
    staticAttr: (el: JsxElementIR, name: string): StaticAttrValue | undefined => current().staticAttr(el, name),
    child: (child: ChildIR, at: number): string => current().child(child, at),
    layoutModifiers: (el: JsxElementIR): string => current().layoutModifiers(el),
    layoutModifiersFor: (el: JsxElementIR, handled: ReadonlySet<string>): string => current().layoutModifiersFor(el, handled),
    constExpr: (name: string): ExprIR | undefined => current().constExpr(name),
    isFunctionName: (name: string): boolean => current().isFunctionName(name),
    component: (): ComponentInfo => current().component(),
    typeText: (type: TypeIR): string => current().typeText(type),
    inferType: (e: ExprIR): TypeIR => current().inferType(e),
    decls: (plugin: string, type: string): readonly ExtDecl[] => current().decls(plugin, type),
    fileState: <T>(key: string, init: () => T): T => current().fileState(key, init),
    structs: {
      forTypeFields: (fields) => current().structs.forTypeFields(fields),
      forLiteralFields: (fields) => current().structs.forLiteralFields(fields),
      synthesize: (fields) => current().structs.synthesize(fields),
    } satisfies StructRegistry,
    webView: {
      dynamicAttr: (el, name) => current().webView.dynamicAttr(el, name),
      dataArg: (value) => current().webView.dataArg(value),
      messageHandler: (handler) => current().webView.messageHandler(handler),
    } satisfies WebViewFacade,
  }
}
