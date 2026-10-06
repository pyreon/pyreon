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
import type { ServiceDescriptor } from './services'
import { emitExtDecl, lowerMemberCall } from './call-lowering'
import type { PluginScope } from './plugin-scope'
import type { UnloweredModule } from './unlowered-modules'
import type { EmitContext } from './emit-context'
import type { DeclIR, ExprIR, ExtDecl } from './types'

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
  const modules = registries.services.get(hook)?.modules ?? registries.calls.calls.get(hook)?.modules
  return modules?.some((m) => source === m || source.startsWith(`${m}/`)) ?? false
}

/** The lowering that claims `tag` (see {@link ElementClaimGuard}), or `undefined`. */
export function findElementLowering(
  tag: string,
  guard: ElementClaimGuard,
): ElementLowering | undefined {
  return activeRegistries().elements.find(tag, guard)
}

/** True when some registered lowering claims `name` (the parser then records where it was imported from). */
export function isElementLoweringTag(name: string): boolean {
  return activeRegistries().elements.hasTag(name)
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
