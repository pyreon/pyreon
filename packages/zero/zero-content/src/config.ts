import type { ComponentFn } from '@pyreon/core'
import {
  COMPONENTS_BRAND,
  type CollectionDefinition,
  type ComponentsRegistry,
  type ContentConfig,
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
  // Runtime validation — every value must be a component function.
  // Runs in BOTH dev AND production (PR-A audit L1 was a separate
  // issue; this used to be dev-only behind `__DEV__` which meant a CI
  // build with `NODE_ENV=production` silently accepted `{ X: undefined }`
  // typos. Cheap per-key loop; fires once per call so the cost is
  // negligible at production scale).
  for (const [key, value] of Object.entries(components)) {
    if (typeof value !== 'function') {
      throw new TypeError(
        `[@pyreon/zero-content] defineComponents: '${key}' is ${typeof value}; expected a component function. Likely cause: import path typo or circular dependency.`,
      )
    }
  }
  // Attach the runtime brand symbol. Non-enumerable + non-writable so
  // it survives `Object.assign({}, components)` (which the merge helper
  // does deliberately as a shallow copy) only when the merge code also
  // copies symbol-keyed slots — `mergeComponents` does, so the brand
  // propagates. The plugin's `validateComponentsRegistry` checks for
  // this symbol's presence to refuse raw `{...}` literals.
  Object.defineProperty(components, COMPONENTS_BRAND, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  })
  return components as TComponents & ComponentsRegistry
}

/**
 * Whether `value` is a properly-branded ComponentsRegistry — i.e.
 * the result of a `defineComponents({...})` call. Used by the Vite
 * plugin to refuse raw object literals passed to a `components:`
 * field. Pre-fix (PR-A audit C4) the brand existed in types only
 * and the manifest promised a build error that never fired.
 *
 * @internal exported for the plugin + tests
 */
export function isBrandedComponentsRegistry(
  value: unknown,
): value is ComponentsRegistry {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as Record<symbol, unknown>)[COMPONENTS_BRAND] === true
  )
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
  // Stamp the merged result with the runtime brand so a
  // `mergeComponents(a, b)` value can be passed to a `components:`
  // field without the plugin's `isBrandedComponentsRegistry` check
  // rejecting it as a raw object. Mirrors `defineComponents` —
  // non-enumerable, non-writable.
  Object.defineProperty(result, COMPONENTS_BRAND, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  })
  return result as ComponentsRegistry
}
