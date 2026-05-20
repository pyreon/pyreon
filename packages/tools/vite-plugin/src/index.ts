/**
 * @pyreon/vite-plugin — Vite integration for Pyreon framework.
 *
 * Applies Pyreon's JSX reactive transform to .tsx, .jsx, and .pyreon files,
 * and configures Vite to use Pyreon's JSX runtime.
 *
 * ## Basic usage (SPA)
 *
 *   import pyreon from "@pyreon/vite-plugin"
 *   export default { plugins: [pyreon()] }
 *
 * ## Drop-in compat mode (zero code changes)
 *
 *   import pyreon from "@pyreon/vite-plugin"
 *   export default { plugins: [pyreon({ compat: "react" })] }
 *
 * Aliases `react`, `react-dom`, `vue`, `solid-js`, or `preact` imports to
 * Pyreon's compat packages — existing code works without changing imports.
 *
 * ## SSR mode
 *
 *   import pyreon from "@pyreon/vite-plugin"
 *   export default { plugins: [pyreon({ ssr: { entry: "./src/entry-server.ts" } })] }
 *
 * In SSR mode, the plugin adds dev server middleware that:
 *   1. Loads your server entry via Vite's `ssrLoadModule`
 *   2. Calls the exported `handler` or default export (Request → Response)
 *   3. Returns the SSR'd HTML for every non-asset request
 *
 * For production, build separately:
 *   vite build                                                  # client bundle
 *   vite build --ssr src/entry-server.ts --outDir dist/server   # server bundle
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join as pathJoin } from 'node:path'
import {
  type CollapsibleSite,
  generateContext,
  scanCollapsibleSites,
  transformDeferInline,
  transformJSX,
} from '@pyreon/compiler'
import type { CollapseResolver } from './rocketstyle-collapse'
import type { Plugin, ViteDevServer } from 'vite'

// Lazy — the resolver module (and its `vite` SSR machinery) must NOT be
// on the static import path of this cheap entry. It loads ONLY when
// `pyreon({ collapse })` is enabled AND a collapsible site is scanned;
// collapse-off consumers never pull it (bundle-budget + cold-load).
let _createCollapseResolver:
  | ((root: string) => Promise<CollapseResolver>)
  | null = null
async function loadCreateCollapseResolver(): Promise<
  (root: string) => Promise<CollapseResolver>
> {
  if (!_createCollapseResolver) {
    _createCollapseResolver = (await import('./rocketstyle-collapse')).createCollapseResolver
  }
  return _createCollapseResolver
}

// Virtual module ID for the HMR runtime
const HMR_RUNTIME_ID = '\0pyreon/hmr-runtime'
const HMR_RUNTIME_IMPORT = 'virtual:pyreon/hmr-runtime'

// Virtual module ID for the auto-generated islands registry. See
// `prescanIslandDeclarations` + the `load` hook for emit shape. Consumed by
// `hydrateIslandsAuto()` in `@pyreon/server/client`.
const ISLANDS_REGISTRY_ID = '\0pyreon/islands-registry'
const ISLANDS_REGISTRY_IMPORT = 'virtual:pyreon/islands-registry'

export type CompatFramework = 'react' | 'preact' | 'vue' | 'solid' | 'svelte'

export interface PyreonPluginOptions {
  /**
   * Alias imports from an existing framework to Pyreon's compat layer.
   *
   * This lets you drop Pyreon into an existing project with zero code changes —
   * `import { useState } from "react"` will resolve to `@pyreon/react-compat`.
   *
   * @example
   * pyreon({ compat: "react" })   // react + react-dom → @pyreon/react-compat
   * pyreon({ compat: "vue" })     // vue → @pyreon/vue-compat
   * pyreon({ compat: "solid" })   // solid-js → @pyreon/solid-compat
   * pyreon({ compat: "svelte" })  // svelte + svelte/store → @pyreon/svelte-compat
   * pyreon({ compat: "preact" })  // preact + hooks + signals → @pyreon/preact-compat
   */
  compat?: CompatFramework

  /**
   * Enable SSR dev middleware.
   *
   * Pass an object with `entry` pointing to your server entry file.
   * The entry must export a `handler` function: `(req: Request) => Promise<Response>`
   * or a default export of the same type.
   *
   * @example
   * pyreonPlugin({ ssr: { entry: "./src/entry-server.ts" } })
   */
  ssr?: {
    /** Server entry file path (e.g. "./src/entry-server.ts") */
    entry: string
  }

  /**
   * Auto-discover `island()` declarations and expose them as
   * `virtual:pyreon/islands-registry` for `hydrateIslandsAuto()` in
   * `@pyreon/server/client`.
   *
   * Eliminates the manual sync between `island()` declarations and the
   * client-side `hydrateIslands({ ... })` registry — typo / forgotten entry /
   * registry drift is the #1 author foot-gun for islands.
   *
   * Defaults to `true`. The prescan is cheap (regex over the same files
   * already walked by `prescanSignalExports`); set to `false` only if you
   * have a reason not to support `hydrateIslandsAuto()`.
   *
   * `hydrate: 'never'` islands are deliberately OMITTED from the auto-
   * registry — the whole point of the strategy is shipping zero client JS,
   * so registering a loader (which would pull the component module into the
   * client bundle graph) defeats it.
   *
   * @example
   * pyreon({ islands: true })
   *
   * // src/entry-client.ts
   * import { hydrateIslandsAuto } from '@pyreon/server/client'
   * hydrateIslandsAuto()
   */
  islands?: boolean

  /**
   * P0 — opt-in compile-time rocketstyle wrapper collapse. `true` uses
   * the default provider/theme/mode wiring (PyreonUI + theme +
   * useMode from @pyreon/ui-core / @pyreon/ui-theme). Pass an object to
   * override. OFF by default (zero behaviour change). When on, the
   * plugin SSR-resolves every literal-prop call site of a candidate
   * component (real component, light + dark) and the compiler collapses
   * the 5-layer wrapper mount into a single `_rsCollapse` cloneNode.
   * Only the CLIENT graph is collapsed — the SSR graph keeps the normal
   * mount (and the resolver itself uses SSR render).
   *
   * @example pyreon({ collapse: true })
   * @example pyreon({ collapse: { components: ['Button', 'Badge'] } })
   */
  collapse?: boolean | PyreonCollapseOptions
}

export interface PyreonCollapseOptions {
  /**
   * Import sources whose components may collapse. Default:
   * `['@pyreon/ui-components']`. The compiler's AST scan only considers
   * a call site whose component was imported from one of these sources;
   * the conservative bail catalogue + the SSR resolver are the real
   * gate beyond that.
   */
  sources?: string[]
  /**
   * Optional local-name allowlist applied AFTER the source scan
   * (e.g. `['Button']`). Omit to collapse every collapsible component
   * from the configured sources.
   */
  components?: string[]
  /** Override the theme/mode provider. Default PyreonUI@@pyreon/ui-core. */
  provider?: { name: string; source: string }
  /** Override the theme object. Default theme@@pyreon/ui-theme. */
  theme?: { name: string; source: string }
  /** Override the live mode accessor. Default useMode@@pyreon/ui-core. */
  mode?: { name: string; source: string }
}

