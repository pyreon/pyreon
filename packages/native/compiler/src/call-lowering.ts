/**
 * Code-shaped plugin lowering — a plugin RECOGNIZES a call, produces its own
 * declaration, and EMITS it on both targets, without the compiler core knowing
 * the library.
 *
 * Services (`services.ts`) are DATA: a hook that takes no arguments and lowers
 * to one container. Element lowerings (`element-lowering.ts`) own JSX tags. This
 * is the third piece: `const x = someHook(…)` where the lowering needs CODE —
 * read an argument, decline a shape it cannot lower, render per-target text.
 *
 *   - {@link CallRecognizer} (`CompilerPlugin.calls`, keyed by hook name) runs
 *     where the parser's hand-written by-name recognizers sit and returns the
 *     plugin's declaration, or `undefined` to DECLINE — the parser then
 *     continues down the same chain it always did, exactly as when a built-in
 *     branch declines.
 *   - {@link DeclEmitter} (`CompilerPlugin.decls`, keyed by declaration `type`)
 *     renders that declaration through the {@link EmitContext} facade.
 *
 * The declaration is the open `ext` {@link ExtDecl}: the core never switches
 * on a third-party `type`, it dispatches by `(plugin, type)`.
 */

import type { EmitContext } from './emit-context'
import type { ExprIR, ExtDecl, ExtPayload } from './types'

/** The call a recognizer is asked about. */
export interface CallSite {
  /** The hook / function name (after binding resolution, so an alias already reads as the canonical name). */
  readonly callee: string
  /** How many arguments the author passed. */
  readonly argCount: number
}

/**
 * The parser facade a {@link CallRecognizer} reads through. A plugin must not
 * import the parser (the boundary test enforces it), so this is everything it
 * can ask — each member delegates to an existing parse helper.
 */
export interface ParseContext {
  /** The binding the author wrote: `chart` in `const chart = createChartHandle()`. */
  readonly declName: string
  /** Argument `index` when it is a string LITERAL, else `undefined` (a name, a template, a call, absent). */
  stringLiteralArg(index: number): string | undefined
  /** Report a limitation to the author, attributed to the declaration. */
  warn(message: string): void
}

/**
 * What a recognizer returns. The compiler stamps the owning `plugin` and the
 * binding `name` on it, so a plugin cannot mis-attribute a declaration or
 * claim another plugin's `type`.
 */
export interface ExtDeclSpec {
  /** A key of the owning plugin's `decls`. */
  readonly type: string
  /** JSON data for the emitter; defaults to `{}`. */
  readonly payload?: ExtPayload | undefined
}

/** Returns the declaration, or `undefined` to decline (the parser falls through). */
export type CallRecognizer = (call: CallSite, ctx: ParseContext) => ExtDeclSpec | undefined

/** Renders one declaration type on each target. */
export interface DeclEmitter {
  /** One declaration line (or lines, joined with a newline). */
  swift(decl: ExtDecl, ctx: EmitContext): string
  /** One line, or several (joined with the same newline-and-indent a built-in multi-line declaration uses). */
  kotlin(decl: ExtDecl, ctx: EmitContext): string | readonly string[]
  /**
   * Only the compiler's own built-ins need this: the `kind` the declaration was
   * called before it became an `ext` one. `moduleTag` (the hash that names
   * synthesized structs) hashes it as `{ kind: legacyKind, name, ...payload }`,
   * which keeps emitted names byte-identical to before the move. A new plugin
   * has no prior output to preserve and omits it.
   */
  readonly legacyKind?: string | undefined
}

/**
 * A call EXPRESSION a plugin claims: `<receiver>.<method>(…)` where `<receiver>`
 * is a binding declared by one of THIS plugin's `ext` declarations
 * (`chart.dispatch({ … })` for `const chart = createChartHandle()`).
 */
export interface MemberCallSite {
  /** The declaration the receiver names — always one of the claiming plugin's own. */
  readonly receiver: ExtDecl
  /** The method name (the key it was registered under). */
  readonly method: string
  readonly args: readonly ExprIR[]
}

/**
 * How a plugin lowers its receiver's member calls. Each target returns the
 * expression text, or `undefined` to DECLINE (the call then continues down the
 * generic path exactly as if the plugin were absent).
 */
export interface MemberCallLowering {
  swift(call: MemberCallSite, ctx: EmitContext): string | undefined
  kotlin(call: MemberCallSite, ctx: EmitContext): string | undefined
}

export interface RegisteredCall {
  readonly recognizer: CallRecognizer
  /** The plugin that claimed the hook name. */
  readonly owner: string
  /** Import specifiers the owner serves (`CompilerPlugin.modules`), when it declared any. */
  readonly modules?: readonly string[] | undefined
}

/** One compiler instance's call recognizers and declaration emitters. */
export interface CallRegistry {
  /** Hook name → recognizer + owner. */
  readonly calls: ReadonlyMap<string, RegisteredCall>
  /** Every claimed hook name. */
  readonly names: ReadonlySet<string>
  /** Plugin name → declaration type → emitter. */
  readonly emitters: ReadonlyMap<string, ReadonlyMap<string, DeclEmitter>>
  /** The emitter for `(plugin, type)`, or `undefined`. */
  emitter(plugin: string, type: string): DeclEmitter | undefined
  /** Method name → owning plugin → member-call lowering. Looked up by method name first, so a call with no claimant costs one `Map.get`. */
  readonly memberCalls: ReadonlyMap<string, ReadonlyMap<string, MemberCallLowering>>
}

type CallPlugin = {
  readonly name: string
  readonly modules?: readonly string[] | undefined
  readonly calls?: Readonly<Record<string, CallRecognizer>> | undefined
  readonly decls?: Readonly<Record<string, DeclEmitter>> | undefined
  readonly memberCalls?: Readonly<Record<string, MemberCallLowering>> | undefined
}

