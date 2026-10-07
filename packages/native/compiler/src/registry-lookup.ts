/**
 * Service + element lookups against the ACTIVE registries.
 *
 * The parser and both emitters keep their module-level state (that is a
 * separate, much larger rewrite), so they cannot be handed a registry per call.
 * They read it through these functions instead; `createCompiler().transform`
 * installs its own registries around parse + emit (see `active-registries.ts`).
 * Nothing here is cached at module level — the derived tables live on the
 * registry itself.
 */

import { activeRegistries } from './active-registries'
import type { ElementClaimGuard, ElementLowering } from './element-lowering'
import type { ScopeProvider } from './scope-provider'
import type { SignalPersistence } from './signal-persistence'
import type { ServiceDescriptor } from './services'
import { emitExtDecl, lowerMemberCall, type AsyncState, type DeclLifecycle, type DeclSwiftInit } from './call-lowering'
import {
  rootReceiverName,
  type EmitPreparation,
  type FunctionLowering,
  type IdentifierLowering,
  type IntrinsicLowering,
  type MemberReadLowering,
  type ReceiverLowering,
} from './expr-lowering'
import type { PluginScope } from './plugin-scope'
import type { UnloweredModule } from './unlowered-modules'
import type { EmitContext, KotlinEmitContext, SwiftEmitContext } from './emit-context'
import { emitExtExpr, emitModuleItem, findFieldValidators, fieldValidatorsAdvice, type ExtExprIR } from './module-items'
import type { DeclIR, ExprIR, ExtDecl, ExtModuleItem, TypeIR } from './types'

/** The descriptor registered for `hook`, or `undefined`. */
export function findService(hook: string): ServiceDescriptor | undefined {
  return activeRegistries().serviceTables.byHook.get(hook)
}

/** Every registered service descriptor, in registry order. */
export function allServices(): readonly ServiceDescriptor[] {
  return activeRegistries().serviceTables.descriptors
}

/**
 * Does `source` serve `hook` for the plugin that owns it — as a service or as a
 * recognized call? True when the owner declared `modules` and `source` is one of them or a sub-path of one. Built-in
 * hooks declare none, so they stay `@pyreon/*`-only.
 */
export function hookClaimsSource(hook: string, source: string): boolean {
  const registries = activeRegistries()
  const modules =
    registries.services.get(hook)?.modules ??
    registries.calls.calls.get(hook)?.modules ??
    registries.exprs.functions.get(hook)?.modules
  return modules?.some((m) => source === m || source.startsWith(`${m}/`)) ?? false
}

/** The lowering that claims `tag` (see {@link ElementClaimGuard}), or `undefined`. */
export function findElementLowering(
  tag: string,
  guard: ElementClaimGuard,
  importedAs?: string,
): ElementLowering | undefined {
  return activeRegistries().elements.find(tag, guard, importedAs)
}

/** True when some registered lowering or colour-scope provider claims `name` (the parser then records where it was imported from). */
export function isElementLoweringTag(name: string): boolean {
  const registries = activeRegistries()
  return registries.elements.hasTag(name) || registries.scopes.hasTag(name)
}

/** The colour-scope provider that claims `tag` (see {@link ElementClaimGuard}), or `undefined`. */
export function findScopeProvider(tag: string, guard: ElementClaimGuard): ScopeProvider | undefined {
  return activeRegistries().scopes.find(tag, guard)
}

/** True when `name` is a tag a registered lowering marks usable as a style base. */
export function isStyleBasePrimitive(name: string): boolean {
  return activeRegistries().elements.isStyleBase(name)
}

/** Render a plugin-owned (`ext`) declaration through its owner's emitter, against the active registries. */
export function emitPluginDecl(d: ExtDecl, target: 'swift' | 'kotlin', ctx: EmitContext): string {
  return emitExtDecl(activeRegistries().calls, d, target, ctx)
}

/**
 * Lower `call` through the plugin that owns its receiver (`chart.dispatch(…)`),
 * against the active registries; `undefined` when no plugin claims it. The
 * lookup is keyed by method name first, so an ordinary call costs one `Map.get`.
 */