// ── Compat alias maps ─────────────────────────────────────────────────────────

const COMPAT_ALIASES: Record<CompatFramework, Record<string, string>> = {
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
    'preact/jsx-runtime': '@pyreon/preact-compat/jsx-runtime',
    'preact/jsx-dev-runtime': '@pyreon/preact-compat/jsx-runtime',
    '@preact/signals': '@pyreon/preact-compat/signals',
  },
  vue: {
    vue: '@pyreon/vue-compat',
    'vue/jsx-runtime': '@pyreon/vue-compat/jsx-runtime',
    'vue/jsx-dev-runtime': '@pyreon/vue-compat/jsx-runtime',
  },
  solid: {
    'solid-js': '@pyreon/solid-compat',
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
function isPyreonWorkspaceFile(id: string, cache: Map<string, boolean>): boolean {
  // Strip query strings (e.g. `?vue&type=script`) to get the bare path.
  const queryIdx = id.indexOf('?')
  const filePath = queryIdx === -1 ? id : id.slice(0, queryIdx)
  if (!filePath || filePath[0] === '\0') return false

  // Path-based filter first (cheap): file must live under `<root>/packages/`
  // and not under `<root>/examples/`. This excludes example apps even when
  // they have `@pyreon/example-*` names.
  if (!filePath.includes('/packages/') || filePath.includes('/examples/')) {
    return false
  }

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
        isPyreon = typeof pkg.name === 'string' && pkg.name.startsWith('@pyreon/')
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
function getCompatTarget(compat: CompatFramework | undefined, id: string): string | undefined {
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

/**
 * Scan the consumer's package.json for `@pyreon/*` deps. Result is the
 * list of names to exclude from Vite's deps optimizer (avoids
 * `.vite/deps/@pyreon_*.js: File does not exist` runtime errors caused
 * by esbuild trying to pre-bundle TypeScript source files exposed via
 * the `bun` resolve condition).
 *
 * Reads dependencies + devDependencies + peerDependencies. Best-effort:
 * missing/malformed package.json returns an empty list so a typo in
 * the consumer's manifest doesn't break the build.
 */
function scanPyreonDeps(root: string): string[] {
  const pkgPath = pathJoin(root, 'package.json')
  if (!existsSync(pkgPath)) return []
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    const all = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    }
    return Object.keys(all).filter((name) => name.startsWith('@pyreon/'))
  } catch {
    return []
  }
}

export default function pyreonPlugin(options?: PyreonPluginOptions): Plugin {
  const ssrConfig = options?.ssr
  const compat = options?.compat
  // Default islands support to enabled — the prescan is cheap and the virtual
  // module is harmless if the user has no `island()` calls. Opt out only if
  // you have a specific reason.
  const islandsEnabled = options?.islands !== false

  // ── P0 rocketstyle-collapse config (opt-in) ───────────────────────────────
  const collapseOpt = options?.collapse
  const collapseEnabled = collapseOpt === true || (collapseOpt != null && collapseOpt !== false)
  const collapseUserCfg: PyreonCollapseOptions =
    collapseOpt && collapseOpt !== true ? collapseOpt : {}
  const collapseProvider = collapseUserCfg.provider ?? {
    name: 'PyreonUI',
    source: '@pyreon/ui-core',
  }
  const collapseTheme = collapseUserCfg.theme ?? { name: 'theme', source: '@pyreon/ui-theme' }
  const collapseMode = collapseUserCfg.mode ?? { name: 'useMode', source: '@pyreon/ui-core' }
  const collapseSources = new Set(collapseUserCfg.sources ?? ['@pyreon/ui-components'])
  const collapseComponentFilter = collapseUserCfg.components
    ? (n: string) => collapseUserCfg.components!.includes(n)
    : null
  // Lazily created on first client-graph transform; one Vite SSR server
  // reused for every resolve in the build. Disposed in closeBundle.
  let collapseResolver: import('./rocketstyle-collapse').CollapseResolver | null = null
  let collapseResolverInit: Promise<
    import('./rocketstyle-collapse').CollapseResolver | null
  > | null = null

  /**
   * Lazily spin ONE programmatic Vite SSR server (bound to the project's
   * own vite config) the first time a client-graph module actually has a
   * collapsible call site. Memoized via `collapseResolverInit` so
   * concurrent transforms share the single server. Returns null if the
   * server fails to start (graceful — every call site then keeps its
   * normal rocketstyle mount).
   */
  function ensureCollapseResolver(): Promise<
    import('./rocketstyle-collapse').CollapseResolver | null
  > {
    if (collapseResolver) return Promise.resolve(collapseResolver)
    if (collapseResolverInit) return collapseResolverInit
    collapseResolverInit = loadCreateCollapseResolver()
      .then((create) => create(projectRoot))
      .then((r) => {
        collapseResolver = r
        return r
      })
      .catch(() => null)
    return collapseResolverInit
  }

  let isBuild = false
  // Collapse is build-only by design: the resolver computes each site's
  // class from a SEPARATE nested Vite SSR server's module graph and caches
  // it. In dev that frozen class would NOT react to the user's theme-source
  // HMR edits — strictly worse than the normal mount, which IS reactive.
  // So dev keeps the normal mount; we surface that ONCE so an opted-in
  // consumer running `vite dev` isn't left wondering why nothing collapsed.
  let warnedDevCollapse = false
  let projectRoot = ''

  // ── Cross-module signal export registry ─────────────────────────────────
  // Tracks which modules export signal() declarations so imported signals
  // can be auto-called in JSX across file boundaries.
  // Key: normalized module ID, Value: set of exported signal names
  const signalExportRegistry = new Map<string, Set<string>>()
  // Cache resolved import specifiers to avoid redundant resolution calls
  const resolveCache = new Map<string, string | null>()
  // Cache `isPyreonWorkspaceFile` lookups by directory — package.json reads
  // happen at most once per containing directory across the build.
  const pyreonWorkspaceDirCache = new Map<string, boolean>()

  // ── Island declaration registry ─────────────────────────────────────────
  // Tracks every `island(() => import('PATH'), { name: 'X', hydrate: 'Y' })`
  // call across the source tree. Keyed by absolute source-file path of the
  // declaration site so HMR can invalidate per-file. Each entry's loader path
  // is resolved relative to the file where the call was written.
  const islandRegistry = new Map<string, IslandDecl[]>()

  return {
    name: 'pyreon',
    enforce: 'pre',

    config(userConfig, env) {
      isBuild = env.command === 'build'
      // Capture the project root for package resolution in resolveId
      projectRoot = userConfig.root ?? process.cwd()

      // Tell Vite's dep scanner not to pre-bundle the aliased framework imports —
      // they resolve to workspace packages via our resolveId hook, not node_modules.
      const compatExclude = compat ? Object.keys(COMPAT_ALIASES[compat]) : []
      // Auto-detect `@pyreon/*` deps in the consumer's package.json and add
      // them to optimizeDeps.exclude. Vite's deps optimizer pre-bundles
      // node_modules deps via esbuild, but the plugin's `bun` resolve
      // condition redirects every `@pyreon/*` import to source `.ts(x)`
      // files. Esbuild's pre-bundler can't process raw TS source from a
      // published package and silently produces broken bundles in
      // `.vite/deps/`, surfacing as `File does not exist at
      // .../node_modules/.vite/deps/@pyreon_styler.js` errors at runtime.
      // Excluding them sidesteps the optimizer entirely — they're resolved
      // on demand via the plugin's resolveId hook + Vite's normal source
      // pipeline. Workspace-linked apps in this monorepo aren't affected
      // because Vite never tries to pre-bundle workspace deps.
      const pyreonExclude = scanPyreonDeps(projectRoot)
      const optimizeDepsExclude = Array.from(
        new Set([...compatExclude, ...pyreonExclude]),
      )

      // Always set OXC's JSX importSource to `@pyreon/core`. In compat mode,
      // we redirect `@pyreon/core/jsx-runtime` imports to the compat package
      // VIA `resolveId` — but ONLY for user code, never for `@pyreon/*`
      // workspace-package files (zero, router, runtime-dom, etc.). Setting
      // OXC's importSource directly to the compat package would force the
      // compat runtime on framework internals too, which they cannot handle.
      const jsxSource = '@pyreon/core'

      return {
        // Use "bun" condition for workspace resolution — source .ts/.tsx files
        // for HMR, fast refresh, and type-safe imports.
        resolve: { conditions: ['bun'] },
        optimizeDeps: {
          exclude: optimizeDepsExclude,
        },
        // Vite 8 uses oxc for JSX transform (not esbuildOptions or rolldownOptions)
        oxc: {
          jsx: {
            runtime: 'automatic',
            importSource: jsxSource,
          },
        },
        // In SSR build mode, configure the entry
        ...(env.isSsrBuild && ssrConfig
          ? {
              build: {
                ssr: true,
                rollupOptions: {
                  input: ssrConfig.entry,
                },
              },
            }
          : {}),
      }
    },

    // ── Pre-scan all source files for signal exports ──────────────────────
    async buildStart() {
      // Pre-scan all source files for signal exports so the registry
      // is complete before any transforms run. This solves the build
      // ordering problem where component.tsx is transformed before
      // store.ts — without pre-scanning, the registry would be empty.
      await prescanSignalExports(projectRoot, signalExportRegistry)

      // Mirror prescan for `island()` declarations. The result populates
      // `virtual:pyreon/islands-registry`, consumed by `hydrateIslandsAuto()`
      // in `@pyreon/server/client`. Eliminates the manual sync between
      // `island()` source-of-truth and the client `hydrateIslands({ ... })`
      // call — the #1 author foot-gun for islands.
      if (islandsEnabled) {
        await prescanIslandDeclarations(projectRoot, islandRegistry)
      }
    },

    // @internal — debug accessor for tests; returns live references to
    // the per-instance caches so `cache-eviction-on-delete.test.ts` can
    // assert on contents. Symbol.for-keyed so it's not part of the
    // plugin's documented surface but stays stable across reloads.
    [Symbol.for('pyreon/vite-plugin:caches')]: {
      signalExportRegistry,
      resolveCache,
      pyreonWorkspaceDirCache,
      islandRegistry,
    },

    // ── Cache invalidation on file delete (long-running `vite dev`) ─────
    // Vite's `watchChange` hook fires on filesystem events for files in
    // the watched module graph. Without this, the four per-instance
    // caches (`signalExportRegistry`, `resolveCache`, `islandRegistry`,
    // `pyreonWorkspaceDirCache`) accumulated stale entries for the
    // entire lifetime of the dev server — a long `vite dev` session
    // that edited / renamed / deleted source files would grow each
    // cache by one entry per dead file. Bounded by total source tree
    // size in practice, but a real leak over hours of editing.
    //
    // `'create' | 'update'` events are handled implicitly by the
    // existing transform-time `scanSignalExports` /
    // `scanIslandDeclarations` calls — they re-populate the registry
    // every time a file's `transform` hook fires, overwriting any
    // stale entry. So watchChange only needs to handle `'delete'`.
    watchChange(id: string, change: { event: 'create' | 'update' | 'delete' }) {
      if (change.event !== 'delete') return

      const normalized = normalizeModuleId(id)

      // 1) signalExportRegistry — keyed by normalized module id.
      signalExportRegistry.delete(normalized)

      // 2) islandRegistry — keyed by absolute source path of the
      //    declaration site (the original `id`, not normalized).
      islandRegistry.delete(id)
      // Also try the normalized form just in case the registry was
      // populated with a slightly different shape.
      if (normalized !== id) islandRegistry.delete(normalized)

      // 3) resolveCache — keyed by `${importer}::${source}` where
      //    `importer` is normalized AND values can be the deleted
      //    file's resolved path. Sweep both directions:
      //    a) entries WHERE the deleted file is the importer (this
      //       file's resolved imports are no longer relevant).
      //    b) entries WHERE the deleted file is the resolved value
      //       (other files importing the deleted file need to
      //       re-resolve so they see `null` next time).
      const importerPrefix = `${normalized}::`
      for (const [key, value] of resolveCache) {
        if (key.startsWith(importerPrefix) || value === normalized) {
          resolveCache.delete(key)
        }
      }

      // 4) pyreonWorkspaceDirCache — keyed by DIRECTORY, not file. A
      //    single file deletion doesn't invalidate the directory's
      //    workspace status (other files may still live there), so
      //    this cache stays. Bounded by source-tree directory count
      //    in any case (small + finite).
    },

    // Tear down the one programmatic Vite SSR server the collapse
    // resolver holds (created lazily on first client-graph transform).
    async closeBundle() {
      if (collapseResolver) {
        await collapseResolver.dispose()
        collapseResolver = null
        collapseResolverInit = null
      }
    },

    // ── Virtual module + compat alias resolution ─────────────────────────────
    async resolveId(id, importer) {
      if (id === HMR_RUNTIME_IMPORT) return HMR_RUNTIME_ID
      if (id === ISLANDS_REGISTRY_IMPORT) return ISLANDS_REGISTRY_ID

      // `@pyreon/core/jsx-runtime` resolves to the compat package only for
      // user code — never for `@pyreon/*` framework files (zero, router,
      // runtime-dom, etc.). Without this importer guard, every JSX file in
      // the build (including framework internals resolved via the `bun`
      // workspace condition) would get redirected to a compat runtime that
      // doesn't match the framework's JSX shape. Caught by `cpa-smoke-app-*-compat`.
      if (
        compat &&
        (id === '@pyreon/core/jsx-runtime' || id === '@pyreon/core/jsx-dev-runtime') &&
        importer &&
        isPyreonWorkspaceFile(importer, pyreonWorkspaceDirCache)
      ) {
        return // let Vite resolve to the real `@pyreon/core/jsx-runtime`
      }

      const target = getCompatTarget(compat, id)
      if (!target) return

      // Vite 8 resolves the "bun" condition natively via resolve.conditions.
      // Delegate to Vite's resolver instead of manual package.json parsing.
      const resolved = await this.resolve(target, importer, { skipSelf: true })
      return resolved?.id
    },

    load(id) {
      if (id === HMR_RUNTIME_ID) {
        return HMR_RUNTIME_SOURCE
      }
      if (id === ISLANDS_REGISTRY_ID) {
        return renderIslandsRegistry(islandRegistry, islandsEnabled)
      }
    },

    async transform(code, id, transformOptions) {
      const ext = getExt(id)
      if (ext !== '.tsx' && ext !== '.jsx' && ext !== '.pyreon') return

      // In compat mode, skip Pyreon's reactive JSX transform but apply
      // attribute renames (className → class, htmlFor → for) so source code
      // that uses React-style attribute names works correctly.
      if (
        compat === 'react' ||
        compat === 'preact' ||
        compat === 'vue' ||
        compat === 'solid' ||
        compat === 'svelte'
      ) {
        if (compat === 'react' || compat === 'preact') {
          const transformed = transformCompatAttributes(code)
          if (transformed !== code) return { code: transformed, map: null }
        }
        return
      }

      // ── Scan for exported signal declarations (populate registry) ──────
      // This runs on every .tsx/.jsx file so the registry is built
      // incrementally. buildStart pre-scans all files, but this handles
      // files created/modified after buildStart (dev mode HMR).
      scanSignalExports(code, normalizeModuleId(id), signalExportRegistry)

      // ── Same incremental update for island() declarations ──────────────
      // HMR: when a user adds/renames/removes an island() call, the
      // virtual:pyreon/islands-registry module needs to reflect it on the
      // next dev-server module reload.
      if (islandsEnabled) scanIslandDeclarations(code, id, islandRegistry)

      // ── Inline-Defer pre-pass ──────────────────────────────────────────
      // Rewrites `<Defer when={x}><Modal /></Defer>` into the explicit
      // chunk-prop form so Rolldown emits a proper per-Defer chunk and
      // the main bundle drops the static `import { Modal } from ...`
      // when it's exclusively used inside this Defer's subtree. Runs
      // BEFORE the JSX→runtime transform so the downstream pipeline
      // sees an already-explicit `<Defer chunk={...}>` shape with no
      // special-casing needed in `transformJSX`. See
      // `@pyreon/compiler/defer-inline` for the rewrite contract.
      const deferResult = transformDeferInline(code, id)
      const sourceForJsx = deferResult.changed ? deferResult.code : code
      for (const w of deferResult.warnings) {
        this.warn(`${w.message} (${id}:${w.line}:${w.column})`)
      }

      // ── Resolve imported signals from the registry ─────────────────────
      // Check each import in this file: if the imported module has signal
      // exports in the registry, pass them as knownSignals to the compiler.
      const knownSignals = await resolveImportedSignals(sourceForJsx, id, signalExportRegistry, this, resolveCache)

      // Vite passes `ssr: true` when transforming for the SSR module graph
      // (both build --ssr and dev `ssrLoadModule`). The compiler emits plain
      // `h()` calls in that mode so `runtime-server` can render to a string.
      const isSsr = transformOptions?.ssr === true

      // ── P0 rocketstyle-collapse (opt-in, CLIENT graph only) ────────────
      // Never collapse the SSR graph: renderToString needs the real
      // VNode tree, AND the resolver itself SSR-renders the component —
      // collapsing the SSR graph would be circular. Resolve every
      // scanned literal-prop site once (real component, light + dark)
      // and hand the compiler a key→emission map; the compiler's AST
      // bail catalogue is the real gate, an unresolved key just falls
      // back to the normal mount.
      let collapseRocketstyle:
        | NonNullable<Parameters<typeof transformJSX>[2]>['collapseRocketstyle']
        | undefined
      if (collapseEnabled && !isBuild && !isSsr && !warnedDevCollapse) {
        warnedDevCollapse = true
        this.info(
          '[Pyreon] collapse is build-only — `vite dev` keeps the normal rocketstyle mount so theme-source edits stay HMR-reactive. Production `vite build` collapses the literal-prop sites.',
        )
      }
      if (collapseEnabled && isBuild && !isSsr) {
        const scanned: CollapsibleSite[] = scanCollapsibleSites(
          sourceForJsx,
          id,
          collapseSources,
        ).filter((s) => !collapseComponentFilter || collapseComponentFilter(s.componentName))
        if (scanned.length > 0) {
          const resolver = await ensureCollapseResolver()
          if (resolver) {
            const sites = new Map<
              string,
              {
                templateHtml: string
                lightClass: string
                darkClass: string
                rules: string[]
                ruleKey: string
              }
            >()
            const candidates = new Set<string>()
            for (const s of scanned) {
              const resolved = await resolver.resolve({
                component: { name: s.importedName, source: s.source },
                props: s.props,
                childrenText: s.childrenText,
                config: {
                  provider: collapseProvider,
                  theme: collapseTheme,
                  mode: collapseMode,
                },
              })
              if (!resolved) continue
              candidates.add(s.componentName)
              sites.set(s.key, {
                templateHtml: resolved.templateHtml,
                lightClass: resolved.lightClass,
                darkClass: resolved.darkClass,
                rules: resolved.rules,
                ruleKey: resolved.key,
              })
            }
            if (sites.size > 0) {
              collapseRocketstyle = { candidates, sites, mode: collapseMode }
            }
          }
        }
      }

      const result = transformJSX(sourceForJsx, id, {
        ssr: isSsr,
        knownSignals,
        ...(collapseRocketstyle ? { collapseRocketstyle } : {}),
      })
      // Surface compiler warnings in the terminal
      for (const w of result.warnings) {
        this.warn(`${w.message} (${id}:${w.line}:${w.column})`)
      }

      let output = result.code

      // ── Dev-only transforms ────────────────────────────────────────────
      if (!isBuild) {
        output = injectHmr(output, id)
        // Inject debug names for signal() calls not rewritten by HMR
        output = injectSignalNames(output)
      }

      // R12: surface the compiler's V3 source map so stack traces /
      // breakpoints in Pyreon components resolve to the right source line
      // (the JS backend now emits one; substitutions shift line counts, so
      // `map: null` previously mislocated every frame app-wide). Exact in
      // build; in dev the small extra HMR / signal-name injections aren't
      // re-mapped (still vastly better than no map). The native backend
      // emits no map yet (its own scoped follow-up) → `null`, unchanged
      // behaviour for that path.
      return { code: output, map: result.map ?? null }
    },

    // ── SSR dev middleware ───────────────────────────────────────────────────
    configureServer(server: ViteDevServer) {
      // Generate .pyreon/context.json for AI tools on dev server start
      generateProjectContext(projectRoot)

      // Debounced regeneration on file changes
      let contextTimer: ReturnType<typeof setTimeout> | null = null
      server.watcher.on('change', (file) => {
        if (/\.(tsx|jsx|ts|js)$/.test(file) && !file.includes('node_modules')) {
          if (contextTimer) clearTimeout(contextTimer)
          contextTimer = setTimeout(() => generateProjectContext(projectRoot), 500)
        }
      })

      if (!ssrConfig) return

      // Return a function so the middleware runs AFTER Vite's built-in middleware
      // (static files, HMR, etc.) — only handle requests that Vite doesn't serve.
      return () => {
        server.middlewares.use(async (req, res, next) => {
          if (req.method !== 'GET') return next()
          const url = req.url ?? '/'
          if (isAssetRequest(url)) return next()

          try {
            await handleSsrRequest(server, ssrConfig.entry, url, req, res, next)
          } catch (err) {
            server.ssrFixStacktrace(err as Error)
            next(err)
          }
        })
      }
    },
  }
}

async function handleSsrRequest(
  server: ViteDevServer,
  entry: string,
  url: string,
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  next: (err?: unknown) => void,
): Promise<void> {
  const mod = await server.ssrLoadModule(entry)
  const handler = mod.handler ?? mod.default

  if (typeof handler !== 'function') {
    next()
    return
  }

  const origin = `http://${req.headers.host ?? 'localhost'}`
  const fullUrl = new URL(url, origin)
  const request = new Request(fullUrl.href, {
    method: req.method ?? 'GET',
    headers: Object.entries(req.headers).reduce((h, [k, v]) => {
      if (v) h.set(k, Array.isArray(v) ? v.join(', ') : v)
      return h
    }, new Headers()),
  })

  const response: Response = await handler(request)
  let html = await response.text()

  html = await server.transformIndexHtml(url, html)

  res.statusCode = response.status
  response.headers.forEach((v, k) => {
    res.setHeader(k, v)
  })
  res.end(html)
}

// ── AI context generation ─────────────────────────────────────────────────────

/**
 * Generate .pyreon/context.json — project map for AI coding assistants.
 * Delegates to @pyreon/compiler's unified project scanner.
 */
function generateProjectContext(root: string): void {
  try {
    const context = generateContext(root)
    const outDir = pathJoin(root, '.pyreon')
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
    writeFileSync(pathJoin(outDir, 'context.json'), JSON.stringify(context, null, 2), 'utf-8')
  } catch {
    // Silently fail — context generation is best-effort
  }
}

// ── HMR injection ─────────────────────────────────────────────────────────────

/**
 * Regex that detects signal declarations (prefix + variable name).
 * The arguments are extracted via balanced-paren matching in `injectHmr`.
 * A brace-depth check filters out matches inside functions/blocks — only
 * module-scope (depth 0) signals are rewritten for HMR state preservation.
 *
 * The optional `<...>` group accepts a TypeScript type parameter so that
 * `signal<T>(initial)` declarations are also rewritten — without it, any
 * generic-typed module-scope signal silently skipped HMR preservation.
 *
 * The inner `(?:[^<>]|<[^<>]*>)*` permits one level of generic nesting
 * (e.g. `signal<Array<Row>>([])`, `signal<Map<string, number>>(m)`).
 * Deeper nesting (`signal<Array<{ id: T<U> }>>(...)`) falls back to
 * not-rewritten — tracked as a follow-up if real consumers need it,
 * but unlikely at module scope where generics are usually shallow.
 */
const SIGNAL_PREFIX_RE =
  /^((?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*)signal(?:<(?:[^<>]|<[^<>]*>)*>)?\(/gm

/**
 * Detect whether the module exports any component-like functions
 * (uppercase first letter — standard convention for JSX components).
 */
const EXPORT_COMPONENT_RE =
  /export\s+(?:default\s+)?(?:function\s+([A-Z]\w*)|const\s+([A-Z]\w*)\s*[=:])/

function skipStringLiteral(code: string, start: number, quote: string): number {
  let j = start + 1
  while (j < code.length) {
    if (code[j] === '\\') {
      j += 2
      continue
    }
    if (code[j] === quote) break
    j++
  }
  return j
}

function extractBalancedArgs(code: string, start: number): string | null {
  let depth = 1
  for (let i = start; i < code.length; i++) {
    const ch = code[i]
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return code.slice(start, i)
    } else if (ch === '"' || ch === "'" || ch === '`') {
      i = skipStringLiteral(code, i, ch)
    }
  }
  return null
}

/**
 * Compute brace depth at position `pos` — returns 0 for module scope.
 * Skips string literals to avoid counting braces inside strings.
 */
function braceDepthAt(code: string, pos: number): number {
  let depth = 0
  for (let i = 0; i < pos; i++) {
    const ch = code[i]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    else if (ch === '"' || ch === "'" || ch === '`') {
      i = skipStringLiteral(code, i, ch)
    }
  }
  return depth
}

/** Rewrite module-scope `signal()` calls to `__hmr_signal()` for state preservation. */
function rewriteSignals(code: string, moduleId: string): string {
  const escapedId = JSON.stringify(moduleId)
  const matches: {
    start: number
    end: number
    prefix: string
    name: string
    args: string
  }[] = []
  let m: RegExpExecArray | null = SIGNAL_PREFIX_RE.exec(code)
  while (m !== null) {
    const argsStart = m.index + m[0].length
    const args = extractBalancedArgs(code, argsStart)
    if (args === null) {
      m = SIGNAL_PREFIX_RE.exec(code)
      continue // unbalanced — skip
    }
    // Only rewrite module-scope signals (brace depth 0).
    if (braceDepthAt(code, m.index) === 0) {
      matches.push({
        start: m.index,
        end: argsStart + args.length + 1, // +1 for closing paren
        prefix: m[1] ?? '',
        name: m[2] ?? '',
        args,
      })
    }
    m = SIGNAL_PREFIX_RE.exec(code)
  }
  SIGNAL_PREFIX_RE.lastIndex = 0

  // Replace in reverse to preserve offsets
  let output = code
  for (let i = matches.length - 1; i >= 0; i--) {
    const { start, end, prefix, name, args } = matches[i] as (typeof matches)[number]
    const replacement = `${prefix}__hmr_signal(${escapedId}, ${JSON.stringify(name)}, signal, ${args})`
    output = output.slice(0, start) + replacement + output.slice(end)
  }
  return output
}

/** Check if an argument string contains a top-level comma (i.e. has multiple arguments). */
function hasMultipleArgs(args: string): boolean {
  let depth = 0
  for (const ch of args) {
    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') depth--
    else if (ch === ',' && depth === 0) return true
  }
  return false
}

/**
 * Inject `{ name: "varName" }` into signal() calls that don't already have
 * an options argument. Only runs in dev mode for debugging/devtools.
 *
 * `const count = signal(0)` → `const count = signal(0, { name: "count" })`
 *
 * Module-scope signals rewritten to __hmr_signal() are naturally skipped
 * because the regex matches `signal(` not `__hmr_signal(`.
 */
function injectSignalNames(code: string): string {
  const re = /(?:const|let)\s+(\w+)\s*=\s*signal\(/gm
  const matches: { start: number; end: number; name: string; args: string }[] = []

  let m: RegExpExecArray | null = re.exec(code)
  while (m !== null) {
    const argsStart = m.index + m[0].length
    const args = extractBalancedArgs(code, argsStart)
    if (args !== null && !hasMultipleArgs(args)) {
      matches.push({ start: argsStart, end: argsStart + args.length, name: m[1] ?? '', args })
    }
    m = re.exec(code)
  }
  re.lastIndex = 0

  let output = code
  for (let i = matches.length - 1; i >= 0; i--) {
    const { start, end, name, args } = matches[i] as (typeof matches)[number]
    output = `${output.slice(0, start)}${args}, { name: ${JSON.stringify(name)} }${output.slice(end)}`
  }
  return output
}

function injectHmr(code: string, moduleId: string): string {
  const hasSignals = SIGNAL_PREFIX_RE.test(code)
  SIGNAL_PREFIX_RE.lastIndex = 0

  const hasComponentExport = EXPORT_COMPONENT_RE.test(code)

  // Only inject HMR if the module exports components or has module-scope signals
  if (!hasComponentExport && !hasSignals) return code

  let output = hasSignals ? rewriteSignals(code, moduleId) : code

  // Build the HMR footer
  const escapedId = JSON.stringify(moduleId)
  const lines: string[] = []

  if (hasSignals) {
    lines.push(`import { __hmr_signal, __hmr_dispose } from "${HMR_RUNTIME_IMPORT}";`)
  }

  lines.push(`if (import.meta.hot) {`)

  if (hasSignals) {
    lines.push(`  import.meta.hot.dispose(() => __hmr_dispose(${escapedId}));`)
  }

  // Self-accept the module, then drive Pyreon's HMR coordinator.
  //
  // The OLD code emitted a bare `import.meta.hot.accept()` (no callback):
  // Vite re-evaluated the module but NOTHING re-rendered the mounted tree,
  // AND the self-accept suppressed Vite's full-reload fallback — so a
  // component/JSX edit produced a silently-stale UI until a MANUAL refresh.
  //
  // Now: the accept callback hands the FRESH module namespace Vite already
  // re-evaluated straight to `globalThis.__pyreon_hmr_swap__` (registered
  // by `@pyreon/router` in a dev browser — zero import coupling, same
  // pattern as the perf-harness counter sink), keyed by THIS module's id.
  // The coordinator finds every active matched route record whose lazy
  // `_hmrId` matches and swaps in the new component, re-rendering ONLY
  // that subtree IN PLACE (no page reload → `__pyreon_hmr_registry__`
  // survives → `__hmr_signal` restores module-scope signal values).
  //
  // Using the namespace Vite passes (not a re-run of the lazy thunk)
  // sidesteps the stale-`?t=` trap: the dynamic-import thunk lives in the
  // virtual routes module, which is NOT invalidated when this leaf route
  // self-accepts — re-importing it would return the OLD module.
  //
  // `__pyreon_hmr_swap__` returns falsy when the edit was outside the
  // active route tree (nested non-route component, unrelated route,
  // signal-only module) OR no coordinator is registered (plain
  // `@pyreon/runtime-dom` app, or module loaded before any router
  // mounted). Then `import.meta.hot.invalidate()` → Vite propagates → an
  // AUTOMATIC full reload. Either way the user never refreshes by hand.
  lines.push(`  import.meta.hot.accept((__m) => {`)
  lines.push(`    const __s = globalThis.__pyreon_hmr_swap__;`)
  lines.push(
    `    if (typeof __s === "function" && __m && __s(${escapedId}, __m)) return;`,
  )
  lines.push(`    import.meta.hot.invalidate();`)
  lines.push(`  });`)
  lines.push(`}`)

  output = `${output}\n\n${lines.join('\n')}\n`

  return output
}

// ── Compat attribute transforms ──────────────────────────────────────────────

/**
 * Transform React-style JSX attribute names to standard HTML attribute names.
 * This is a lightweight string transform that runs on JSX source before OXC's
 * JSX transform converts it to jsx() calls.
 *
 * - `className` → `class`
 * - `htmlFor` → `for`
 *
 * Only matches attribute position in JSX (after `<tag ` or whitespace).
 * Does not transform property access (e.g. `props.className` stays as-is since
 * the compat JSX runtime handles that at call time).
 */
function transformCompatAttributes(code: string): string {
  // Match className/htmlFor in JSX attribute position:
  // After < and tag name, or after whitespace between attributes
  // Pattern: word boundary + attribute name + = (with optional whitespace)
  return code
    .replace(/(\s)className(\s*=)/g, '$1class$2')
    .replace(/(\s)htmlFor(\s*=)/g, '$1for$2')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getExt(id: string): string {
  const clean = id.split('?')[0] ?? id
  const dot = clean.lastIndexOf('.')
  return dot >= 0 ? clean.slice(dot) : ''
}

/** Skip Vite-handled asset requests (CSS, images, HMR, etc.) */
function isAssetRequest(url: string): boolean {
  return (
    url.startsWith('/@') || // @vite/client, @id, @fs, etc.
    url.startsWith('/__') || // __open-in-editor, etc.
    url.includes('/node_modules/') ||
    /\.(css|js|ts|tsx|jsx|json|ico|png|jpg|jpeg|gif|svg|woff2?|ttf|eot|map)(\?|$)/.test(url)
  )
}

// ── HMR runtime source (served as virtual module) ─────────────────────────────
//
// Inlined here so it's available without a filesystem read. This is the
// compiled-to-JS version of hmr-runtime.ts — kept in sync manually.

// ─── Cross-module signal auto-call helpers ──────────────────────────────────

/**
 * Normalize a Vite module ID by stripping query strings (?v=..., ?t=...)
 * and resolving to an absolute path for consistent registry lookups.
 */
function normalizeModuleId(id: string): string {
  const queryIndex = id.indexOf('?')
  return queryIndex >= 0 ? id.slice(0, queryIndex) : id
}

// ─── Island declaration scanner ────────────────────────────────────────────

/**
 * One island() call site discovered in source.
 *
 * `loaderAbsPath` is the dynamic-import target resolved relative to the
 * source file where the call was written. Vite's resolver finds the actual
 * file (.tsx / .jsx / .ts / .js extension auto-added) when the registry
 * module emits `() => import('<loaderAbsPath>')`.
 */
interface IslandDecl {
  name: string
  hydrate: string
  loaderAbsPath: string
}

/**
 * Pre-scan all source files in the project for `island()` declarations.
 *
 * Called from `buildStart` (when `islands: true`) so the registry is fully
 * populated before any transforms run. Mirrors `prescanSignalExports` shape;
 * the per-file regex pattern matches:
 *
 *   island(() => import('PATH'), { name: 'NAME', hydrate: 'STRATEGY' })
 *
 * Edge cases the regex deliberately doesn't cover (user falls back to manual
 * `hydrateIslands({ ... })`):
 *   - Loader is a variable, not an inline arrow: `island(myLoader, { name })`
 *   - Name is a variable: `island(() => import('./X'), { name: NAME_CONST })`
 *   - Options come from a spread: `island(loader, { ...opts })`
 */
async function prescanIslandDeclarations(
  root: string,
  registry: Map<string, IslandDecl[]>,
): Promise<void> {
  const files: string[] = []

  function walk(dir: string) {
    try {
      for (const entry of readdirSync(dir)) {
        if (
          entry.startsWith('.') ||
          entry === 'node_modules' ||
          entry === 'dist' ||
          entry === 'lib' ||
          entry === 'build'
        )
          continue
        const full = pathJoin(dir, entry)
        try {
          const stat = statSync(full)
          if (stat.isDirectory()) walk(full)
          else if (/\.(ts|tsx|js|jsx)$/.test(entry)) files.push(full)
        } catch {
          /* permission error, etc. */
        }
      }
    } catch {
      /* dir doesn't exist */
    }
  }

  walk(root)

  for (const file of files) {
    try {
      const code = readFileSync(file, 'utf-8')
      scanIslandDeclarations(code, file, registry)
    } catch {
      /* read error */
    }
  }
}

/**
 * Scan a single source file for `island()` declarations and record them.
 *
 * The regex captures:
 *   - Group 1: dynamic-import path (`./components/Counter`)
 *   - Group 2: options block contents
 *
 * Then a follow-up regex pulls `name: 'X'` and `hydrate: 'Y'` from the
 * options block. Single-line and multi-line forms both work.
 *
 * Resolves the loader path relative to the file where the call lives so
 * the emitted virtual-module registry gets an absolute path Vite's resolver
 * can find.
 */
function scanIslandDeclarations(
  code: string,
  filePath: string,
  registry: Map<string, IslandDecl[]>,
): void {
  // `[\s\S]` lets the options block span multiple lines. The lazy `?` after
  // the options block prevents over-matching when several `island()` calls
  // appear in the same file.
  const ISLAND_CALL_RE =
    /island\s*\(\s*\(\s*\)\s*=>\s*import\s*\(\s*['"]([^'"]+)['"]\s*\)\s*,\s*\{([\s\S]*?)\}\s*\)/g
  const decls: IslandDecl[] = []
  let match: RegExpExecArray | null
  while ((match = ISLAND_CALL_RE.exec(code)) !== null) {
    const importPath = match[1]!
    const optsBlock = match[2]!
    const nameMatch = /(?:^|[\s,{])name\s*:\s*['"]([^'"]+)['"]/.exec(optsBlock)
    if (!nameMatch) continue // can't auto-register without a name
    const hydrateMatch = /(?:^|[\s,{])hydrate\s*:\s*['"]([^'"]+)['"]/.exec(optsBlock)
    const hydrate = hydrateMatch ? hydrateMatch[1]! : 'load'
    const loaderAbsPath = importPath.startsWith('.')
      ? resolveRelative(filePath, importPath)
      : importPath
    decls.push({ name: nameMatch[1]!, hydrate, loaderAbsPath })
  }
  if (decls.length > 0) {
    registry.set(normalizeModuleId(filePath), decls)
  } else {
    // Clean up if file no longer declares islands (e.g. after edit)
    registry.delete(normalizeModuleId(filePath))
  }
}

/**
 * Resolve a dynamic-import specifier to an absolute path, mirroring how Node
 * / Vite resolve `import('./X')` from the source file's directory.
 */
function resolveRelative(fromFile: string, relPath: string): string {
  return pathJoin(dirname(fromFile), relPath)
}

/**
 * Render the auto-generated `virtual:pyreon/islands-registry` source. Emits:
 *
 *   export const __pyreonIslandRegistry = {
 *     Counter:   () => import('/abs/path/to/components/Counter'),
 *     IdleClock: () => import('/abs/path/to/components/IdleClock'),
 *     // never-strategy islands deliberately omitted
 *   }
 *
 * `hydrate: 'never'` islands are skipped — registering a loader for them
 * would defeat the strategy by pulling the component module into the
 * client bundle graph. `hydrateIslandsAuto()` short-circuits never-islands
 * at runtime regardless; emitting here would still create the dynamic-
 * import chunk.
 *
 * Duplicate `name` across declarations: the LAST one wins. Documented as
 * an anti-pattern (caught by the planned `pyreon doctor --check-islands`).
 */
function renderIslandsRegistry(
  registry: Map<string, IslandDecl[]>,
  enabled: boolean,
): string {
  if (!enabled) {
    return [
      `// pyreon plugin: islands feature is disabled (pyreon({ islands: false })).`,
      `// hydrateIslandsAuto() will throw at runtime — re-enable via vite.config.ts`,
      `// or use manual hydrateIslands({ ... }) instead.`,
      `export const __pyreonIslandRegistry = {};`,
      `export const __pyreonIslandsEnabled = false;`,
    ].join('\n')
  }
  const entries: string[] = []
  const seen = new Set<string>()
  // Deterministic order: sort by name for stable output / predictable HMR.
  const all = Array.from(registry.values()).flat()
  all.sort((a, b) => a.name.localeCompare(b.name))
  for (const { name, hydrate, loaderAbsPath } of all) {
    if (hydrate === 'never') continue
    if (seen.has(name)) continue
    seen.add(name)
    // JSON.stringify gives proper escaping for both name (object key) and path.
    entries.push(`  ${JSON.stringify(name)}: () => import(${JSON.stringify(loaderAbsPath)}),`)
  }
  return [
    `// Auto-generated by @pyreon/vite-plugin (islands: true). Do not edit.`,
    `// Sourced from island() declarations in your project. Never-strategy`,
    `// islands are intentionally omitted — registering a loader for them`,
    `// would defeat the zero-JS contract.`,
    `export const __pyreonIslandRegistry = {`,
    ...entries,
    `};`,
    `export const __pyreonIslandsEnabled = true;`,
  ].join('\n')
}

/**
 * Pre-scan all source files in the project for signal exports.
 *
 * Called from `buildStart` so the registry is fully populated before any
 * transforms run. This solves the build ordering problem where component.tsx
 * is transformed before store.ts — without pre-scanning, the registry would
 * be empty and imported signals would not be auto-called.
 */
async function prescanSignalExports(root: string, registry: Map<string, Set<string>>): Promise<void> {
  const files: string[] = []

  function walk(dir: string) {
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist' || entry === 'lib' || entry === 'build') continue
        const full = pathJoin(dir, entry)
        try {
          const stat = statSync(full)
          if (stat.isDirectory()) walk(full)
          else if (/\.(ts|tsx|js|jsx)$/.test(entry)) files.push(full)
        } catch {
          /* permission error, etc. */
        }
      }
    } catch {
      /* dir doesn't exist */
    }
  }

  walk(root)

  for (const file of files) {
    try {
      const code = readFileSync(file, 'utf-8')
      scanSignalExports(code, file, registry)
    } catch {
      /* read error */
    }
  }
}

/**
 * Scan a module's source for exported signal declarations and register them.
 *
 * Detects patterns:
 *   1. `export const x = signal(...)` or `export const x = computed(...)` — inline export
 *   2. `const x = signal(...); export { x }` — separate declaration + named export
 *   3. `export default signal(...)` — default export (tracked as 'default')
 *
 * Re-exports (`export { x } from './signals'`) are NOT detected — the source
 * module must be scanned directly. This is a known limitation.
 *
 * Uses simple regex — no AST parse needed.
 */
function scanSignalExports(code: string, moduleId: string, registry: Map<string, Set<string>>): void {
  const normalizedId = normalizeModuleId(moduleId)
  let match: RegExpExecArray | null
  const signals = new Set<string>()

  // Pattern 1: export const x = signal(...) or export const x = computed(...)
  const EXPORT_CONST_RE = /export\s+const\s+(\w+)\s*=\s*(?:signal|computed)\s*[<(]/g
  while ((match = EXPORT_CONST_RE.exec(code)) !== null) {
    signals.add(match[1]!)
  }

  // Pattern 2: const x = signal(...) followed by export { x }
  // First, find all local `const x = signal(` or `const x = computed(` declarations
  const localSignals = new Set<string>()
  const LOCAL_SIGNAL_RE = /(?:^|[\s;])const\s+(\w+)\s*=\s*(?:signal|computed)\s*[<(]/gm
  while ((match = LOCAL_SIGNAL_RE.exec(code)) !== null) {
    localSignals.add(match[1]!)
  }

  // Then check named exports: export { x, y as z }
  if (localSignals.size > 0) {
    const NAMED_EXPORT_RE = /export\s*\{([^}]+)\}/g
    while ((match = NAMED_EXPORT_RE.exec(code)) !== null) {
      // Skip re-exports (export { x } from '...')
      const afterBrace = code.slice(match.index + match[0].length).trimStart()
      if (afterBrace.startsWith('from')) continue

      for (const spec of match[1]!.split(',')) {
        const trimmed = spec.trim()
        if (!trimmed) continue
        const parts = trimmed.split(/\s+as\s+/)
        const localName = parts[0]!.trim()
        const exportedName = (parts[1] ?? parts[0])!.trim()
        if (localSignals.has(localName)) {
          signals.add(exportedName)
        }
      }
    }
  }

  // Pattern 3: export default signal(...) or export default computed(...) — tracked as 'default'
  if (/export\s+default\s+(?:signal|computed)\s*[<(]/.test(code)) {
    signals.add('default')
  }

  if (signals.size > 0) {
    registry.set(normalizedId, signals)
  } else {
    // Clean up if module no longer exports signals (e.g. after edit)
    registry.delete(normalizedId)
  }
}

/**
 * Resolve imported signal names from the signal export registry.
 *
 * For each import in the source, resolves the module and checks if it has
 * signal exports in the registry. Returns the local names of imported signals.
 *
 * Handles named imports (`import { x } from ...`) and default imports
 * (`import x from ...` — matched against 'default' in the registry).
 */
async function resolveImportedSignals(
  code: string,
  _moduleId: string,
  registry: Map<string, Set<string>>,
  pluginCtx: { resolve: (id: string, importer?: string, options?: { skipSelf: boolean }) => Promise<{ id: string } | null> },
  resolveCache: Map<string, string | null>,
): Promise<string[]> {
  if (registry.size === 0) return []

  const knownSignals: string[] = []
  let match: RegExpExecArray | null

  /** Resolve a source specifier to a normalized module ID, using the cache. */
  async function resolveSource(source: string): Promise<string | null> {
    const cacheKey = `${_moduleId}::${source}`
    if (resolveCache.has(cacheKey)) return resolveCache.get(cacheKey) ?? null
    let resolvedId: string | null = null
    try {
      const resolved = await pluginCtx.resolve(source, _moduleId, { skipSelf: true })
      resolvedId = resolved?.id ? normalizeModuleId(resolved.id) : null
    } catch {
      /* resolve error */
    }
    resolveCache.set(cacheKey, resolvedId)
    return resolvedId
  }

  // Named imports: import { name1, name2 as alias } from 'source'
  // Excludes `import type { ... }` — type-only imports have no runtime value
  const IMPORT_RE = /import\s+(?!type\s)\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g
  while ((match = IMPORT_RE.exec(code)) !== null) {
    const specifiers = match[1]!
    const source = match[2]!

    const resolvedId = await resolveSource(source)
    if (!resolvedId) continue
    const exportedSignals = registry.get(resolvedId)
    if (!exportedSignals) continue

    // Parse import specifiers: "count, theme as t, other"
    for (const spec of specifiers.split(',')) {
      const trimmed = spec.trim()
      if (!trimmed) continue

      const parts = trimmed.split(/\s+as\s+/)
      const importedName = parts[0]!.trim()
      const localName = (parts[1] ?? parts[0])!.trim()

      if (exportedSignals.has(importedName)) {
        knownSignals.push(localName)
      }
    }
  }

  // Default imports: import count from './store'
  // Excludes: `import { ... }`, `import type X`, `import * as X`
  const DEFAULT_IMPORT_RE = /import\s+(?!type\s)(\w+)\s+from\s*['"]([^'"]+)['"]/g
  while ((match = DEFAULT_IMPORT_RE.exec(code)) !== null) {
    // Skip if this is actually a `import type X from` pattern
    const fullMatch = match[0]
    if (/import\s+type\s+/.test(fullMatch)) continue

    const localName = match[1]!
    const source = match[2]!

    const resolvedId = await resolveSource(source)
    if (!resolvedId) continue
    const exportedSignals = registry.get(resolvedId)
    if (!exportedSignals) continue

    if (exportedSignals.has('default')) {
      knownSignals.push(localName)
    }
  }

  return knownSignals
}

const HMR_RUNTIME_SOURCE = `
const REGISTRY_KEY = "__pyreon_hmr_registry__";

function getRegistry() {
  if (!globalThis[REGISTRY_KEY]) {
    globalThis[REGISTRY_KEY] = new Map();
  }
  return globalThis[REGISTRY_KEY];
}

const moduleSignals = new Map();

export function __hmr_signal(moduleId, name, signalFn, initialValue) {
  const registry = getRegistry();
  const saved = registry.get(moduleId);
  const value = saved?.has(name) ? saved.get(name) : initialValue;
  const s = signalFn(value, { name: name });

  let mod = moduleSignals.get(moduleId);
  if (!mod) {
    mod = { entries: new Map() };
    moduleSignals.set(moduleId, mod);
  }
  mod.entries.set(name, s);

  return s;
}

export function __hmr_dispose(moduleId) {
  const mod = moduleSignals.get(moduleId);
  if (!mod) return;

  const registry = getRegistry();
  const saved = new Map();
  for (const [name, s] of mod.entries) {
    saved.set(name, s.peek());
  }
  registry.set(moduleId, saved);
  moduleSignals.delete(moduleId);
}
`
