/**
 * Compat-mode alias tables and the resolution helpers built on them.
 *
 * Split out of the plugin entry so the `_`-prefixed helpers tests import are
 * reachable from `@pyreon/vite-plugin/internal` without being part of the
 * public `@pyreon/vite-plugin` entry.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join as pathJoin } from 'node:path'

export type CompatFramework = 'react' | 'preact' | 'vue' | 'solid' | 'svelte'

// ── Compat alias maps ─────────────────────────────────────────────────────────

export const COMPAT_ALIASES: Record<CompatFramework, Record<string, string>> = {
  react: {
    react: '@pyreon/react-compat',
    'react/jsx-runtime': '@pyreon/react-compat/jsx-runtime',
    'react/jsx-dev-runtime': '@pyreon/react-compat/jsx-runtime',
    'react-dom': '@pyreon/react-compat/dom',
    'react-dom/client': '@pyreon/react-compat/dom',
  },
  preact: {
    preact: '@pyreon/preact-compat',
    'preact/hooks': '@pyreon/preact-compat/hooks',
    // Preact's React-shaped API (core + hooks in one module).
    'preact/compat': '@pyreon/preact-compat/compat',
    'preact/jsx-runtime': '@pyreon/preact-compat/jsx-runtime',
    'preact/jsx-dev-runtime': '@pyreon/preact-compat/jsx-runtime',
    'preact/compat/jsx-runtime': '@pyreon/preact-compat/jsx-runtime',
    'preact/compat/jsx-dev-runtime': '@pyreon/preact-compat/jsx-runtime',
    '@preact/signals': '@pyreon/preact-compat/signals',
    '@preact/signals-core': '@pyreon/preact-compat/signals',
  },
  vue: {
    vue: '@pyreon/vue-compat',
    'vue/jsx-runtime': '@pyreon/vue-compat/jsx-runtime',
    'vue/jsx-dev-runtime': '@pyreon/vue-compat/jsx-runtime',
    // `vue` is a re-export of these three; libraries import them directly.
    // Mixing the real ones with the compat layer would split reactivity.
    '@vue/reactivity': '@pyreon/vue-compat',
    '@vue/runtime-core': '@pyreon/vue-compat',
    '@vue/runtime-dom': '@pyreon/vue-compat',
  },
  solid: {
    'solid-js': '@pyreon/solid-compat',
    // solid-compat's main entry also carries the `solid-js/web` surface
    // (`render`, `hydrate`, `Portal`, `Dynamic`) and the `solid-js/store`
    // surface (`createStore`, `produce`, `reconcile`, `unwrap`).
    'solid-js/web': '@pyreon/solid-compat',
    'solid-js/store': '@pyreon/solid-compat',
    'solid-js/jsx-runtime': '@pyreon/solid-compat/jsx-runtime',
    'solid-js/jsx-dev-runtime': '@pyreon/solid-compat/jsx-runtime',
  },
  svelte: {
    svelte: '@pyreon/svelte-compat',
    'svelte/store': '@pyreon/svelte-compat/store',
    'svelte/internal': '@pyreon/svelte-compat',
    'svelte/jsx-runtime': '@pyreon/svelte-compat/jsx-runtime',
    'svelte/jsx-dev-runtime': '@pyreon/svelte-compat/jsx-runtime',
  },
}

/**
 * The bare specifiers that belong to each compat framework. An import of one
 * of these that is NOT in {@link COMPAT_ALIASES} resolves to the real
 * framework package (if installed) — usually a mistake in compat mode, since
 * the real framework's runtime does not integrate with Pyreon's — so the
 * plugin warns once per specifier. Locked against the compat packages'
 * export maps by `compat-alias-coverage.test.ts`.
 */