export function lowerPluginMemberCall(
  call: Extract<ExprIR, { kind: 'call' }>,
  target: 'swift' | 'kotlin',
  scope: PluginScope,
  ctx: () => EmitContext,
): string | undefined {
  return lowerMemberCall(activeRegistries().calls, call, target, scope.declByName, ctx)
}

/**
 * The unlowered-module entry for `module`: the active plugins' metadata first,
 * then the compiler's own hand-maintained map (`core`) for modules no plugin owns.
 */
export function findUnloweredModule(
  module: string,
  core: ReadonlyMap<string, UnloweredModule>,
): UnloweredModule | undefined {
  return activeRegistries().unlowered.get(module) ?? core.get(module)
}

/** The descriptor for a `service` declaration; the parser only emits known hooks. */
export function serviceFor(hook: string): ServiceDescriptor {
  const s = activeRegistries().serviceTables.byHook.get(hook)
  if (s === undefined) {
    throw new Error(
      `[Pyreon] native service \`${hook}\` has no descriptor in the active compiler's service registry — a \`service\` declaration must name a hook a loaded plugin registered.`,
    )
  }
  return s
}

/** The lifecycle a `service` declaration needs started, if any. */
export function serviceLifecycle(d: DeclIR): 'start' | 'start-stop' | undefined {
  return d.kind === 'service' ? serviceFor(d.hook).lifecycle : undefined
}

/**
 * Binding name → descriptor for every `service` declaration of ONE component.
 * The emitters consult it at the read sites (accessor reads, `callRead`,
 * Kotlin `.value`). Built per component and reset with the rest of the
 * per-component state — never file-scoped, so a name bound to a service in one
 * component cannot rewrite a same-named value in the next.
 */
export function bindServices(decls: readonly DeclIR[]): Map<string, ServiceDescriptor> {
  const out = new Map<string, ServiceDescriptor>()
  for (const d of decls) if (d.kind === 'service') out.set(d.name, serviceFor(d.hook))
  return out
}

/**
 * `JSON.stringify` replacer for `moduleTag`: a `service` declaration hashes as
 * the pre-descriptor `{ kind, name }` it replaced (see `legacyKind`).
 */
export function hashServiceDeclsAsLegacy(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === 'object') {
    const v = value as {
      kind?: unknown
      hook?: unknown
      name?: unknown
      plugin?: unknown
      type?: unknown
      payload?: unknown
    }
    if (v.kind === 'service' && typeof v.hook === 'string') {
      return { kind: serviceFor(v.hook).legacyKind, name: v.name }
    }
    // A plugin expression that used to be a closed `ExprIR` kind hashes as that kind did.
    if (v.kind === 'ext-expr' && typeof v.plugin === 'string' && typeof v.type === 'string') {
      const legacy = activeRegistries().items.exprEmitter(v.plugin, v.type)?.legacyHash
      if (legacy !== undefined) return legacy(value as ExtExprIR)
    }
    // A built-in plugin declaration that used to be a closed `kind` hashes as it
    // did then, so the struct names `moduleTag` derives do not move with the refactor.
    if (v.kind === 'ext' && typeof v.plugin === 'string' && typeof v.type === 'string') {
      const legacyKind = activeRegistries().calls.emitter(v.plugin, v.type)?.legacyKind
      if (legacyKind !== undefined) {
        return { kind: legacyKind, name: v.name, ...(v.payload as object) }
      }
    }
  }
  return value
}

/** The lifecycle contributions of an `ext` declaration's type, or `undefined` (pure state). */
export function extDeclLifecycle(d: ExtDecl): DeclLifecycle | undefined {
  return activeRegistries().calls.emitter(d.plugin, d.type)?.lifecycle
}

/**
 * The receiver lowering for `expr` — a call, member read or assignment target
 * whose chain is ROOTED at a binding one of a plugin's declarations created —
 * with that declaration, or `undefined`. `undefined` is the common case and
 * costs one array-length check when no plugin registered a receiver.
 */
