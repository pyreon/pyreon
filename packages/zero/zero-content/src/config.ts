import type { ComponentFn } from '@pyreon/core'
import type {
  CollectionDefinition,
  ComponentsRegistry,
  ContentConfig,
} from './types'

// ─── User-facing config helpers ────────────────────────────────────────────
//
// Three helpers — all pass-through factories — to give users typed,
// inferred values without losing literal type narrowing:
//
//   defineConfig({...})        → ContentConfig with collections preserved
//   defineCollection({...})    → CollectionDefinition with schema's
//                                z.infer type inferred at the call site
//   defineComponents({...})    → ComponentsRegistry branded for runtime
//                                identification
//   mergeComponents(a, b, ...) → combined registry, later wins on collision
//
// All zero-cost at runtime; only `defineComponents` validates in dev.

const __DEV__ = process.env.NODE_ENV !== 'production'

/**
 * Top-level config entrypoint. Users put this in `content.config.ts`
 * and export the result as default. The plugin reads it at build time.
 */
export function defineConfig(config: ContentConfig): ContentConfig {
  return config
}

/**
 * Per-collection definition. The generic propagates the schema type
 * so consumers of `entry.data` see the inferred shape.
 */
export function defineCollection<TSchema>(
  def: Omit<CollectionDefinition<TSchema>, 'schema'> & { schema: TSchema },
): CollectionDefinition<TSchema> {
  return def
}

/**
 * Wrap a map of components for use in `content.config.ts`'s
 * `components:` field or a collection's `components:` field.
 *
 * Why the helper (and not a plain object literal)?
 *
 *   1. **Brand symbol** — the plugin can refuse raw objects, catching
 *      `components: {Playground}` typos at build time with a clear
 *      message instead of silently ignoring them.
 *   2. **Type inference** — the generic preserves the exact shape so
 *      downstream `mergeComponents` / type emission see the literal
 *      key set.
 *   3. **Runtime validation in dev** — every value is checked for being
 *      a function; non-function values fail loud with the offending
 *      key, catching `{ Playground: undefined }` typos.
 */
export function defineComponents<TComponents extends Record<string, ComponentFn<any>>>(
  components: TComponents,
): TComponents & ComponentsRegistry {
  if (__DEV__) {
    for (const [key, value] of Object.entries(components)) {
      if (typeof value !== 'function') {
        throw new TypeError(
          `[@pyreon/zero-content] defineComponents: '${key}' is ${typeof value}; expected a component function. Likely cause: import path typo or circular dependency.`,
        )
      }
    }
  }
  return components as TComponents & ComponentsRegistry
}

/**
 * Merge multiple component registries. Later sources override earlier
 * on key collision — same semantics as `Object.assign`. Result is
 * branded so it can be passed back into a collection or config.
 *
 * Typical use: a base registry + a specialized one for a specific
 * collection.
 *
 * @example
 * const shared = defineComponents({ Playground, Callout })
 * const docsExtra = defineComponents({ APIReference })
 * const docsComponents = mergeComponents(shared, docsExtra)
 */
export function mergeComponents(
  ...sources: ComponentsRegistry[]
): ComponentsRegistry {
  const result: Record<string, ComponentFn<any>> = {}
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      result[key] = value as ComponentFn<any>
    }
  }
  return result as ComponentsRegistry
}
