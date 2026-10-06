/**
 * Expression and element hooks a plugin uses when its lowering is CODE that the
 * core must reach from the middle of an emitter — not at a declaration or a
 * claimed JSX tag, but at a call, a member read, an assignment, an intrinsic
 * tag or a whole file.
 *
 * Small hooks, each cheap when nobody claims the expression:
 *
 *   - {@link ReceiverLowering} (`CompilerPlugin.receivers`, keyed by declaration
 *     `type`): any call, member read or assignment whose CHAIN is rooted at a
 *     binding one of the plugin's `ext` declarations created
 *     (`flow.fitView()`, `flow.nodes.set(x)`, `flow.nodeMap().get(id)`,
 *     `flow.config.zoom = 2`). It generalises `memberCalls`, which sees only the
 *     one-hop `<receiver>.<method>(…)` shape.
 *   - {@link FunctionLowering} (`CompilerPlugin.functions`, keyed by name): a
 *     plain call `name(args)` the plugin lowers (`getBezierPath({...})`). The
 *     name is claimed like a hook — from `@pyreon/*` or the plugin's `modules` —
 *     and an aliased import is renamed back to it.
 *   - {@link MemberReadLowering} (`CompilerPlugin.memberReads`): a member READ the
 *     plugin recognises by shape rather than by root binding — `MarkerType.Arrow`
 *     on a library enum-like value, or `props.edge.data.x` on a props type the
 *     plugin resolved. Called for every member read once any plugin registers
 *     one, so keep the first check cheap.
 *   - {@link IdentifierLowering} (`CompilerPlugin.identifiers`, keyed by name): a bare
 *     identifier that names a library constant.
 *   - {@link IntrinsicLowering} (`CompilerPlugin.intrinsics`): a lowercase DOM
 *     tag (`path`, `svg`, `div`) that means something only inside the plugin's
 *     own context (a custom Flow node renderer). It is claimed by a predicate,
 *     not by an import, because the tag has no package.
 *   - {@link EmitPreparation} (`CompilerPlugin.prepareEmit`): a per-file pass the
 *     emitter runs after the file's components and module constants are known
 *     and before any component is emitted; it may add components of its own.
 *
 * Each hook may DECLINE (return `undefined`): the emitter then continues exactly
 * as if the plugin were absent.
 */

import type { EmitContext, KotlinEmitContext, SwiftEmitContext } from './emit-context'
import type { ComponentIR, ExprIR, ExtDecl, JsxElementIR } from './types'

export type CallExprIR = Extract<ExprIR, { kind: 'call' }>
export type MemberExprIR = Extract<ExprIR, { kind: 'member' }>

/** A call or a member read whose chain is rooted at a binding one of the plugin's declarations created. */
export type ReceiverSite =
  | { readonly kind: 'call'; readonly expr: CallExprIR; readonly receiver: ExtDecl }
  | { readonly kind: 'member'; readonly expr: MemberExprIR; readonly receiver: ExtDecl }

/** `<receiver>.<path> <op> <value>` where the path is rooted at a plugin declaration. */
export interface ReceiverAssignSite {
  readonly target: MemberExprIR
  readonly op: string
  readonly value: ExprIR
  /** The value operand as the emitter already spelled it (emitting it twice would repeat its warnings). */
  readonly emitted: string
  readonly receiver: ExtDecl
}

export interface ReceiverTargetLowering<C extends EmitContext> {
  /** The expression text for a call / member read, or `undefined` to decline. */
  expr?(site: ReceiverSite, ctx: C): string | undefined
  /** The VALUE operand's replacement text, or `undefined` to keep the one the emitter produced. */
  assignValue?(site: ReceiverAssignSite, ctx: C): string | undefined
}

export interface ReceiverLowering {
  readonly swift?: ReceiverTargetLowering<SwiftEmitContext>
  readonly kotlin?: ReceiverTargetLowering<KotlinEmitContext>
}