export function findReceiverLowering(
  expr: ExprIR,
  scope: PluginScope,
): { readonly lowering: ReceiverLowering; readonly receiver: ExtDecl } | undefined {
  const receivers = activeRegistries().exprs.receivers
  if (receivers.size === 0) return undefined
  const root = rootReceiverName(expr)
  if (root === undefined) return undefined
  const receiver = scope.declByName(root)
  if (receiver === undefined) return undefined
  const lowering = receivers.get(receiver.plugin)?.get(receiver.type)
  return lowering === undefined ? undefined : { lowering, receiver }
}

/**
 * The function lowering a plugin registered for the IR callee `name` — the
 * claimed name, or the `irName` the parser rewrote it to — with the claimed
 * name, or `undefined`.
 */
export function findFunctionLowering(name: string): { readonly lowering: FunctionLowering; readonly claimed: string } | undefined {
  const exprs = activeRegistries().exprs
  const claimed = exprs.functions.has(name) ? name : exprs.functionsByIrName.get(name)
  if (claimed === undefined) return undefined
  const entry = exprs.functions.get(claimed)
  return entry === undefined ? undefined : { lowering: entry.lowering, claimed }
}

/** The IR spelling the parser gives a call to the claimed function `name`, when its plugin asked for one. */
export function functionIrName(name: string): string | undefined {
  return activeRegistries().exprs.functions.get(name)?.lowering.irName
}

/** The identifier lowering a plugin registered for `name`, or `undefined`. */
export function findIdentifierLowering(name: string): IdentifierLowering | undefined {
  return activeRegistries().exprs.identifiers.get(name)?.lowering
}

/** The plugins' member-read lowerings, in plugin order (empty for the vast majority of compilations). */
export function memberReadLowerings(): readonly MemberReadLowering[] {
  return activeRegistries().exprs.memberReads.map((entry) => entry.lowering)
}

/** The intrinsic lowerings that name `tag`, in plugin order (empty for every tag but a plugin's own). */
export function findIntrinsicLowerings(tag: string): readonly IntrinsicLowering[] {
  const exprs = activeRegistries().exprs
  if (!exprs.intrinsicTags.has(tag)) return []
  return exprs.intrinsics.filter((entry) => entry.lowering.tags.includes(tag)).map((entry) => entry.lowering)
}

/** Every plugin's per-file preparation, in plugin order. */
export function emitPreparations(): readonly { readonly owner: string; readonly prepare: EmitPreparation }[] {
  return activeRegistries().exprs.preparations
}

/** The sentences loaded plugins append to the "DOM/SVG element has no native lowering" warning. */
export function intrinsicElementAdvice(): readonly string[] {
  return activeRegistries().exprs.intrinsicAdvice
}

/** The props type resolver a plugin registered for `name`, or `undefined`. */
export function findPropsTypeResolver(name: string) {
  return activeRegistries().propsTypes.get(name)?.resolver
}

type Target = 'swift' | 'kotlin'

/**
 * Lower a call or member read ROOTED at a binding a plugin's declaration
 * created (`flow.nodes.set(x)`), through that plugin's receiver lowering;
 * `undefined` when no plugin owns the root or the plugin declined.
 */
export function lowerPluginReceiver(
  expr: Extract<ExprIR, { kind: 'call' | 'member' }>,
  target: 'swift',
  scope: PluginScope,
  ctx: () => SwiftEmitContext,
): string | undefined
export function lowerPluginReceiver(
  expr: Extract<ExprIR, { kind: 'call' | 'member' }>,
  target: 'kotlin',
  scope: PluginScope,
  ctx: () => KotlinEmitContext,
): string | undefined
export function lowerPluginReceiver(
  expr: Extract<ExprIR, { kind: 'call' | 'member' }>,
  target: Target,
  scope: PluginScope,
  ctx: () => SwiftEmitContext | KotlinEmitContext,
): string | undefined {
  const found = findReceiverLowering(expr, scope)
  if (found === undefined) return undefined
  const { lowering, receiver } = found
  const site =
    expr.kind === 'call'
      ? ({ kind: 'call', expr, receiver } as const)
      : ({ kind: 'member', expr, receiver } as const)
  return target === 'swift'
    ? lowering.swift?.expr?.(site, ctx() as SwiftEmitContext)
    : lowering.kotlin?.expr?.(site, ctx() as KotlinEmitContext)
}

