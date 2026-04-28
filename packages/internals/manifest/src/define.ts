import type { PackageManifest } from './types'

/**
 * Identity helper that preserves literal-type inference on the argument.
 * Enables IDE autocomplete + catches typos at authoring time without
 * forcing `satisfies PackageManifest` at every call site.
 *
 * The `const` modifier on the type parameter preserves string-literal
 * narrowing (e.g. `category: 'browser'` stays `'browser'`, not `string`),
 * which matters for discriminated-union consumers downstream.
 *
 * Performs runtime validation of deprecation metadata: any API entry
 * with `stability: 'deprecated'` must include a `deprecated.removeIn`
 * field. This is a policy gate — without a planned removal version,
 * deprecations decay into permanent fixtures that nobody schedules
 * the cleanup for. Throws loudly at module load (during gen-docs and
 * test runs) so the violation surfaces immediately.
 *
 * @example
 * ```ts
 * import { defineManifest } from '@pyreon/manifest'
 *
 * export default defineManifest({
 *   name: '@pyreon/flow',
 *   tagline: 'Reactive flow diagrams',
 *   description: '...',
 *   category: 'browser',
 *   features: ['...'],
 *   api: [{
 *     name: 'createFlow',
 *     kind: 'function',
 *     signature: '<T>(config: FlowConfig<T>) => FlowInstance<T>',
 *     summary: '...',
 *     example: '...',
 *   }],
 * })
 * ```
 */
export function defineManifest<const M extends PackageManifest>(m: M): M {
  // Deprecation policy — every deprecated entry must declare a removal
  // version. Otherwise deprecations rot into permanent surface that
  // nobody schedules the removal PR for.
  if (m.api) {
    for (const entry of m.api) {
      if (entry.stability === 'deprecated') {
        if (!entry.deprecated) {
          throw new Error(
            `[Pyreon manifest] '${m.name}' API '${entry.name}' is marked stability: 'deprecated' but has no \`deprecated\` metadata. Add \`deprecated: { since: "X.Y.Z", removeIn: "X.Y.Z" }\`.`,
          )
        }
        if (!entry.deprecated.removeIn) {
          throw new Error(
            `[Pyreon manifest] '${m.name}' API '${entry.name}' is deprecated but has no \`deprecated.removeIn\`. Every deprecation must declare a planned removal version — otherwise it rots into permanent surface. Add \`removeIn: "X.Y.Z"\` to \`deprecated\` (or undeprecate the API).`,
          )
        }
      }
    }
  }
  return m
}