/** A plain `name(args)` call. */
export interface FunctionSite {
  readonly name: string
  readonly args: readonly ExprIR[]
}

export interface FunctionLowering {
  /**
   * The callee spelling the parser leaves in the IR for a claimed call, when it
   * must differ from the author's name. The IR is hashed into the names of the
   * structs a file synthesises, so a library that shipped before functions were
   * plugin-owned keeps its spelling (`__pyreonFlowComputeLayout`) to keep emitted
   * names stable. A plugin with no prior output omits it.
   */
  readonly irName?: string | undefined
  swift?(site: FunctionSite, ctx: SwiftEmitContext): string | undefined
  kotlin?(site: FunctionSite, ctx: KotlinEmitContext): string | undefined
}

/**
 * A bare identifier that names a library constant (`DEFAULT_NODE_WIDTH`). Each
 * target returns the expression text, or `undefined` to decline (the identifier
 * then emits as written).
 */
export interface IdentifierLowering {
  swift?(name: string, ctx: SwiftEmitContext): string | undefined
  kotlin?(name: string, ctx: KotlinEmitContext): string | undefined
}

/**
 * A member read the plugin recognises by SHAPE. Each target returns the
 * expression text, or `undefined` to decline (the read then emits as without the
 * plugin).
 */
export interface MemberReadLowering {
  swift?(e: MemberExprIR, ctx: SwiftEmitContext): string | undefined
  kotlin?(e: MemberExprIR, ctx: KotlinEmitContext): string | undefined
}

/**
 * A lowercase tag the plugin claims while `applies` holds. `applies` reads the
 * facade (typically `ctx.component()`), so the claim is as narrow as the
 * plugin's own context: outside it the tag keeps the core's behaviour.
 */
export interface IntrinsicLowering {
  readonly tags: readonly string[]
  applies(ctx: EmitContext): boolean
  readonly emit: {
    swift?(el: JsxElementIR, ctx: SwiftEmitContext): string | undefined
    kotlin?(el: JsxElementIR, ctx: KotlinEmitContext): string | undefined
  }
}

/** What the emitter knows when a file's emit starts. */
export interface EmitPreparationInput {
  readonly components: readonly ComponentIR[]
  /** The initializer of the module-level `const` named `name`, or `undefined`. */
  moduleConst(name: string): ExprIR | undefined
}

/** What a preparation may contribute: components emitted after the file's own, registered like them. */
export interface EmitPreparationResult {
  readonly components?: readonly ComponentIR[] | undefined
}

export type EmitPreparation = (input: EmitPreparationInput, ctx: EmitContext) => EmitPreparationResult | void

type ExprPlugin = {
  readonly name: string
  readonly modules?: readonly string[] | undefined
  readonly receivers?: Readonly<Record<string, ReceiverLowering>> | undefined
  readonly functions?: Readonly<Record<string, FunctionLowering>> | undefined
  readonly memberReads?: MemberReadLowering | undefined
  readonly identifiers?: Readonly<Record<string, IdentifierLowering>> | undefined
  readonly intrinsics?: readonly IntrinsicLowering[] | undefined
  readonly prepareEmit?: EmitPreparation | undefined
  readonly intrinsicAdvice?: string | undefined
}

export interface RegisteredFunction {
  readonly lowering: FunctionLowering
  readonly owner: string
  readonly modules?: readonly string[] | undefined
}

/** One compiler instance's expression hooks. */
export interface ExprRegistry {
  /** Plugin name → declaration type → receiver lowering. */
  readonly receivers: ReadonlyMap<string, ReadonlyMap<string, ReceiverLowering>>
  readonly functions: ReadonlyMap<string, RegisteredFunction>
  /** IR callee spelling (`FunctionLowering.irName`) → the claimed function name. */
  readonly functionsByIrName: ReadonlyMap<string, string>
  readonly memberReads: readonly { readonly lowering: MemberReadLowering; readonly owner: string }[]
  readonly identifiers: ReadonlyMap<string, { readonly lowering: IdentifierLowering; readonly owner: string }>
  readonly intrinsics: readonly { readonly lowering: IntrinsicLowering; readonly owner: string }[]
  /** Every tag some intrinsic lowering names (the parser then records nothing; the emitters short-circuit on it). */
  readonly intrinsicTags: ReadonlySet<string>
  readonly preparations: readonly { readonly owner: string; readonly prepare: EmitPreparation }[]
  /** Sentences plugins append to the "DOM/SVG element has no native lowering" warning, in plugin order. */
  readonly intrinsicAdvice: readonly string[]
}