/**
 * The value operand of `<receiver>.<path> <op> <value>` as a plugin that owns
 * the receiver spells it (`Double(x)`), or `undefined` to keep the emitter's own.
 */
export function lowerPluginAssignValue(
  assign: { readonly target: ExprIR; readonly op: string; readonly value: ExprIR; readonly emitted: string },
  target: 'swift',
  scope: PluginScope,
  ctx: () => SwiftEmitContext,
): string | undefined
export function lowerPluginAssignValue(
  assign: { readonly target: ExprIR; readonly op: string; readonly value: ExprIR; readonly emitted: string },
  target: 'kotlin',
  scope: PluginScope,
  ctx: () => KotlinEmitContext,
): string | undefined
export function lowerPluginAssignValue(
  assign: { readonly target: ExprIR; readonly op: string; readonly value: ExprIR; readonly emitted: string },
  target: Target,
  scope: PluginScope,
  ctx: () => SwiftEmitContext | KotlinEmitContext,
): string | undefined {
  if (assign.target.kind !== 'member') return undefined
  const found = findReceiverLowering(assign.target, scope)
  if (found === undefined) return undefined
  const site = { target: assign.target, op: assign.op, value: assign.value, emitted: assign.emitted, receiver: found.receiver }
  return target === 'swift'
    ? found.lowering.swift?.assignValue?.(site, ctx() as SwiftEmitContext)
    : found.lowering.kotlin?.assignValue?.(site, ctx() as KotlinEmitContext)
}

/** Lower a plain `name(args)` call through the plugin that claims `name`, or `undefined`. */
export function lowerPluginFunction(
  name: string,
  args: readonly ExprIR[],
  target: 'swift',
  ctx: () => SwiftEmitContext,
): string | undefined
export function lowerPluginFunction(
  name: string,
  args: readonly ExprIR[],
  target: 'kotlin',
  ctx: () => KotlinEmitContext,
): string | undefined
export function lowerPluginFunction(
  name: string,
  args: readonly ExprIR[],
  target: Target,
  ctx: () => SwiftEmitContext | KotlinEmitContext,
): string | undefined {
  const found = findFunctionLowering(name)
  if (found === undefined) return undefined
  const site = { name: found.claimed, args }
  return target === 'swift'
    ? found.lowering.swift?.(site, ctx() as SwiftEmitContext)
    : found.lowering.kotlin?.(site, ctx() as KotlinEmitContext)
}

/**
 * The modifiers plugins append to `el`'s layout chain from its `ref` attribute, in plugin order (see `RefModifierLowering`).
 * Empty — one array-length check — when the element has no `ref` or no plugin registered a lowering.
 */
export function lowerPluginRefModifiers(
  el: Extract<ExprIR, { kind: 'jsx-element' }>,
  target: 'swift',
  ctx: () => SwiftEmitContext,
): readonly string[]
export function lowerPluginRefModifiers(
  el: Extract<ExprIR, { kind: 'jsx-element' }>,
  target: 'kotlin',
  ctx: () => KotlinEmitContext,
): readonly string[]
export function lowerPluginRefModifiers(
  el: Extract<ExprIR, { kind: 'jsx-element' }>,
  target: Target,
  ctx: () => SwiftEmitContext | KotlinEmitContext,
): readonly string[] {
  const lowerings = activeRegistries().exprs.refModifiers
  if (lowerings.length === 0) return []
  const attr = el.attrs.find((a) => a.kind === 'attr' && a.name === 'ref')
  if (attr === undefined || attr.kind !== 'attr') return []
  const out: string[] = []
  for (const { lowering } of lowerings) {
    const modifier =
      target === 'swift'
        ? lowering.swift?.(attr.value, el, ctx() as SwiftEmitContext)
        : lowering.kotlin?.(attr.value, el, ctx() as KotlinEmitContext)
    if (modifier !== undefined) out.push(modifier)
  }
  return out
}

