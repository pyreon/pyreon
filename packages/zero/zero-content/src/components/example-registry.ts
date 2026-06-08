// ─── Example registry for <Example file="./..." /> ───────────────────
//
// The `<Example>` component looks up real `.tsx` files by their path
// key. Vite's `import.meta.glob` produces a record of `path → loader`
// — the consumer calls `registerExamples(glob)` once at startup to
// hand the registry the full glob, then every `<Example file="./X" />`
// looks up that path.
//
// Why a registry instead of inline `import.meta.glob` in the Example
// component? `import.meta.glob` is resolved at COMPILE TIME relative
// to the file it's called in. The consumer's example files live in
// the consumer's source tree (e.g. `docs-zero/src/examples/`), not
// here in `@pyreon/zero-content`. The consumer therefore MUST own
// the glob; the registry is the handoff point.
//
// Lookup semantics:
// - Exact-path match (e.g. `"./examples/counter"` matches
//   `"./examples/counter.tsx"` in the glob).
// - Without `.tsx`/`.ts` extension — added automatically since
//   authors don't include it in `file="..."`.
// - Returns `undefined` for unknown paths so the Example component
//   can render a clear error instead of crashing.
//
// The registry intentionally accepts the GLOB SHAPE Vite emits:
//   Record<string, () => Promise<{ default: ComponentFn }>>
// This matches what `import.meta.glob('./examples/**/*.tsx',
// { import: 'default' })` would emit if `default` import was
// requested, OR what `import.meta.glob('./examples/**/*.tsx')`
// emits which is a module record.

import type { ComponentFn } from '@pyreon/core'

type ExampleLoader = () => Promise<unknown>
type ExampleGlob = Record<string, ExampleLoader>

let _registry: ExampleGlob = {}

/**
 * Register a set of example files. The argument is typically a
 * `import.meta.glob` result from the consumer's source tree:
 *
 *     import { registerExamples } from '@pyreon/zero-content'
 *     registerExamples(import.meta.glob('./examples/⁎⁎/⁎.tsx'))
 *
 * Idempotent: re-registering replaces the previous registry. Useful
 * for hot-reload scenarios where a dev server might re-evaluate
 * the registration module.
 */
export function registerExamples(glob: ExampleGlob): void {
  _registry = glob
}

/**
 * Resolve a `file=` prop value to its loader, normalising the path
 * with the same rules a user would expect: `./examples/X` matches
 * both `./examples/X.tsx` and `./examples/X.ts` in the glob.
 *
 * Returns null on miss.
 *
 * @internal exported for testing
 */
export function resolveExample(file: string): ExampleLoader | null {
  const tryKeys = (key: string): ExampleLoader | null => {
    const direct = _registry[key]
    if (direct) return direct
    for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
      const withExt = _registry[key + ext]
      if (withExt) return withExt
    }
    return null
  }
  const direct = tryKeys(file)
  if (direct) return direct
  // Try without a leading `./` if the user wrote `examples/X`
  if (!file.startsWith('./') && !file.startsWith('/')) {
    return tryKeys('./' + file)
  }
  return null
}

/**
 * Load a resolved example loader and return its default export. The
 * loader returns the module record; we extract `.default`. Returns
 * null if the module has no default or doesn't load.
 *
 * @internal exported for testing
 */
export async function loadExampleComponent(
  loader: ExampleLoader,
): Promise<ComponentFn | null> {
  try {
    const mod = await loader()
    if (mod === null || typeof mod !== 'object') return null
    const m = mod as Record<string, unknown>
    if (typeof m['default'] === 'function') {
      return m['default'] as ComponentFn
    }
    return null
  } catch (err) {
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.error('[@pyreon/zero-content] Example load failed:', err)
    }
    return null
  }
}

/**
 * Number of registered examples — test introspection.
 *
 * @internal
 */
export function _exampleCount(): number {
  return Object.keys(_registry).length
}

/**
 * Reset the registry to empty. Test isolation only.
 *
 * @internal
 */
export function _resetExampleRegistry(): void {
  _registry = {}
}

/**
 * Snapshot the current registry keys. Test introspection.
 *
 * @internal
 */
export function _exampleKeys(): string[] {
  return Object.keys(_registry)
}
