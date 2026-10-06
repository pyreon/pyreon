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
import type { ExtDecl, ExtPayload } from './types'

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
}

type CallPlugin = {
  readonly name: string
  readonly modules?: readonly string[] | undefined
  readonly calls?: Readonly<Record<string, CallRecognizer>> | undefined
  readonly decls?: Readonly<Record<string, DeclEmitter>> | undefined
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
  for (const plugin of plugins) {
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