/** Lower a bare identifier a plugin names (`DEFAULT_NODE_WIDTH`), or `undefined`. */
export function lowerPluginIdentifier(
  name: string,
  target: 'swift',
  ctx: () => SwiftEmitContext,
): string | undefined
export function lowerPluginIdentifier(
  name: string,
  target: 'kotlin',
  ctx: () => KotlinEmitContext,
): string | undefined
export function lowerPluginIdentifier(
  name: string,
  target: Target,
  ctx: () => SwiftEmitContext | KotlinEmitContext,
): string | undefined {
  const lowering = findIdentifierLowering(name)
  if (lowering === undefined) return undefined
  return target === 'swift'
    ? lowering.swift?.(name, ctx() as SwiftEmitContext)
    : lowering.kotlin?.(name, ctx() as KotlinEmitContext)
}

/** Lower a member read through the plugins' shape-based member-read lowerings, or `undefined`. */
export function lowerPluginMemberRead(
  e: Extract<ExprIR, { kind: 'member' }>,
  target: 'swift',
  ctx: () => SwiftEmitContext,
): string | undefined
export function lowerPluginMemberRead(
  e: Extract<ExprIR, { kind: 'member' }>,
  target: 'kotlin',
  ctx: () => KotlinEmitContext,
): string | undefined
export function lowerPluginMemberRead(
  e: Extract<ExprIR, { kind: 'member' }>,
  target: Target,
  ctx: () => SwiftEmitContext | KotlinEmitContext,
): string | undefined {
  for (const lowering of memberReadLowerings()) {
    const out =
      target === 'swift'
        ? lowering.swift?.(e, ctx() as SwiftEmitContext)
        : lowering.kotlin?.(e, ctx() as KotlinEmitContext)
    if (out !== undefined) return out
  }
  return undefined
}

/**
 * Lower a lowercase DOM tag through the plugins that claim it while their
 * predicate holds (`<path>` inside a flow renderer), or `undefined` to leave it
 * to the core. `undefined` is the common case and costs one `Set.has`.
 */
export function lowerPluginIntrinsic(
  el: Extract<ExprIR, { kind: 'jsx-element' }>,
  target: 'swift',
  ctx: () => SwiftEmitContext,
): string | undefined
export function lowerPluginIntrinsic(
  el: Extract<ExprIR, { kind: 'jsx-element' }>,
  target: 'kotlin',
  ctx: () => KotlinEmitContext,
): string | undefined
export function lowerPluginIntrinsic(
  el: Extract<ExprIR, { kind: 'jsx-element' }>,
  target: Target,
  ctx: () => SwiftEmitContext | KotlinEmitContext,
): string | undefined {
  for (const lowering of findIntrinsicLowerings(el.tag)) {
    const context = ctx()
    if (!lowering.applies(context)) continue
    const out =
      target === 'swift'
        ? lowering.emit.swift?.(el, context as SwiftEmitContext)
        : lowering.emit.kotlin?.(el, context as KotlinEmitContext)
    if (out !== undefined) return out
  }
  return undefined
}

/** The Swift modifier lines / Compose effect lines the `ext` declaration `d` contributes to its component's lifecycle. */
export function pluginLifecycleLines(d: ExtDecl, target: Target, ctx: EmitContext): readonly string[] {
  const lifecycle = extDeclLifecycle(d)
  if (lifecycle === undefined) return []
  return (target === 'swift' ? lifecycle.swift?.(d, ctx) : lifecycle.kotlin?.(d, ctx)) ?? []
}

/** The ext declarations of `decls` whose lifecycle is a TAIL one, in emit order (`tailOrder`, then declaration order). */
export function tailLifecycleDecls(decls: readonly DeclIR[]): ExtDecl[] {
  const tail = decls.filter((d): d is ExtDecl => d.kind === 'ext' && extDeclLifecycle(d)?.tailOrder !== undefined)
  // Stable sort: equal orders keep declaration order.
  return tail
    .map((d, i) => ({ d, i, order: extDeclLifecycle(d)!.tailOrder! }))
    .sort((a, b) => a.order - b.order || a.i - b.i)
    .map((entry) => entry.d)
}