const COMPAT_FRAMEWORK_SPECIFIERS: Record<CompatFramework, readonly RegExp[]> = {
  react: [/^react(?:\/|$)/, /^react-dom(?:\/|$)/],
  preact: [/^preact(?:\/|$)/, /^@preact\/signals(?:-core)?(?:\/|$)/],
  vue: [/^vue(?:\/|$)/, /^@vue\//],
  solid: [/^solid-js(?:\/|$)/],
  svelte: [/^svelte(?:\/|$)/],
}

/**
 * What to use instead, for unaliased framework specifiers whose Pyreon
 * replacement is NOT in the compat package. A server renderer is the case:
 * the framework's own (`react-dom/server`, `vue/server-renderer`,
 * `svelte/server`) cannot render Pyreon vnodes, and the replacement lives in
 * `@pyreon/runtime-server`. Specifiers not listed get the generic advice.
 */
const SERVER_RENDER_HINT =
  'Server-render with `renderToString` (or `renderToStream`) from "@pyreon/runtime-server" ' +
  'instead. Pyreon\'s `renderToString` is async: await the Promise it returns.'

const COMPAT_SPECIFIER_HINTS: Record<CompatFramework, ReadonlyArray<readonly [RegExp, string]>> = {
  // `react-dom/server` and its `.browser` / `.node` / `.edge` builds, plus
  // `react-dom/static` (the prerender APIs).
  react: [[/^react-dom\/(?:server|static)(?:\.[a-z]+)?$/, SERVER_RENDER_HINT]],
  preact: [],
  vue: [[/^(?:vue|@vue)\/server-renderer$/, SERVER_RENDER_HINT]],
  solid: [],
  svelte: [[/^svelte\/server$/, SERVER_RENDER_HINT]],
}

/**
 * The warning for an unaliased framework import: what happens, and what to
 * use instead — a specific replacement when one is known, otherwise the
 * compat package.
 *
 * @internal — exported for tests.
 */
export function _unaliasedImportWarning(compat: CompatFramework, id: string): string {
  const hint = COMPAT_SPECIFIER_HINTS[compat].find(([re]) => re.test(id))?.[1]
  return (
    `[Pyreon] compat "${compat}": "${id}" is not provided by @pyreon/${compat}-compat, so it ` +
    `resolves to the real package (if installed), whose runtime does not work with Pyreon's. ` +
    (hint ??
      `Import the equivalent from "@pyreon/${compat}-compat" instead, or check the compat docs ` +
        `for what is supported.`)
  )
}

/** @internal — exported for tests. */
export function _compatAliasTable(compat: CompatFramework): Readonly<Record<string, string>> {
  return COMPAT_ALIASES[compat]
}

/**
 * True when `id` is a specifier of the compat framework that the plugin does
 * NOT redirect (so it falls through to the real package).
 *
 * @internal — exported for tests.
 */
export function _isUnaliasedFrameworkImport(compat: CompatFramework, id: string): boolean {
  if (COMPAT_ALIASES[compat][id]) return false
  return COMPAT_FRAMEWORK_SPECIFIERS[compat].some((re) => re.test(id))
}

/**
 * Detect whether a file id resolves to a `@pyreon/*` framework-package source
 * (i.e. a published Pyreon package whose .tsx is being pulled in via the
 * `bun` condition workspace-link, NOT user code, NOT an example app).
 *
 * Why this exists: in compat mode, OXC's per-project `importSource` is set
 * to `@pyreon/core` and the resolveId hook redirects `@pyreon/core/jsx-runtime`
 * to the compat package. That's correct for user code (the whole point of
 * compat mode) but WRONG for framework-internal sources like
 * `@pyreon/zero/src/link.tsx`, which need the real `@pyreon/core` runtime.
 * The fix skips the redirect when the importer is a `@pyreon/*` framework
 * file. Result: published-package consumers (where `@pyreon/zero` resolves
 * to its pre-built `lib/`) and workspace-dev consumers (where it resolves
 * to source) both get correct JSX runtime resolution.
 *
 * Detection heuristic: walk to nearest `package.json`, require BOTH:
 *   1. `name` starts with `@pyreon/` (workspace member of the @pyreon scope)
 *   2. file path contains `/packages/` AND NOT `/examples/`
 *
 * Step 2 excludes the existing `@pyreon/example-{react,vue,solid,preact}-compat`
 * apps under `examples/`. Without it, user code in those apps would skip the
 * compat-mode JSX-runtime redirect and import `@pyreon/core/jsx-runtime`
 * directly — breaking the React/Vue/Solid/Preact compat layer's contract.
 *
 * Result cached per directory. The `/packages/` + `/examples/` check is a
 * structural property of the monorepo (workspace layout), not the package
 * name — so it's robust against renames.
 */
export function _isPyreonWorkspaceFile(id: string, cache: Map<string, boolean>): boolean {
  // Strip query strings (e.g. `?vue&type=script`) to get the bare path.
  const queryIdx = id.indexOf('?')
  const filePath = queryIdx === -1 ? id : id.slice(0, queryIdx)
  if (!filePath || filePath[0] === '\0') return false

  // Decided on IDENTITY (the owning package's name), never on the path: a
  // `/packages/` test held only inside this monorepo, so every npm consumer
  // of a compat app had framework JSX redirected to the compat runtime.

  let dir = dirname(filePath)
  // Walk up at most ~12 levels — enough for any realistic monorepo depth.
  for (let i = 0; i < 12; i++) {
    const cached = cache.get(dir)
    if (cached !== undefined) return cached

    const pkgPath = pathJoin(dir, 'package.json')
    if (existsSync(pkgPath)) {
      let isPyreon = false
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name?: string }
        // The `@pyreon/example-*` apps are CONSUMERS (four of them are the
        // compat apps this guard exists for), not framework files.
        isPyreon =
          typeof pkg.name === 'string' &&
          pkg.name.startsWith('@pyreon/') &&
          !pkg.name.startsWith('@pyreon/example-')
      } catch {
        // Malformed package.json — treat as not-pyreon.
      }
      cache.set(dir, isPyreon)
      return isPyreon
    }

    const parent = dirname(dir)
    if (parent === dir) break // reached filesystem root
    dir = parent
  }
  return false
}

/**
 * Return the Pyreon compat target for an import specifier, or undefined if
 * the import should not be redirected.
 */
export function _getCompatTarget(
  compat: CompatFramework | undefined,
  id: string,
): string | undefined {
  if (!compat) return undefined
  const aliased = COMPAT_ALIASES[compat][id]
  if (aliased) return aliased
  // OXC's JSX transform reads jsxImportSource from tsconfig (@pyreon/core),
  // not from our plugin config. Redirect JSX runtime imports in compat mode.
  if (id === '@pyreon/core/jsx-runtime' || id === '@pyreon/core/jsx-dev-runtime') {
    if (compat === 'react') return '@pyreon/react-compat/jsx-runtime'
    if (compat === 'preact') return '@pyreon/preact-compat/jsx-runtime'
    if (compat === 'vue') return '@pyreon/vue-compat/jsx-runtime'
    if (compat === 'solid') return '@pyreon/solid-compat/jsx-runtime'
    if (compat === 'svelte') return '@pyreon/svelte-compat/jsx-runtime'
  }
  return undefined
}