const conflict = (what: string, a: string, b: string): Error =>
  new Error(
    `[Pyreon] ${what} is claimed by both "${a}" and "${b}". It has exactly one lowering — remove one of the two plugins from this app.`,
  )

/**
 * Build the registry from every plugin's expression hooks, in plugin order.
 * Throws when a function or identifier name is claimed twice, naming both owners.
 *
 * @example
 * createExprRegistry([{ name: '@acme/geo', functions: { distance: { swift: () => 'geoDistance()' } } }])
 */
export function createExprRegistry(plugins: readonly ExprPlugin[]): ExprRegistry {
  const receivers = new Map<string, ReadonlyMap<string, ReceiverLowering>>()
  const functions = new Map<string, RegisteredFunction>()
  const functionsByIrName = new Map<string, string>()
  const memberReads: { lowering: MemberReadLowering; owner: string }[] = []
  const identifiers = new Map<string, { lowering: IdentifierLowering; owner: string }>()
  const intrinsics: { lowering: IntrinsicLowering; owner: string }[] = []
  const intrinsicTags = new Set<string>()
  const preparations: { owner: string; prepare: EmitPreparation }[] = []
  const intrinsicAdvice: string[] = []
  for (const plugin of plugins) {
    if (plugin.receivers !== undefined) receivers.set(plugin.name, new Map(Object.entries(plugin.receivers)))
    for (const [name, lowering] of Object.entries(plugin.functions ?? {})) {
      const existing = functions.get(name)
      if (existing !== undefined) throw conflict(`function "${name}"`, existing.owner, plugin.name)
      functions.set(name, {
        lowering,
        owner: plugin.name,
        ...(plugin.modules !== undefined ? { modules: plugin.modules } : {}),
      })
      if (lowering.irName !== undefined) functionsByIrName.set(lowering.irName, name)
    }
    if (plugin.memberReads !== undefined) memberReads.push({ lowering: plugin.memberReads, owner: plugin.name })
    for (const [name, lowering] of Object.entries(plugin.identifiers ?? {})) {
      const existing = identifiers.get(name)
      if (existing !== undefined) throw conflict(`identifier "${name}"`, existing.owner, plugin.name)
      identifiers.set(name, { lowering, owner: plugin.name })
    }
    for (const lowering of plugin.intrinsics ?? []) {
      intrinsics.push({ lowering, owner: plugin.name })
      for (const tag of lowering.tags) intrinsicTags.add(tag)
    }
    if (plugin.prepareEmit !== undefined) preparations.push({ owner: plugin.name, prepare: plugin.prepareEmit })
    if (plugin.intrinsicAdvice !== undefined) intrinsicAdvice.push(plugin.intrinsicAdvice)
  }
  return Object.freeze<ExprRegistry>({
    receivers,
    functions,
    functionsByIrName,
    memberReads,
    identifiers,
    intrinsics,
    intrinsicTags,
    preparations,
    intrinsicAdvice,
  })
}

/** The root identifier of a call / member chain (`flow` in `flow.nodeMap().get(id)`), or `undefined`. */
export function rootReceiverName(expr: ExprIR): string | undefined {
  let current: ExprIR = expr
  for (let hops = 0; hops < 6; hops++) {
    if (current.kind === 'identifier') return current.name
    if (current.kind === 'call') current = current.callee
    else if (current.kind === 'member') current = current.object
    else return undefined
  }
  return undefined
}