/** The ext declarations of `decls` whose lifecycle is a MID one, in emit order (`midOrder`, then declaration order). */
export function midLifecycleDecls(decls: readonly DeclIR[]): ExtDecl[] {
  const mid = decls.filter((d): d is ExtDecl => d.kind === 'ext' && extDeclLifecycle(d)?.midOrder !== undefined)
  return mid
    .map((d, i) => ({ d, i, order: extDeclLifecycle(d)!.midOrder! }))
    .sort((a, b) => a.order - b.order || a.i - b.i)
    .map((entry) => entry.d)
}

/** The ext declarations of `decls` that seed the generated SwiftUI `init()`, in init order (`order`, then declaration order). */
export function swiftInitDecls(decls: readonly DeclIR[]): { readonly decl: ExtDecl; readonly init: DeclSwiftInit }[] {
  const out: { decl: ExtDecl; init: DeclSwiftInit; index: number }[] = []
  decls.forEach((d, index) => {
    if (d.kind !== 'ext') return
    const init = activeRegistries().calls.emitter(d.plugin, d.type)?.swiftInit
    if (init !== undefined) out.push({ decl: d, init, index })
  })
  return out.sort((a, b) => a.init.order - b.init.order || a.index - b.index).map(({ decl, init }) => ({ decl, init }))
}

/** True when `d` is an `ext` declaration that emits its lifecycle in declaration order (before the compiler's own modifiers). */
export function isHeadLifecycleDecl(d: DeclIR): d is ExtDecl {
  if (d.kind !== 'ext') return false
  const lifecycle = extDeclLifecycle(d)
  return lifecycle?.tailOrder === undefined && lifecycle?.midOrder === undefined
}

/** The type of the zero-arg call read `<binding>.<property>()` on a plugin declaration, or `undefined`. */
export function pluginCallReadType(d: ExtDecl, property: string): TypeIR | undefined {
  return activeRegistries().calls.emitter(d.plugin, d.type)?.typing?.callRead?.(d, property)
}

/** The return type of the method call `<binding>.<method>(…)` on a plugin declaration's container, by its owner's typing. */
export function pluginMethodReturnType(d: ExtDecl, method: string): TypeIR | undefined {
  return activeRegistries().calls.emitter(d.plugin, d.type)?.typing?.methodReturn?.(d, method)
}

/** The type of the property read `<binding>.<property>` on a plugin declaration's container, by its owner's typing. */
export function pluginMemberReadType(d: ExtDecl, property: string): TypeIR | undefined {
  return activeRegistries().calls.emitter(d.plugin, d.type)?.typing?.member?.(d, property)
}

/** The async state (pending / failed conditions) of an `ext` declaration that is an async source, else `undefined`. */
export function pluginAsyncState(d: DeclIR, target: Target, ctx: EmitContext): AsyncState | undefined {
  if (d.kind !== 'ext') return undefined
  const emitter = activeRegistries().calls.emitter(d.plugin, d.type)?.asyncState
  if (emitter === undefined) return undefined
  return target === 'swift' ? emitter.swift(d, ctx) : emitter.kotlin(d, ctx)
}

/** The persistence backend that renders `storageKey` signals; throws, naming the key, when none is loaded. */
export function persistenceFor(key: string): SignalPersistence {
  const registered = activeRegistries().persistence
  if (registered === undefined) {
    throw new Error(
      `[Pyreon] a signal persists under the key ${JSON.stringify(key)} but no loaded plugin declares \`persistence\` — the plugin that recognized it must declare how it is rendered.`,
    )
  }
  return registered.persistence
}

/** True when `d` is an `ext` declaration whose binding is callable (a zero-argument call of it keeps its parentheses). */
export function pluginDeclIsCallable(d: DeclIR): boolean {
  return d.kind === 'ext' && activeRegistries().calls.emitter(d.plugin, d.type)?.callable === true
}

