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
import type { RequestOptions, ResolvedRequest } from './module-scan'
import type { ExprIR, ExtDecl, ExtPayload, StatementIR, TypeIR } from './types'

/** The call a recognizer is asked about. */
export interface CallSite {
  /** The hook / function name (after binding resolution, so an alias already reads as the canonical name). */
  readonly callee: string
  /** How many arguments the author passed. */
  readonly argCount: number
  /** True for `new Name(…)` — a recognizer that claims a constructor checks it. */
  readonly construct?: boolean | undefined
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
  /** Report a limitation to the author, attributed to the declaration (the message is prefixed `Declaration <name>:`). */
  warn(message: string): void
  /** Report a limitation to the author exactly as written — for a recognizer whose messages already name the declaration. */
  report(message: string): void
  /**
   * The call's arguments exactly as written (ESTree nodes). A recognizer that
   * reads a literal config object walks these; {@link ParseContext.expr}
   * parses any sub-node the emitter should receive as an `ExprIR`.
   */
  readonly args: readonly AstNode[]
  /** The first generic type argument (`createFlow<Row>(…)`) parsed to a type; `{ kind: 'unknown' }` when none was written. */
  typeArg(): TypeIR
  /** Parse an AST node to the IR expression the emitters consume. */
  expr(node: AstNode): ExprIR
  /**
   * `node` with an identifier chain resolved through the file's static
   * initializers (`const nodes = [...]` → the array literal), else `node`.
   */
  resolveStatic(node: AstNode | undefined): AstNode | undefined
  /** `node` with parentheses and TypeScript-only layers (`as`, `satisfies`, `!`) removed. */
  unwrap(node: AstNode | undefined): AstNode | undefined
  /** An object property's static key (`a`, `'a'`, `` `a` ``), or `undefined` for a computed one. */
  propKey(prop: AstNode | undefined): string | undefined
  /** True for a computed key that is not a static string (`{ [kind]: … }`). */
  hasDynamicKey(prop: AstNode | undefined): boolean
  /** The source text of a dynamic key, bracketed, for a warning (`[kind]`). */
  dynamicKeyText(prop: AstNode): string
  /** The statically-known string an argument denotes — a literal, or a module-scope `const` holding one — else `null`. */
  staticString(node: AstNode | null | undefined): string | null
  /** The statements of a function body (`{ … }`) parsed to IR, for a recognizer that carries a callback. */
  statements(block: AstNode): StatementIR[]
  /** The first generic type argument of ANOTHER call node (`openEventStream<T>(…)`), `{ kind: 'unknown' }` when none was written. */
  typeArgOf(call: AstNode): TypeIR
  /** Plugin-owned memory for THIS file (see {@link ModuleScan.fileState}); namespace the key with the plugin name. */
  fileState<T>(key: string, init: () => T): T
  /** Requests plugins can resolve from a call of a binding they recorded (see `CompilerPlugin.requestSources`). */
  readonly requests: {
    has(name: string): boolean
    resolve(name: string, arg: AstNode | undefined, options: RequestOptions): ResolvedRequest | null
  }
  /**
   * Record that `type` is the decode type of a request whose `response` names a same-module schema,
   * so the schema's number fields can refine the type's `Int`/`Double` fields once the structs exist.
   */
  recordDecode(type: TypeIR, response: ResolvedRequest['response']): void
}

/** An ESTree node as the parser produced it. A plugin reads it structurally. */
export type AstNode = { readonly type: string; readonly [key: string]: unknown }

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

/**
 * Returns the declaration, `undefined` to DECLINE (the parser falls through to the rest of its chain, as if
 * the plugin were absent), or `null` to CLAIM the call without declaring anything: the recognizer reported why
 * the call cannot lower, and the binding must not fall through to a generic emit that would reference a symbol
 * neither target has.
 */
export type CallRecognizer = (call: CallSite, ctx: ParseContext) => ExtDeclSpec | undefined | null

/** Renders one declaration type on each target. */
/**
 * What a declaration contributes to its component's lifecycle. Both are
 * optional; a declaration with neither is pure state.
 */
export interface DeclLifecycle {
  /**
   * Swift attaches a mount-time modifier (`.task`) to its host view, and
   * SwiftUI ties that task to the host's IDENTITY. A body that is a transparent
   * conditional re-identifies on every state flip and the task restarts forever,
   * so a component carrying such a declaration wraps its body in a concrete
   * stable container. Set it when the declaration's emit appends a mount-time
   * modifier.
   */
  readonly stableHost?: boolean | undefined
  /**
   * Emit this declaration's lines AFTER the compiler's own lifecycle modifiers, ordered by this
   * number (then by declaration order) across every plugin. A declaration without it is emitted
   * in declaration order before them. It exists so a moved lifecycle keeps the position it had.
   */
  readonly tailOrder?: number | undefined
  /** Swift modifier lines (`.onDisappear { x.dispose() }`) appended after the component's view body. */
  swift?(decl: ExtDecl, ctx: EmitContext): readonly string[]
  /** Compose effect lines (`DisposableEffect(x) { … }`) appended to the component body, after mount effects. */
  kotlin?(decl: ExtDecl, ctx: EmitContext): readonly string[]
}

/**
 * What the compiler reads off a declaration's type to INFER an expression's type.
 * Without it a member read on a plugin's container is `unknown`, which the emitters
 * treat conservatively (no optional unwrapping, no numeric coercion).
 */
export interface DeclTyping {
  /** The type of the zero-argument CALL read `<binding>.<property>()` (the web's signal-read shape), or `undefined`. */
  callRead?(decl: ExtDecl, property: string): TypeIR | undefined
}

/** The conditions `<Suspense>` / `<ErrorBoundary>` OR over, as target text. */
export interface AsyncState {
  /** True while the declaration's request is pending (`q.isPending`). */
  readonly pending: string
  /** True when it failed (`q.error != nil`). */
  readonly error: string
}

export interface DeclEmitter {
  /** Lifecycle contributions of this declaration type. */
  readonly lifecycle?: DeclLifecycle | undefined
  /** How expressions over this declaration's container are typed. */
  readonly typing?: DeclTyping | undefined
  /**
   * Marks the declaration as an ASYNC SOURCE: a component's `<Suspense>` shows its fallback
   * while ANY source is pending, and `<ErrorBoundary>` while ANY has failed. Read in declaration
   * order, after the core's own sources.
   */
  readonly asyncState?: {
    swift(decl: ExtDecl, ctx: EmitContext): AsyncState
    kotlin(decl: ExtDecl, ctx: EmitContext): AsyncState
  } | undefined
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

export const isJson = (value: unknown, seen: Set<object>): boolean => {
  if (value === null) return true
  switch (typeof value) {
    // `undefined` survives `structuredClone` and is how the IR itself spells an absent slot (an
    // untyped lambda parameter's `paramTypes[i]`), so a payload embedding an `ExprIR` carries it.
    case 'undefined':
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
      `[Pyreon] Plugin "${owner}" declaration "${spec.type}" has a payload that is not JSON (functions, NaN, class instances and cycles are refused) — the compiler clones its IR between passes.`,
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