/**
 * Build the registry from every plugin's `calls` and `decls`, in plugin order.
 * Throws when a hook name is claimed by two plugins (the winner would depend on
 * plugin order, which the app cannot see) and names both owners. A `(plugin,
 * type)` pair cannot collide: the plugin NAME is the namespace, and a duplicate
 * plugin name is already a load-time error.
 *
 * @example
 * createCallRegistry([{ name: '@acme/toy', calls: { createToy: () => ({ type: 'toy' }) }, decls: { toy } }])
 */
export function createCallRegistry(plugins: readonly CallPlugin[]): CallRegistry {
  const calls = new Map<string, RegisteredCall>()
  const emitters = new Map<string, ReadonlyMap<string, DeclEmitter>>()
  const memberCalls = new Map<string, Map<string, MemberCallLowering>>()
  for (const plugin of plugins) {
    // A method name may be claimed by several plugins: the RECEIVER decides, because a plugin only ever sees
    // calls on a binding one of its own declarations created. Two plugins cannot collide on `(method, receiver)`.
    for (const [method, lowering] of Object.entries(plugin.memberCalls ?? {})) {
      const owners = memberCalls.get(method) ?? new Map<string, MemberCallLowering>()
      owners.set(plugin.name, lowering)
      memberCalls.set(method, owners)
    }
    for (const [hook, recognizer] of Object.entries(plugin.calls ?? {})) {
      const existing = calls.get(hook)
      if (existing !== undefined) {
        throw new Error(
          `[Pyreon] call "${hook}" is claimed by both "${existing.owner}" and "${plugin.name}". ` +
            `A call has exactly one recognizer — remove one of the two plugins from this app.`,
        )
      }
      calls.set(hook, {
        recognizer,
        owner: plugin.name,
        ...(plugin.modules !== undefined ? { modules: plugin.modules } : {}),
      })
    }
    if (plugin.decls !== undefined) {
      emitters.set(plugin.name, new Map(Object.entries(plugin.decls)))
    }
  }
  return Object.freeze<CallRegistry>({
    calls,
    names: new Set(calls.keys()),
    emitters,
    emitter: (plugin, type) => emitters.get(plugin)?.get(type),
    memberCalls,
  })
}

const isJson = (value: unknown, seen: Set<object>): boolean => {
  if (value === null) return true
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return true
    case 'number':
      return Number.isFinite(value)
    case 'object': {
      if (seen.has(value)) return false
      seen.add(value)
      const ok = Array.isArray(value)
        ? value.every((entry) => isJson(entry, seen))
        : Object.getPrototypeOf(value) === Object.prototype &&
          Object.values(value).every((entry) => isJson(entry, seen))
      seen.delete(value)
      return ok
    }
    default:
      return false
  }
}

/**
 * Turn a recognizer's result into the stamped declaration. Fails loudly (naming
 * the plugin) when the `type` has no emitter or the payload is not JSON — both
 * would otherwise surface far away, as a missing declaration or as a
 * `structuredClone` error in a later pass.
 */
export function stampExtDecl(
  registry: CallRegistry,
  owner: string,
  name: string,
  spec: ExtDeclSpec,
): ExtDecl {
  if (registry.emitter(owner, spec.type) === undefined) {
    throw new Error(
      `[Pyreon] Plugin "${owner}" recognized a declaration of type "${spec.type}" but declares no \`decls.${spec.type}\` emitter.`,
    )
  }
  const payload = spec.payload ?? {}
  if (!isJson(payload, new Set())) {
    throw new Error(
      `[Pyreon] Plugin "${owner}" declaration "${spec.type}" has a payload that is not JSON (functions, undefined, NaN, class instances and cycles are refused) — the compiler clones its IR between passes.`,
    )
  }
  return { kind: 'ext', plugin: owner, type: spec.type, name, payload }
}

/** Render an `ext` declaration on `target`, through its owner's emitter. */
export function emitExtDecl(
  registry: CallRegistry,
  decl: ExtDecl,
  target: 'swift' | 'kotlin',
  ctx: EmitContext,
): string {
  const emitter = registry.emitter(decl.plugin, decl.type)
  if (emitter === undefined) {
    throw new Error(
      `[Pyreon] declaration "${decl.type}" of plugin "${decl.plugin}" has no emitter in this compiler — the plugin that recognized it is not loaded here.`,
    )
  }
  if (target === 'swift') return emitter.swift(decl, ctx)
  const out = emitter.kotlin(decl, ctx)
  return typeof out === 'string' ? out : out.join('\n  ')
}

/**
 * Lower `call` through the plugin that owns its receiver, or return `undefined`
 * (the common case: not a member call, no plugin claims the method name, the
 * receiver is not a plugin declaration, or the plugin declined).
 */
export function lowerMemberCall(
  registry: CallRegistry,
  call: Extract<ExprIR, { kind: 'call' }>,
  target: 'swift' | 'kotlin',
  receiverOf: (name: string) => ExtDecl | undefined,
  ctx: () => EmitContext,
): string | undefined {
  const callee = call.callee
  if (callee.kind !== 'member' || callee.object.kind !== 'identifier') return undefined
  const owners = registry.memberCalls.get(callee.property)
  if (owners === undefined) return undefined
  const receiver = receiverOf(callee.object.name)
  if (receiver === undefined) return undefined
  const lowering = owners.get(receiver.plugin)
  if (lowering === undefined) return undefined
  const site: MemberCallSite = { receiver, method: callee.property, args: call.args }
  return lowering[target](site, ctx())
}