/** True when `d` is an `ext` declaration that reads the active router (the SwiftUI View needs it in its environment). */
export function pluginDeclUsesRouter(d: DeclIR): boolean {
  return d.kind === 'ext' && activeRegistries().calls.emitter(d.plugin, d.type)?.usesRouter === true
}

/** True when `d` is an `ext` declaration whose type needs a stable host view on Swift. */
export function pluginNeedsStableHost(d: DeclIR): boolean {
  return d.kind === 'ext' && extDeclLifecycle(d)?.stableHost === true
}

/** The type of an `ext-expr` node, by its owner's typing (`unknown` without one). */
export function pluginExprType(e: ExtExprIR, infer: (e: ExprIR) => TypeIR): TypeIR | undefined {
  return activeRegistries().items.exprEmitter(e.plugin, e.type)?.typing?.type?.(e, infer)
}

/** The reduction an `ext-expr` is (source, reducer, seed), by its owner's account, or `undefined`. */
export function pluginExprReduce(e: ExtExprIR): { readonly source: ExprIR; readonly reducer: ExprIR; readonly seed: ExprIR } | undefined {
  return activeRegistries().items.exprEmitter(e.plugin, e.type)?.reduce?.(e)
}

/** Whether a file-scope `const` holding this `ext-expr` is typed by the node's own type for later reads (default true). */
export function pluginExprSeedsModuleConst(e: ExtExprIR): boolean {
  return activeRegistries().items.exprEmitter(e.plugin, e.type)?.typing?.seedsModuleConst !== false
}

/** The type of `<ext-expr>.<property>` when the owner types member reads on its node, else `undefined`. */
export function pluginExprMemberType(e: ExtExprIR, property: string): TypeIR | undefined {
  return activeRegistries().items.exprEmitter(e.plugin, e.type)?.typing?.member?.(e, property)
}

/** Render an `ext-expr` on `target` through its owner's emitter. */
export function lowerPluginExpr(e: ExtExprIR, target: 'swift', ctx: () => SwiftEmitContext): string
export function lowerPluginExpr(e: ExtExprIR, target: 'kotlin', ctx: () => KotlinEmitContext): string
export function lowerPluginExpr(
  e: ExtExprIR,
  target: Target,
  ctx: () => SwiftEmitContext | KotlinEmitContext,
): string {
  return emitExtExpr(activeRegistries().items, e, target, ctx())
}

/** The hash lane (`ModuleItemEmitter.legacyList`) an item belongs to, if any. */
export function itemLegacyList(item: ExtModuleItem): string | undefined {
  return activeRegistries().items.emitter(item.plugin, item.type)?.legacyList
}

/** The items that emit in `slot` (see `ModuleItemEmitter.after`), in file order. */
export function itemsInSlot(items: readonly ExtModuleItem[], slot: 'models' | 'declarations' | 'data'): ExtModuleItem[] {
  const registry = activeRegistries().items
  return items.filter((item) => (registry.emitter(item.plugin, item.type)?.after ?? 'data') === slot)
}

/** Render a file-scope item on `target` through its owner's emitter: one string per declaration. */
export function lowerPluginItem(item: ExtModuleItem, target: 'swift', ctx: () => SwiftEmitContext): readonly string[]
export function lowerPluginItem(item: ExtModuleItem, target: 'kotlin', ctx: () => KotlinEmitContext): readonly string[]
export function lowerPluginItem(
  item: ExtModuleItem,
  target: Target,
  ctx: () => SwiftEmitContext | KotlinEmitContext,
): readonly string[] {
  return emitModuleItem(activeRegistries().items, item, target, ctx())
}

/** The per-field validators a plugin item named `name` offers a form (`useForm({ schema: name })`). */
export function formFieldValidators(items: readonly ExtModuleItem[], name: string) {
  return findFieldValidators(activeRegistries().items, items, name)
}

/** What the "no declaration by that name" warning says declares a validating item, from every loaded plugin. */
export function formSchemaAdvice(): string | undefined {
  return fieldValidatorsAdvice(activeRegistries().items)
}
