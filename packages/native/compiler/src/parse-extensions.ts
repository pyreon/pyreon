import type { ComponentIR, DeclIR, TypeIR } from './types'

/**
 * What a plugin's {@link ParseRefinement} may edit: the freshly parsed
 * components and the file's top-level helper functions. Both are owned by the
 * `parsePyreon` call in flight (never shared between compilations), which is
 * why this hook may mutate them in place — unlike a `transformIR` pass, which
 * runs later on a module and, for a third-party plugin, on a clone.
 */
export interface ParseRefinementTarget {
  readonly components: ComponentIR[]
  readonly helperFns: Extract<DeclIR, { kind: 'function' }>[]
}

/**
 * An IR→IR edit that must land DURING parse, after components are collected and
 * before helper return types are inferred.
 */
export type ParseRefinement = (target: ParseRefinementTarget) => void

type ParseExtensionPlugin = {
  readonly name: string
  readonly runtimeTypes?: readonly string[] | undefined
  readonly refineParse?: ParseRefinement | undefined
}

export interface RegisteredParseRefinement {
  readonly owner: string
  readonly refine: ParseRefinement
}

/**
 * Type name → owning plugin, from every plugin's `runtimeTypes`. A name
 * declared by two plugins is a load-time error naming both (which one a
 * helper's type resolves against would otherwise depend on plugin order).
 */
export function createRuntimeTypeRegistry(
  plugins: readonly ParseExtensionPlugin[],
): ReadonlyMap<string, string> {
  const out = new Map<string, string>()
  for (const plugin of plugins) {
    for (const name of plugin.runtimeTypes ?? []) {
      const existing = out.get(name)
      if (existing !== undefined && existing !== plugin.name) {
        throw new Error(
          `[Pyreon] runtime type "${name}" is declared by both "${existing}" and "${plugin.name}". ` +
            `A type name resolves to one runtime declaration — remove one of the two plugins from this app.`,
        )
      }
      out.set(name, plugin.name)
    }
  }
  return out
}

/** Every plugin's `refineParse`, in plugin order (`requires` ordering already applied). */
export function createParseRefinements(
  plugins: readonly ParseExtensionPlugin[],
): readonly RegisteredParseRefinement[] {
  const out: RegisteredParseRefinement[] = []
  for (const plugin of plugins) {
    if (plugin.refineParse !== undefined) out.push({ owner: plugin.name, refine: plugin.refineParse })
  }
  return Object.freeze(out)
}

/** What a props-type resolver may ask the parser while it resolves one annotation. */
export interface PropsTypeContext {
  /**
   * The struct the parser declared for an inline object type argument
   * (`NodeProps<{ label: string }>`), when the resolver asked for it to be
   * lifted (`liftInlineArg`) — the SAME name the plugin's own literals resolve to.
   */
  liftedStruct(inline: TypeIR): string | undefined
}

/**
 * How a library's PROPS TYPE (`NodeComponentProps<D>` — imported, not declared
 * in the consumer's file) resolves to the object shape a component's
 * parameters are read from. Without it the parser sees an unresolvable named
 * type and emits a zero-prop component whose body references unbound fields.
 */
export interface PropsTypeResolver {
  /**
   * Declare ONE struct per distinct inline object type argument, named after
   * the first component that uses it (`<Component><suffix>`), before the
   * components are parsed — so the resolved props and the plugin's own literals
   * agree on a type name.
   */
  readonly liftInlineArg?: { readonly suffix: string } | undefined
  /** The props object type for `Name<args>`, or `undefined` to decline (the type then warns as unresolved). */
  resolve(type: { readonly name: string; readonly args: readonly TypeIR[] }, ctx: PropsTypeContext): TypeIR | undefined
}

type PropsTypePlugin = {
  readonly name: string
  readonly propsTypes?: Readonly<Record<string, PropsTypeResolver>> | undefined
}

export interface RegisteredPropsType {
  readonly owner: string
  readonly resolver: PropsTypeResolver
}

/**
 * Props type name → resolver + owner. A name claimed by two plugins is a
 * load-time error naming both (the type would resolve differently depending on
 * plugin order).
 */
export function createPropsTypeRegistry(
  plugins: readonly PropsTypePlugin[],
): ReadonlyMap<string, RegisteredPropsType> {
  const out = new Map<string, RegisteredPropsType>()
  for (const plugin of plugins) {
    for (const [name, resolver] of Object.entries(plugin.propsTypes ?? {})) {
      const existing = out.get(name)
      if (existing !== undefined) {
        throw new Error(
          `[Pyreon] props type "${name}" is resolved by both "${existing.owner}" and "${plugin.name}". ` +
            `A type name resolves one way — remove one of the two plugins from this app.`,
        )
      }
      out.set(name, { owner: plugin.name, resolver })
    }
  }
  return out
}
