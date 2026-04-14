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
  return m
}
