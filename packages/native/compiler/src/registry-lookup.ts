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
import type { DeclIR } from './types'

/** The descriptor registered for `hook`, or `undefined`. */
export function findService(hook: string): ServiceDescriptor | undefined {
  return activeRegistries().serviceTables.byHook.get(hook)
}

/** Every registered service descriptor, in registry order. */
export function allServices(): readonly ServiceDescriptor[] {
  return activeRegistries().serviceTables.descriptors
}

/**
 * Does `source` serve `hook` for the plugin that owns it? True when the owner
 * declared `modules` and `source` is one of them or a sub-path of one. Built-in
 * hooks declare none, so they stay `@pyreon/*`-only.
 */
export function serviceClaimsSource(hook: string, source: string): boolean {
  const modules = activeRegistries().services.get(hook)?.modules
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
    const v = value as { kind?: unknown; hook?: unknown; name?: unknown }
    if (v.kind === 'service' && typeof v.hook === 'string') {
      return { kind: serviceFor(v.hook).legacyKind, name: v.name }
    }
  }
  return value
}
