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
import { buildCompiledVerdicts } from './compiled-verdicts'
import { injectIslandNames } from './island-auto-name'
import { optimizeValidators } from './optimize-validators'
import type { CollapseResolver } from './rocketstyle-collapse'
import type { Plugin, ViteDevServer } from 'vite'

// Dev-mode counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

// Lazy — the resolver module (and its `vite` SSR machinery) must NOT be
// on the static import path of this cheap entry. It loads ONLY when
// `pyreon({ collapse })` is enabled AND a collapsible site is scanned;
// collapse-off consumers never pull it (bundle-budget + cold-load).
let _createCollapseResolver: ((root: string) => Promise<CollapseResolver>) | null = null
async function loadCreateCollapseResolver(): Promise<(root: string) => Promise<CollapseResolver>> {
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
   * `hydrateIslandsAuto()` requires the generated registry — import the
   * virtual module as a NAMESPACE and pass it. (A `@pyreon/zero` app does NOT
   * need this at all: islands declared via `import { island } from
   * '@pyreon/zero'` self-hydrate on mount, so `startClient({ routes })` is
   * enough.)
   *
   * @example
   * pyreon({ islands: true })
   *
   * // src/entry-client.ts (bare @pyreon/vite-plugin app)
   * import { hydrateIslandsAuto } from '@pyreon/server/client'
   * import * as islands from 'virtual:pyreon/islands-registry'
   * hydrateIslandsAuto(islands)
   */
  islands?: boolean

  /**
   * **LPIH auto-bridge** — zero-config Live Program Inlay Hints in dev.
   *
   * When `true` (the default in dev), the plugin auto-wires the LPIH
   * cache file: the browser-side activates devtools + polls fire data
   * every `intervalMs` (250ms default), and the dev-server middleware
   * receives the POST + writes `<project-root>/.pyreon-lpih.json` using
   * the atomic-rename pattern from `@pyreon/reactivity/lpih`. The LSP
   * (`pyreon-lint --lsp`) auto-discovers that file, so the end-to-end
   * "save file → see fire counts" loop needs ZERO user wiring.
   *
   * Set to `false` to opt out (e.g. if you're wiring `startLpihPolling()`
   * yourself from a non-browser runtime, or you want LPIH off entirely).
   * Pass an object to override the interval or the cache-file path.
   *
   * Build-only consumer: production builds skip injection entirely.
   *
   * @example
   * pyreon({ lpih: true })                          // default in dev
   * pyreon({ lpih: false })                         // opt out
   * pyreon({ lpih: { intervalMs: 500 } })           // slower poll
   * pyreon({ lpih: { cachePath: '/tmp/x.json' } })  // custom path
   */
  lpih?: boolean | PyreonLpihOptions

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

  /**
   * Opt-in compile-time validator emission for `@pyreon/validate`. When `true`,
   * production builds append `X._attachCompiledVerdict(…)` to every module-level
   * `const X = s.<schema>` whose IR is fully emittable, so the runtime `X.is(v)`
   * runs an inlined monomorphic validator instead of `X.parse(v).ok`. The emitted
   * verdict is byte-equivalent to the runtime (locked by the compiler's
   * emit-equivalence gate), so this only changes SPEED, never the result.
   *
   * OFF by default (zero behaviour change). Build-only — dev keeps the runtime
   * path (which is already correct and HMR-reactive). Composed/aliased/unsupported
   * schemas are skipped silently and fall back to the runtime `.is()`.
   *
   * @example pyreon({ compileValidators: true })
   */
  compileValidators?: boolean

  /**
   * Opt-in compile-time tree-shaking for `@pyreon/validate` schemas. When
   * `true`, production builds rewrite each module-level chainable
   * `const X = s.<chain>` schema into the equivalent lean `@pyreon/validate/mini`
   * construction (`s.string().email().min(2)` → `string().check(email(),
   * minLength(2))`), importing only the constructors + actions it uses — so the
   * bundle prunes the format/range validators it doesn't. **You keep writing the
   * beautiful chainable API; the compiler produces the tree-shakeable output —
   * no second API to learn.** The rewrite is byte-equivalent (the mini actions
   * are parity-locked; the end-to-end rewrite is verdict-for-verdict identical,
   * locked by `@pyreon/validate`'s `compile-rewrite-equivalence.test.ts`).
   *
   * OFF by default (zero behaviour change). Build-only — dev keeps the chainable
   * runtime (HMR-reactive). Conservative: only statically-analyzable
   * `const X = s.<chain>` in `.ts` modules are rewritten; dynamic schemas (built
   * in a function / conditionally / with a non-literal arg) and `.tsx` schemas
   * are left as the full runtime (correct, just not pruned).
   *
   * @example pyreon({ optimizeValidators: true })
   */
  optimizeValidators?: boolean

  /**
   * **JSX auto-import for canonical primitives** — closes the Phase D2
   * gap toward "literally same .tsx file across all three targets".
   *
   * When `true` (the default), scans each `.tsx` file for bare JSX
   * references to canonical primitives (`<Stack>`, `<Inline>`, `<Text>`,
   * `<Button>`, `<Press>`, `<Field>`, `<Toggle>`) and auto-injects
   * `import { ... } from '@pyreon/primitives'` at the top of the file
   * for every primitive used but not yet imported.
   *
   * **Why this matters**: the PMTC native compiler resolves bare JSX
   * tags via its canonical-primitives table at compile time + emits
   * SwiftUI/Kotlin directly — imports would be no-ops on native targets
   * (treated as type-only). So the native source stays import-free for
   * minimal surface. The web build needs the imports for symbol
   * resolution. This auto-import lets ONE `.tsx` file work on all three
   * targets without manual import maintenance.
   *
   * Already-imported names pass through untouched (the plugin diffs the
   * existing imports against the used set before injecting). Components
   * with the same name imported from another source (e.g. a user-defined
   * `<Button>` from a local file) take precedence — the auto-import
   * only fires when the name is used + NOT already in scope.
   *
   * Defaults to `true`. Set to `false` to opt out (e.g. if your
   * project defines its own primitives or you want explicit imports
   * throughout). The scan is regex-based and runs only on `.tsx`
   * files; cost is negligible vs the JSX transform itself.
   *
   * @example pyreon({ jsxAutoImport: true })
   * @example pyreon({ jsxAutoImport: false })
   * @example pyreon({ jsxAutoImport: { mappings: [{ source: '@my/primitives', names: ['Box', 'Row'] }] } })
   */
  jsxAutoImport?: boolean | PyreonJsxAutoImportOptions
}

/**
 * Override the source / name mappings for the JSX auto-import pass.
 * Default: imports the 7 implemented canonical primitives (`Stack` /
 * `Inline` / `Text` / `Button` / `Press` / `Field` / `Toggle`) from
 * `@pyreon/primitives` AND the 2 most-used control-flow helpers
 * (`For` / `Show`) from `@pyreon/core` — so a TSX source written for
 * native (zero imports — PMTC resolves bare tags) also runs on web
 * with no manual imports.
 *
 * Pass a custom mappings array to apply the same mechanism to a
 * different primitive library, OR to extend the default set with
 * project-specific primitives.
 */
export interface PyreonJsxAutoImportOptions {
  /**
   * Source → names mappings. Each entry says "auto-import these names
   * from this source". Order matters: the first mapping that includes
   * a used name wins.
   */
  mappings?: Array<{ source: string; names: string[] }>
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

export interface PyreonLpihOptions {
  /**
   * Poll interval in milliseconds. The browser-side bridge reads
   * `getFireSummaries()` and POSTs every `intervalMs` to the dev-server
   * middleware. Default 250ms — matches the LSP-debounce window so
   * editor hints settle within one frame of the typical save→hint cycle.
   *
   * Lower values (e.g. 100ms) trade dev-server CPU for snappier hints;
   * higher values (1000ms) reduce overhead for slow machines.
   */
  intervalMs?: number
  /**
   * Cache-file path override. Defaults to
   * `<projectRoot>/.pyreon-lpih.json` — the convention the LSP auto-
   * discovers (R2, #777). Override only if you need a non-default
   * location (shared mount, custom workspace layout).
   */
  cachePath?: string
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
export function _isPyreonWorkspaceFile(id: string, cache: Map<string, boolean>): boolean {
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

/**
 * Walk up from `root` looking for the nearest `node_modules/@pyreon`
 * directory, then return every subdirectory name as `@pyreon/<name>`.
 *
 * This is the TRANSITIVE @pyreon/* dependency list — direct + every
 * indirect dep that any direct dep pulled in. Required for `resolve.dedupe`
 * because the original `scanPyreonDeps()` reads `package.json` only and
 * misses anything a direct dep transitively requires (a user with only
 * `@pyreon/zero` declared transitively pulls @pyreon/core, @pyreon/router,
 * @pyreon/runtime-dom, etc. — none of which appear in their package.json).
 *
 * Bun / npm / pnpm all create `node_modules/@pyreon/<name>` entries for
 * every resolved version, so a filesystem walk gives the exact set the
 * bundler will see. Returns an empty array if no `node_modules/@pyreon`
 * directory is reachable (fresh project before `bun install`, etc.) —
 * dedupe then has nothing to do, which is the correct degradation.
 */
function scanPyreonDepsTransitive(root: string): string[] {
  let dir = root
  for (let i = 0; i < 10; i++) {
    const candidate = pathJoin(dir, 'node_modules', '@pyreon')
    if (existsSync(candidate)) {
      try {
        const entries = readdirSync(candidate, { withFileTypes: true })
        return entries
          .filter((e) => e.isDirectory() || e.isSymbolicLink())
          .map((e) => `@pyreon/${e.name}`)
          .sort()
      } catch {
        return []
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return []
}

/**
 * Truthy env-var parser. Accepts `1` / `true` / `yes` / `on`
 * (case-insensitive). Returns `false` for `undefined`, empty string,
 * `0`, `false`, `no`, `off`, or any unrecognized value.
 *
 * Exported via `_internal` for unit-testability — the previous strict
 * `=== '1'` shape caught a user reporting `PYREON_DISABLE_DEDUPE=true`
 * silently not working. Env-var hatches are usually reached for under
 * stress; rejecting alternatives is exactly the wrong moment to be strict.
 *
 * @internal
 */
export function _isTruthyEnv(v: string | undefined): boolean {
  if (v === undefined) return false
  const lower = v.toLowerCase()
  return lower === '1' || lower === 'true' || lower === 'yes' || lower === 'on'
}
const isTruthyEnv = _isTruthyEnv

// Return type is widened to `Plugin<any>` so the plugin remains
// assignable to consumer `UserConfig.plugins` arrays that may be typed
// against a different Vite version (e.g. vitest's bundled Vite types
// vs. our peer-declared vite ≥8). Without the explicit `any`, consumers
// on older vitest versions get a Plugin<vite8> vs Plugin<vite6/7> type
// mismatch at the seam and need an `as never` cast at the call site.
// Runtime is identical — the Plugin shape itself hasn't changed across
// vite 5/6/7/8 for the hooks we implement.
export default function pyreonPlugin(options?: PyreonPluginOptions): Plugin<any> {
  const ssrConfig = options?.ssr
  const compat = options?.compat
  // Default islands support to enabled — the prescan is cheap and the virtual
  // module is harmless if the user has no `island()` calls. Opt out only if
  // you have a specific reason.
  const islandsEnabled = options?.islands !== false

  // ── LPIH auto-bridge config ──────────────────────────────────────────────
  // Default `true` (zero-config Live Program Inlay Hints in dev). Set to
  // `false` to opt out. Object form overrides interval / cache path.
  const lpihOpt = options?.lpih
  const lpihEnabled = lpihOpt !== false
  const lpihUserCfg: PyreonLpihOptions = lpihOpt && lpihOpt !== true ? lpihOpt : {}
  const lpihIntervalMs = lpihUserCfg.intervalMs ?? 250

  // ── Compiled-validator emission config (opt-in, build-only) ───────────────
  const compileValidatorsEnabled = options?.compileValidators === true

  // ── Validator tree-shake rewrite config (opt-in, build-only) ──────────────
  const optimizeValidatorsEnabled = options?.optimizeValidators === true

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

  // ── JSX auto-import config ───────────────────────────────────────────────
  // Default `true` — auto-injects `import { Stack, ... } from
  // '@pyreon/primitives'` (+ `For` / `Show` from `@pyreon/core`) for
  // bare JSX references. Closes the "literally same .tsx file across
  // web + native" gap — the native compiler doesn't need the imports
  // (it resolves bare tags via its own table), web does.
  const jsxAutoImportOpt = options?.jsxAutoImport
  const jsxAutoImportEnabled = jsxAutoImportOpt !== false
  const jsxAutoImportUserCfg: PyreonJsxAutoImportOptions =
    jsxAutoImportOpt && jsxAutoImportOpt !== true ? jsxAutoImportOpt : {}
  const defaultMappings = [
    {
      source: '@pyreon/primitives',
      names: ['Stack', 'Inline', 'Text', 'Button', 'Press', 'Field', 'Toggle'],
    },
    { source: '@pyreon/core', names: ['For', 'Show'] },
  ]
  const jsxAutoImportMappings = jsxAutoImportUserCfg.mappings ?? defaultMappings
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

  // PR-S12: dev-server reference captured in `configureServer`. Used by
  // the transform hook to invalidate the `virtual:pyreon/islands-registry`
  // virtual module when an island declaration changes (add / remove /
  // rename). Without this, the next dev request gets the STALE registry
  // and the new island silently fails to hydrate until a manual reload.
  let _devServer: ViteDevServer | undefined

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
      const optimizeDepsExclude = Array.from(new Set([...compatExclude, ...pyreonExclude]))

      // Transitive @pyreon/* dedupe — default-on. Eliminates the dual-load
      // bug class at the bundler layer by forcing every @pyreon/* import to
      // resolve to ONE copy regardless of how the import chain looks (direct
      // vs transitive, hoisted vs nested). The singleton sentinel
      // (@pyreon/reactivity:registerSingleton, default-on per PR A) is the
      // detection layer for any case this misses. Together they form the
      // defense-in-depth — bundler PREVENTS, sentinel DETECTS.
      //
      // scanPyreonDeps() reads the consumer's direct package.json only and
      // therefore misses anything a direct dep transitively pulls in (a user
      // with only @pyreon/zero declared transitively pulls @pyreon/core,
      // @pyreon/router, @pyreon/runtime-dom — none of which appear in their
      // package.json). scanPyreonDepsTransitive() walks node_modules to
      // capture the full set.
      //
      // Escape hatch: PYREON_DISABLE_DEDUPE turns the injection off — rare
      // (browser extensions / micro-frontends that legitimately dual-load).
      // Accept any truthy string: `1`, `true`, `yes`, `on` (case-insensitive).
      // Users reach for env-var escape hatches under stress; rejecting `true`
      // because it isn't literal `'1'` is exactly the wrong moment to be
      // strict.
      const procEnv =
        typeof process !== 'undefined' && process.env
          ? (process.env as unknown as Record<string, string | undefined>)
          : undefined
      const dedupeDisabled = isTruthyEnv(procEnv?.PYREON_DISABLE_DEDUPE)
      const dedupeList = dedupeDisabled ? [] : scanPyreonDepsTransitive(projectRoot)

      // Always set OXC's JSX importSource to `@pyreon/core`. In compat mode,
      // we redirect `@pyreon/core/jsx-runtime` imports to the compat package
      // VIA `resolveId` — but ONLY for user code, never for `@pyreon/*`
      // workspace-package files (zero, router, runtime-dom, etc.). Setting
      // OXC's importSource directly to the compat package would force the
      // compat runtime on framework internals too, which they cannot handle.
      const jsxSource = '@pyreon/core'

      return {
        // Use "bun" condition for workspace resolution — source .ts/.tsx files
        // for HMR, fast refresh, and type-safe imports. `dedupe` forces every
        // @pyreon/* import to resolve to ONE copy across the module graph.
        resolve: {
          conditions: ['bun'],
          ...(dedupeList.length > 0 ? { dedupe: dedupeList } : {}),
        },
        // Force every `@pyreon/*` package through Vite's transform pipeline
        // for SSR. Without this, Vite externalizes some `@pyreon/*` packages
        // (loads via Node's `import()`) while transforming others — producing
        // TWO module instances of `@pyreon/core` (one at `lib/index.js`, one
        // at `src/index.ts` via the `bun` condition). The two instances have
        // SEPARATE `_current` lifecycle state, so `runWithHooks` sets
        // `_current` on instance A while `provide()` reads `_current` from
        // instance B → null → `provide() outside setup` warning storm.
        //
        // Real-app symptom (bokisch.com dev-404 SSR, 0.24.4): 17 spurious
        // `[Pyreon] onUnmount() called outside component setup` warnings
        // per unmatched URL hit, even though every `provide()` IS structurally
        // inside a `runWithHooks` setup window. Fix is purely a Vite
        // module-graph reconciliation; no runtime behavior change.
        //
        // The regex `/@pyreon\//` matches every framework package + every
        // user-side `@pyreon/*` import. Internal `@pyreon/*` resolution
        // chains (zero → runtime-server → core; user `_layout.tsx` →
        // ui-core → core) all converge on the same module instance.
        ssr: {
          noExternal: [/@pyreon\//],
        },
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

      // Leak-class C diagnostic — emit per handled delete event. Bounded
      // by file-deletion count in a dev session; should grow strictly
      // monotonically with developer edit activity. Zero in a session
      // with known deletes = the watchChange hook regressed (and the
      // 4 per-instance caches will leak again).
      if (process.env.NODE_ENV !== 'production') _countSink.__pyreon_count__?.('vite-plugin.watchChange.delete')

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
        _isPyreonWorkspaceFile(importer, pyreonWorkspaceDirCache)
      ) {
        return // let Vite resolve to the real `@pyreon/core/jsx-runtime`
      }

      const target = _getCompatTarget(compat, id)
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
      // ── Validator tree-shake rewrite (opt-in, build-only) ──────────────
      // Rewrite chainable `const X = s.<chain>` schemas to the lean
      // `@pyreon/validate/mini` form so the bundle prunes unused checks — the
      // user keeps writing the chainable API. Scoped to `.ts` modules (where
      // validation schemas overwhelmingly live), mirroring the compiled-verdict
      // `.ts` early-return: esbuild compiles the rewritten source after us.
      if (optimizeValidatorsEnabled && isBuild && getExt(id) === '.ts' && code.includes('@pyreon/validate')) {
        const rewritten = optimizeValidators(code, id)
        if (rewritten !== null) return { code: rewritten, map: null }
      }

      // ── Compiled validator verdicts (opt-in, build-only) ───────────────
      // Runs for BOTH `.ts` (no JSX — esbuild compiles after us) and `.tsx`
      // (we stash the tail and append it AFTER the JSX compile below, so the
      // `X._attachCompiledVerdict(…)` references survive). Append-at-module-end
      // keeps every original line position intact → the source map stays exact.
      let verdictTail = ''
      if (compileValidatorsEnabled && isBuild) {
        const e0 = getExt(id)
        if ((e0 === '.ts' || e0 === '.tsx') && code.includes('@pyreon/validate')) {
          const v = buildCompiledVerdicts(code, id)
          if (v) {
            // `.ts` isn't JSX-compiled by this plugin — inject + hand back to
            // esbuild. `.tsx` falls through to the JSX compile, then appends.
            if (e0 === '.ts') return { code: code + v, map: null }
            verdictTail = v
          }
        }
      }

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
      // PR-S12: invalidate the virtual registry module when declarations
      // change. Pre-fix the scan updated the registry but Vite kept
      // serving the cached virtual module — the new island silently
      // failed to hydrate until a manual full reload. Now: the scan
      // returns whether anything changed; on a change, we look up the
      // virtual module in Vite's module graph and invalidate it so the
      // next request triggers a fresh `load` hook.
      //
      // **Look up by ISLANDS_REGISTRY_ID, not a constructed
      // `\0${ISLANDS_REGISTRY_IMPORT}` string.** Vite stores virtual modules
      // under the id returned by `resolveId` — here that's
      // `'\0pyreon/islands-registry'` (no `virtual:` prefix). A lookup of
      // `'\0virtual:pyreon/islands-registry'` always misses → invalidation
      // never fires → PR-S12's stated bug ("the new island silently fails to
      // hydrate until a manual reload") shipped UNFIXED. Single-character
      // fix: use the same constant `resolveId` returns.
      if (islandsEnabled) {
        // Auto-name nameless const-bound island() calls BEFORE scanning —
        // the scan then always sees a literal `name:`, and the runtime
        // receives it (same derivation the prescan applies to raw disk
        // source, so registry and marker can never disagree).
        const named = injectIslandNames(code, id, projectRoot)
        if (named !== null) code = named
        const changed = scanIslandDeclarations(code, id, islandRegistry)
        if (changed && _devServer) {
          const mod = _devServer.moduleGraph.getModuleById(ISLANDS_REGISTRY_ID)
          if (mod) _devServer.moduleGraph.invalidateModule(mod)
        }
      }

      // ── JSX auto-import for canonical primitives ───────────────────────
      // Phase D2 — auto-inject `import { Stack, ... } from
      // '@pyreon/primitives'` (+ `For` / `Show` from `@pyreon/core`)
      // for bare JSX references. Lets ONE `.tsx` file work on web
      // (needs imports for symbol resolution) AND native (PMTC
      // compiler resolves bare tags via its own table — imports are
      // no-ops there). Conservative: skips if the name is already
      // imported OR shadowed by a local declaration.
      const codeAfterAutoImport = jsxAutoImportEnabled
        ? autoImportCanonicalPrimitives(code, jsxAutoImportMappings)
        : code

      // ── Inline-Defer pre-pass ──────────────────────────────────────────
      // Rewrites `<Defer when={x}><Modal /></Defer>` into the explicit
      // chunk-prop form so Rolldown emits a proper per-Defer chunk and
      // the main bundle drops the static `import { Modal } from ...`
      // when it's exclusively used inside this Defer's subtree. Runs
      // BEFORE the JSX→runtime transform so the downstream pipeline
      // sees an already-explicit `<Defer chunk={...}>` shape with no
      // special-casing needed in `transformJSX`. See
      // `@pyreon/compiler/defer-inline` for the rewrite contract.
      const deferResult = transformDeferInline(codeAfterAutoImport, id)
      const sourceForJsx = deferResult.changed ? deferResult.code : codeAfterAutoImport
      for (const w of deferResult.warnings) {
        this.warn(`${w.message} (${id}:${w.line}:${w.column})`)
      }

      // ── Resolve imported signals from the registry ─────────────────────
      // Check each import in this file: if the imported module has signal
      // exports in the registry, pass them as knownSignals to the compiler.
      const knownSignals = await resolveImportedSignals(
        sourceForJsx,
        id,
        signalExportRegistry,
        this,
        resolveCache,
      )

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
                ...(s.childTree ? { childTree: s.childTree } : {}),
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

      // ── Build-only: append compiled validator verdicts (.tsx path) ──────
      // `verdictTail` is only non-empty when compileValidators is on AND
      // isBuild — so this is implicitly build-only. Appended after the JSX
      // compile so the top-level `const X` it references is already emitted.
      if (verdictTail) output += verdictTail

      // ── Dev-only transforms ────────────────────────────────────────────
      if (!isBuild) {
        output = injectHmr(output, id)
        // Inject debug names + LPIH source locations for signal() calls
        // not rewritten by HMR. `id` is Vite's resolved module path —
        // the same path the runtime would have parsed from new Error().
        output = injectSignalNames(output, id)
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
      // PR-S12: capture the dev server reference for transform-time
      // virtual-module invalidation. Reset to undefined when the server
      // is replaced (next configureServer call).
      _devServer = server

      // ── Islands doctor-lite (dev-only, advisory) ─────────────────────
      // The islands audit (duplicate-name / nested-island / dead-island /
      // registry drift) historically ran only via `pyreon doctor
      // --check-islands` — CI-or-manual, so a broken island shipped a full
      // dev session before anyone saw the finding. Run it once on server
      // boot, deferred off the startup path, and print findings as plain
      // warnings. Advisory: any failure is swallowed (the audit must never
      // break `vite dev`).
      if (islandsEnabled) {
        setTimeout(() => {
          void (async () => {
            try {
              const { auditIslands, formatIslandAudit } = await import('@pyreon/compiler')
              const result = auditIslands(projectRoot)
              if (result.findings.length > 0) {
                // oxlint-disable-next-line no-console
                console.warn(
                  `\n[Pyreon islands] ${result.findings.length} finding(s) — \`pyreon doctor --check-islands\` for details:\n`
                    + formatIslandAudit(result),
                )
              }
            } catch {
              /* advisory only */
            }
          })()
        }, 1_000)
      }

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

      // LPIH auto-bridge — accepts POST /__pyreon_lpih__ from the browser
      // client and atomically writes the cache file the LSP auto-discovers.
      // Registered BEFORE the SSR middleware so it short-circuits and never
      // falls through to handleSsrRequest.
      if (lpihEnabled) {
        registerLpihMiddleware(server, projectRoot, lpihUserCfg)
      }

      if (!ssrConfig) return

      // Return a function so the middleware runs AFTER Vite's built-in middleware
      // (static files, HMR, etc.) — only handle requests that Vite doesn't serve.
      return () => {
        server.middlewares.use(async (req, res, next) => {
          if (req.method !== 'GET') return next()
          const url = req.url ?? '/'
          if (isAssetRequest(url)) return next()

          try {
            await _handleSsrRequest(server, ssrConfig.entry, url, req, res, next)
          } catch (err) {
            server.ssrFixStacktrace(err as Error)
            next(err)
          }
        })
      }
    },

    // ── LPIH auto-bridge client injection ────────────────────────────────────
    transformIndexHtml(html: string): string | undefined {
      if (isBuild || !lpihEnabled) return undefined
      // Inject a tiny <script type="module"> that activates devtools + polls
      // getFireSummaries() and POSTs to /__pyreon_lpih__. The dev server
      // middleware (above) writes the body to <projectRoot>/.pyreon-lpih.json
      // using @pyreon/reactivity's atomic-rename pattern. The LSP
      // auto-discovers that file (R2, #777) so the user wires NOTHING.
      const script = buildLpihClientScript(lpihIntervalMs)
      return html.replace('</head>', `${script}\n</head>`)
    },
  }
}

export async function _handleSsrRequest(
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

// ── LPIH auto-bridge helpers ───────────────────────────────────────────────

/**
 * Resolve the LPIH cache-file path for a given project root. Matches the
 * convention `@pyreon/reactivity/lpih`'s `getDefaultLpihCachePath()` uses
 * AND the LSP auto-discovers (R2, #777): `<projectRoot>/.pyreon-lpih.json`.
 *
 * @internal — exported for tests.
 */
export function resolveLpihCachePath(projectRoot: string): string {
  return pathJoin(projectRoot, '.pyreon-lpih.json')
}

/**
 * Register the LPIH dev-server middleware on a Vite server. Extracted from
 * `configureServer` so the `cachePath` option reference lives at module
 * scope (top-level helper) rather than inside the plugin's inline body —
 * keeps `scripts/audit-types.ts` happy regardless of how its comment-
 * stripping handles the long inline `configureServer` block.
 *
 * @internal — exported for tests.
 */
export function registerLpihMiddleware(
  server: ViteDevServer,
  projectRoot: string,
  userCfg: PyreonLpihOptions,
): void {
  const cachePath = userCfg.cachePath ?? resolveLpihCachePath(projectRoot)
  server.middlewares.use('/__pyreon_lpih__', (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }
    let body = ''
    req.on('data', (chunk: Buffer | string) => {
      body += chunk.toString()
      // Defensive cap — fire payloads are tiny (a few KB at most);
      // anything larger is malicious or buggy. Drop the request.
      if (body.length > 1024 * 1024) {
        res.statusCode = 413
        res.end('Payload Too Large')
        req.destroy()
      }
    })
    req.on('end', () => {
      void writeLpihCacheFile(cachePath, body)
        .then(() => {
          res.statusCode = 204
          res.end()
        })
        .catch((err: unknown) => {
          // Don't crash the dev server — log + return 500 so the
          // browser-side bridge can back off + retry next interval.
          // oxlint-disable-next-line no-console
          console.warn(
            '[pyreon] LPIH cache write failed:',
            err instanceof Error ? err.message : err,
          )
          res.statusCode = 500
          res.end('LPIH cache write failed')
        })
    })
  })
}

let _lpihSeq = 0

/**
 * Atomically write a LPIH cache file (tmp + rename), mirroring the
 * `@pyreon/reactivity/lpih:writeLpihCache` implementation. The payload
 * comes pre-serialized from the browser-side bridge — we validate the
 * outer shape (`{ fires: [...] }`) and reject malformed bodies to stop a
 * buggy client from corrupting the file the LSP reads.
 *
 * @internal — exported for tests.
 */
export async function writeLpihCacheFile(path: string, body: string): Promise<void> {
  // Validate shape — must be a JSON object with `fires: array`. We re-
  // serialize so the on-disk format is stable regardless of how the
  // browser-side bridge encodes it.
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new Error('LPIH bridge: payload is not valid JSON')
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as { fires?: unknown }).fires)
  ) {
    throw new Error('LPIH bridge: payload is missing `fires` array')
  }
  const fs = await import('node:fs/promises')
  const pid = typeof process !== 'undefined' && 'pid' in process ? process.pid : 0
  const tmp = `${path}.tmp.${pid}.${++_lpihSeq}`
  // Single try/catch covering BOTH writeFile AND rename. The previous
  // shape only guarded the rename — if `fs.writeFile` itself threw (disk
  // full, EIO, EACCES, transient FS error), the partial tmp file leaked
  // on disk with a unique PID+seq name (so no conflict, but it accumulated
  // forever). Audit caught this in the LPIH followups round.
  try {
    await fs.writeFile(tmp, JSON.stringify(parsed), 'utf8')
    await fs.rename(tmp, path)
  } catch (err) {
    // Best-effort cleanup; original error is more useful than unlink's.
    // Covers BOTH the writeFile-failed (tmp may not exist) and the
    // rename-failed (tmp exists, rename didn't move it) cases —
    // `fs.unlink` of a non-existent file throws ENOENT, which we swallow.
    try {
      await fs.unlink(tmp)
    } catch {
      /* swallow — original error is the user-facing one */
    }
    throw err
  }
}

/**
 * Build the `<script type="module">` body injected into the HTML head.
 * The script imports devtools activation + `getFireSummaries` from
 * `@pyreon/reactivity`, sets up a `setInterval` that POSTs every
 * `intervalMs` ms, and registers a `beforeunload` cleanup so the timer
 * doesn't outlive the page.
 *
 * Browser bundlers serve `@pyreon/reactivity` from the workspace via
 * Vite's normal module resolution — no virtual module needed.
 *
 * @internal — exported for tests.
 */
export function buildLpihClientScript(intervalMs: number): string {
  // Note: the script body is intentionally compact — the goal is zero
  // visible payload in DevTools "Sources" while still being readable
  // when someone DOES go looking. `JSON.stringify` for `intervalMs` is
  // defense against `__proto__` / NaN / non-finite values reaching the
  // emitted JS as a literal.
  // CRITICAL — top-level await on the dynamic import. `<script type="module">`
  // tags execute in document order with `defer` semantics; the head-injected
  // LPIH script's body MUST fully evaluate (including this await) BEFORE the
  // body-injected app entry's module body runs. Otherwise activateReactiveDevtools()
  // would land AFTER the app has already created its module-scope signals,
  // and `_rdRegister` (gated on `if (!_active) return undefined`) would skip
  // them entirely — making the most common signal shape (top-of-file `const x = signal(0)`)
  // invisible to LPIH. With the `await`, the LPIH module doesn't complete
  // until activation finishes; the app's entry waits its turn.
  return `<script type="module">
  // Pyreon LPIH auto-bridge — POSTs fire summaries to /__pyreon_lpih__
  // so the LSP (pyreon-lint --lsp) sees live fire data. Dev-only.
  const __px = await import('@pyreon/reactivity').catch(() => null)
  if (__px) {
    __px.activateReactiveDevtools()
    const __pxGet = __px.getFireSummaries
    const __pxInterval = ${JSON.stringify(intervalMs)}
    const __pxPost = () => {
      const summaries = __pxGet()
      const payload = JSON.stringify({
        fires: summaries.map((s) => ({
          file: s.loc.file,
          line: s.loc.line,
          count: s.count,
          kind: s.kind,
          lastFire: s.lastFire,
          rate1s: s.rate1s,
        })),
      })
      fetch('/__pyreon_lpih__', { method: 'POST', body: payload, headers: { 'content-type': 'application/json' } }).catch(() => {
        // Dev-server might be restarting; swallow + retry next interval.
      })
    }
    const __pxId = setInterval(__pxPost, __pxInterval)
    window.addEventListener('beforeunload', () => clearInterval(__pxId))
  }
  // If __px is null, @pyreon/reactivity isn't in the dep graph — stay silent,
  // LPIH is opt-in via the runtime API too. The dynamic-import catch returns
  // null instead of letting the rejection bubble so consumers without the
  // package don't see a console error.
</script>`
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

export function _skipStringLiteral(code: string, start: number, quote: string): number {
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

export function _extractBalancedArgs(code: string, start: number): string | null {
  let depth = 1
  for (let i = start; i < code.length; i++) {
    const ch = code[i]
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return code.slice(start, i)
    } else if (ch === '"' || ch === "'" || ch === '`') {
      i = _skipStringLiteral(code, i, ch)
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
      i = _skipStringLiteral(code, i, ch)
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
    const args = _extractBalancedArgs(code, argsStart)
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
 * Inject `{ name?, __sourceLocation: { file, line, col } }` into
 * `signal()` / `computed()` / `effect()` calls that don't already have
 * an options argument. Only runs in dev mode for debugging/devtools.
 *
 * Three forms covered:
 *
 *   `const count = signal(0)` →
 *     `const count = signal(0, { name: "count", __sourceLocation: {...} })`
 *
 *   `const doubled = computed(() => count() * 2)` →
 *     `const doubled = computed(() => count() * 2, { name: "doubled", __sourceLocation: {...} })`
 *
 *   `effect(() => console.log(count()))` →
 *     `effect(() => console.log(count()), { __sourceLocation: {...} })`
 *     (no `name` — anonymous effects have no binding to derive from)
 *
 * Module-scope signals rewritten to __hmr_signal() are naturally skipped
 * because the regex matches `signal(` not `__hmr_signal(`.
 *
 * **LPIH integration**: `__sourceLocation` is consumed by
 * `@pyreon/reactivity`'s `signal()` / `computed()` / `effect()` to skip
 * the `new Error().stack` capture in `_rdRegister` — saves ~2.2µs per
 * creation when devtools is active. The injected literal is byte-for-byte
 * the same info the runtime would have parsed from the stack, so behavior
 * is identical except no stack-parse cost.
 *
 * **Anonymous-effect detection**: `effect(` can also appear as a property
 * access (`obj.effect(...)`), a longer identifier (`sideEffect(...)`), or
 * a previously-injected call (`effect(fn, { ... })`). The unbound-effect
 * pass guards against all three:
 *   - preceded by NOT `[A-Za-z0-9_$.]` (so `.effect`/`sideEffect` skip)
 *   - args do NOT already contain a 2nd arg (`hasMultipleArgs` check)
 *
 * @param code - source text
 * @param moduleId - the file path to embed in the injected `__sourceLocation`.
 *                   Vite passes the resolved module ID (absolute path).
 */
function injectSignalNames(code: string, moduleId: string): string {
  // Pre-pass: mask string-literal, template-literal, and comment regions
  // so the regexes below don't false-fire on `effect(` inside docstrings,
  // help-text strings, JS-as-text test fixtures, or comments mentioning
  // reactive primitives. The regex runs against the MASKED code (positions
  // are preserved), so a match's index points at real code; args extraction
  // pulls from the ORIGINAL code for accurate output.
  //
  // Without this, user code like `const docs = \`effect(() => x)\`` would
  // get `, { __sourceLocation: ... }` injected INSIDE the template literal,
  // corrupting the help-text content at runtime.
  const masked = _maskStringsAndComments(code)

  // Pass 1: bound forms — `const X = (signal|computed|effect)(…)`.
  // Extract `X` as the debug name + the reactive primitive kind.
  const reBound = /(?:const|let)\s+(\w+)\s*=\s*(signal|computed|effect)\(/gm
  // Pass 2: unbound effect — `effect(() => …)` at statement position,
  // not following a member-access (.) or identifier char ($_a-zA-Z0-9).
  // Reactive primitives other than `effect` are rare without binding,
  // so we skip the bare `signal(` / `computed(` form to stay conservative.
  const reUnboundEffect = /(?<![\w$.])effect\(/gm

  type Match = {
    start: number
    end: number
    name: string | null
    args: string
    matchIdx: number
  }
  const matches: Match[] = []
  // Track call positions covered by pass 1 so pass 2 can skip them.
  const covered = new Set<number>()

  let m: RegExpExecArray | null = reBound.exec(masked)
  while (m !== null) {
    const argsStart = m.index + m[0].length
    const args = _extractBalancedArgs(code, argsStart)
    if (args !== null && !hasMultipleArgs(args)) {
      matches.push({
        start: argsStart,
        end: argsStart + args.length,
        name: m[1] ?? '',
        args,
        matchIdx: m.index,
      })
      // Mark the `effect(`/`signal(`/`computed(` token start so the
      // unbound-effect pass doesn't double-process it.
      const tokStart = m.index + m[0].length - (m[2]?.length ?? 0) - 1
      covered.add(tokStart)
    }
    m = reBound.exec(masked)
  }
  reBound.lastIndex = 0

  m = reUnboundEffect.exec(masked)
  while (m !== null) {
    if (!covered.has(m.index)) {
      const argsStart = m.index + m[0].length
      const args = _extractBalancedArgs(code, argsStart)
      if (args !== null && !hasMultipleArgs(args)) {
        matches.push({
          start: argsStart,
          end: argsStart + args.length,
          name: null,
          args,
          matchIdx: m.index,
        })
      }
    }
    m = reUnboundEffect.exec(masked)
  }
  reUnboundEffect.lastIndex = 0

  if (matches.length === 0) return code

  // Sort by descending start so back-to-front rewriting doesn't shift
  // later indices (each splice leaves earlier offsets unchanged).
  matches.sort((a, b) => b.start - a.start)

  // Pre-compute line offsets ONCE — avoids O(N²) when many calls share
  // a file. Each lookup becomes O(log N) via binary search.
  const lineStarts = _computeLineStarts(code)

  let output = code
  for (let i = 0; i < matches.length; i++) {
    const { start, end, name, args, matchIdx } = matches[i] as Match
    const { line, col } = _offsetToLineCol(matchIdx, lineStarts)
    const locLiteral = `__sourceLocation: { file: ${JSON.stringify(moduleId)}, line: ${line}, col: ${col} }`
    const inner = name !== null ? `name: ${JSON.stringify(name)}, ${locLiteral}` : locLiteral
    output = `${output.slice(0, start)}${args}, { ${inner} }${output.slice(end)}`
  }
  return output
}

/**
 * Mask string-literal / template-literal / comment regions in `code` by
 * replacing their content with spaces. Returns a SAME-LENGTH string so
 * regex match positions in the masked version line up with the original.
 *
 * Used by `injectSignalNames` to skip false-positive matches against
 * reactive-primitive names that appear inside strings or comments. Without
 * masking, a user's `const docs = \`effect(() => x)\`` template literal
 * would get `, { __sourceLocation: ... }` injected INSIDE the string,
 * corrupting runtime values.
 *
 * Handles:
 *   - `"..."` / `'...'` strings (escape-aware)
 *   - `` `...` `` template literals; interpolations `${...}` are KEPT as
 *     code (their content can contain real `signal()` calls worth catching)
 *   - `// ...` line comments
 *   - `/* ... *\/` block comments
 *
 * Regex literals (`/foo/g`) are NOT special-cased — they're rare and the
 * downstream extractBalancedArgs handles unmatched parens by returning null.
 *
 * @internal — exported for tests.
 */
export function _maskStringsAndComments(code: string): string {
  const out: string[] = []
  let i = 0
  const n = code.length
  while (i < n) {
    const c = code[i]
    const c1 = code[i + 1]

    // Line comment `// ...`
    if (c === '/' && c1 === '/') {
      while (i < n && code[i] !== '\n') {
        out.push(' ')
        i++
      }
      continue
    }
    // Block comment `/* ... */`
    if (c === '/' && c1 === '*') {
      out.push(' ', ' ')
      i += 2
      while (i < n) {
        if (code[i] === '*' && code[i + 1] === '/') {
          out.push(' ', ' ')
          i += 2
          break
        }
        // Preserve newlines so line numbers don't shift
        out.push(code[i] === '\n' ? '\n' : ' ')
        i++
      }
      continue
    }
    // String literal "..." or '...'
    if (c === '"' || c === "'") {
      const quote = c
      out.push(' ')
      i++
      while (i < n && code[i] !== quote) {
        // Escape sequence — skip the next char too (handles `\"`, `\\`, etc.)
        if (code[i] === '\\' && i + 1 < n) {
          // Preserve a newline (line-continuation `\<LF>`) as a newline.
          out.push(' ', code[i + 1] === '\n' ? '\n' : ' ')
          i += 2
          continue
        }
        // Unterminated string (legacy parsers stop at newline) — break
        if (code[i] === '\n') break
        out.push(' ')
        i++
      }
      if (i < n && code[i] === quote) {
        out.push(' ')
        i++
      }
      continue
    }
    // Template literal `...` — preserve `${...}` interpolations as code
    if (c === '`') {
      out.push(' ')
      i++
      while (i < n && code[i] !== '`') {
        if (code[i] === '\\' && i + 1 < n) {
          out.push(' ', code[i + 1] === '\n' ? '\n' : ' ')
          i += 2
          continue
        }
        // `${...}` — keep the interpolation body as code (with nested
        // brace tracking so we find the matching `}`).
        if (code[i] === '$' && code[i + 1] === '{') {
          out.push(' ', ' ')
          i += 2
          let depth = 1
          while (i < n && depth > 0) {
            if (code[i] === '{') {
              depth++
              out.push(code[i] ?? ' ')
              i++
              continue
            }
            if (code[i] === '}') {
              depth--
              if (depth === 0) {
                out.push(' ')
                i++
                break
              }
              out.push(code[i] ?? ' ')
              i++
              continue
            }
            // Inside `${}` — pass through as code (might contain `signal(` etc).
            out.push(code[i] ?? ' ')
            i++
          }
          continue
        }
        // Preserve newlines so line numbers don't shift.
        out.push(code[i] === '\n' ? '\n' : ' ')
        i++
      }
      if (i < n && code[i] === '`') {
        out.push(' ')
        i++
      }
      continue
    }
    out.push(c ?? '')
    i++
  }
  return out.join('')
}

/**
 * Compute the 0-indexed character offset for the start of each line.
 * `lineStarts[i]` is the offset of the FIRST character on line i+1
 * (1-based, so `lineStarts[0]` = offset 0 = line 1).
 *
 * @internal — exported for tests.
 */
export function _computeLineStarts(code: string): number[] {
  const starts: number[] = [0]
  for (let i = 0; i < code.length; i++) {
    if (code.charCodeAt(i) === 10) starts.push(i + 1) // \n
  }
  return starts
}

/**
 * Convert a 0-indexed offset to `{ line: 1-based, col: 1-based }` using a
 * pre-computed line-starts array. Binary search → O(log N) per lookup.
 *
 * @internal — exported for tests.
 */
export function _offsetToLineCol(
  offset: number,
  lineStarts: number[],
): { line: number; col: number } {
  // Binary search for the largest lineStarts[i] <= offset.
  let lo = 0
  let hi = lineStarts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1
    const v = lineStarts[mid]
    if (v !== undefined && v <= offset) lo = mid
    else hi = mid - 1
  }
  const lineStart = lineStarts[lo] ?? 0
  return { line: lo + 1, col: offset - lineStart + 1 }
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
  lines.push(`    if (typeof __s === "function" && __m && __s(${escapedId}, __m)) return;`)
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
  return code.replace(/(\s)className(\s*=)/g, '$1class$2').replace(/(\s)htmlFor(\s*=)/g, '$1for$2')
}

/**
 * Auto-inject `import { ... } from '<source>'` for bare JSX references
 * to canonical primitives. Closes the Phase D2 "literally same .tsx
 * file across web + native" gap — the native PMTC compiler resolves
 * bare tags via its canonical-primitives table (no import needed); the
 * web build needs the imports for symbol resolution.
 *
 * Pass shape:
 *   1. Regex-scan `<Name` JSX opening tags + `<Name/>` self-closing
 *      shapes against the configured names set.
 *   2. Parse existing imports from the source to find what's already
 *      imported as a value (we don't auto-add a name that's already in
 *      scope, regardless of source — a user-defined `<Button>` from a
 *      local file takes precedence).
 *   3. Inject the auto-import ONLY for names that are used but not
 *      already imported. Skips entirely if the diff is empty.
 *
 * Conservative by construction: regex matches only at JSX opening-tag
 * positions (`<Name` followed by `[\s/>]`). String/comment scans aren't
 * needed because the regex requires the `<` boundary. Names in regular
 * code positions (function calls, type references) don't trigger the
 * import.
 *
 * Same module's own export shape is detected — if the source exports
 * a `Stack` symbol via `export function Stack(...)` or `export const
 * Stack = ...`, the auto-import is suppressed for that name (it's
 * already a top-level identifier in scope, and importing from the
 * primitives package would shadow it).
 */
function autoImportCanonicalPrimitives(
  code: string,
  mappings: Array<{ source: string; names: string[] }>,
): string {
  if (mappings.length === 0) return code
  // Build a unified name → source map. First mapping wins on overlap.
  const nameToSource = new Map<string, string>()
  for (const { source, names } of mappings) {
    for (const n of names) {
      if (!nameToSource.has(n)) nameToSource.set(n, source)
    }
  }
  if (nameToSource.size === 0) return code

  // Mask out comments + string/template literals BEFORE scanning so
  // documentation containing literal `<Stack>` text inside JSDoc
  // doesn't false-positive as a JSX usage. Same trick used by other
  // syntactic scanners in this plugin (cf. `prescanIslandDeclarations`).
  // The mask preserves positions (replaces with spaces) so existing-
  // import detection later in this function still aligns with the
  // original source for the splice.
  const masked = _maskCommentsAndStrings(code)

  // Build alternation matching all configured names — single regex pass.
  const allNames = Array.from(nameToSource.keys())
  const nameAlt = allNames.join('|')
  const jsxTagRe = new RegExp(`<(${nameAlt})(?=[\\s/>])`, 'g')
  const used = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = jsxTagRe.exec(masked)) !== null) {
    used.add(m[1]!)
  }
  if (used.size === 0) return code

  // Find names already imported (any source). The auto-import respects
  // existing imports — we don't shadow a user's local symbol or
  // duplicate an already-explicit import from any source.
  // Use the MASKED source so JSDoc example imports
  // (`// import { Stack, ... } from '...'`) don't false-positive as
  // real imports.
  const alreadyInScope = _collectImportedNames(masked)

  // Detect same-module top-level declarations that shadow the
  // canonical names — `export function Stack(...)`, `function Stack`,
  // `const Stack = ...`. These are local symbols; auto-importing the
  // upstream package would shadow them.
  for (const name of allNames) {
    const declRe = new RegExp(
      `(?:^|\\n)\\s*(?:export\\s+)?(?:function\\s+${name}\\b|const\\s+${name}\\b|let\\s+${name}\\b|var\\s+${name}\\b|class\\s+${name}\\b)`,
    )
    if (declRe.test(code)) alreadyInScope.add(name)
  }

  // The set to inject, grouped by source.
  const bySource = new Map<string, string[]>()
  for (const name of used) {
    if (alreadyInScope.has(name)) continue
    const src = nameToSource.get(name)!
    if (!bySource.has(src)) bySource.set(src, [])
    bySource.get(src)!.push(name)
  }
  if (bySource.size === 0) return code

  // Apply per-source: extend existing import OR prepend new line.
  // Use the MASKED code to find existing-import positions so JSDoc
  // examples like `// import { X } from '@pyreon/primitives'` don't
  // false-match. The splice itself targets the ORIGINAL `code` at the
  // same position (mask preserves positions char-for-char).
  let result = code
  let workMask = masked
  // Process sources in stable order (mapping order) so output is
  // deterministic across runs.
  const orderedSources = mappings.map((mp) => mp.source).filter((s, i, a) => a.indexOf(s) === i)
  for (const source of orderedSources) {
    const toInject = bySource.get(source)
    if (!toInject || toInject.length === 0) continue
    toInject.sort()
    const existingImportRe = new RegExp(
      `import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${escapeRegex(source)}['"]`,
    )
    const existing = existingImportRe.exec(workMask)
    if (existing) {
      // Reuse the matched specifier list from the original (not masked)
      // source so aliases like `Stack as Container` survive.
      const realMatch = result.slice(existing.index, existing.index + existing[0].length)
      const insideBraces = /\{([^}]*)\}/.exec(realMatch)?.[1] ?? ''
      const existingSpecifiers = insideBraces
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      // Set-dedupe by LOCAL name (last-`as`-segment or whole spec).
      const existingLocalNames = new Set(
        existingSpecifiers.map((s) => {
          const asIdx = s.indexOf(' as ')
          return asIdx >= 0 ? s.slice(asIdx + 4).trim() : s
        }),
      )
      const merged = [...existingSpecifiers]
      for (const n of toInject) {
        if (!existingLocalNames.has(n)) merged.push(n)
      }
      merged.sort()
      const newImport = `import { ${merged.join(', ')} } from '${source}'`
      const before = result.slice(0, existing.index)
      const after = result.slice(existing.index + existing[0].length)
      result = before + newImport + after
      // Keep the mask aligned so subsequent passes (multiple sources)
      // re-search correctly. Replace the matched region in the mask
      // with spaces of the new-length so position-alignment continues
      // to hold for the post-region of the mask.
      const beforeM = workMask.slice(0, existing.index)
      const afterM = workMask.slice(existing.index + existing[0].length)
      workMask = beforeM + ' '.repeat(newImport.length) + afterM
    } else {
      const importLine = `import { ${toInject.join(', ')} } from '${source}'\n`
      result = importLine + result
      workMask = ' '.repeat(importLine.length) + workMask
    }
  }
  return result
}

/**
 * Replace JS comments with spaces while preserving line/column
 * positions. Used by the auto-import scanner so `<Stack>` text inside
 * JSDoc doesn't false-positive as a JSX usage. Position preservation
 * lets the caller use the masked code for regex SEARCH and the
 * original code for SPLICE.
 *
 * String literals are deliberately LEFT VISIBLE — they often carry
 * the package name we need to match (`from '@pyreon/primitives'`).
 * The trade-off: a literal `'<Stack/>'` inside a string would
 * false-positive, but that's vanishingly rare compared to JSDoc
 * examples + the cost of either making string-aware AST parsing OR
 * masking only the LITERAL TEXT (not the quotes) is not worth it
 * for the marginal correctness gain.
 *
 * Handles:
 *   - line comments  `// ... newline`
 *   - block comments `/* ... *​/`
 */
export function _maskCommentsAndStrings(code: string): string {
  const out: string[] = new Array(code.length)
  let i = 0
  const n = code.length
  while (i < n) {
    const c = code[i] ?? ''
    const c2 = code[i + 1] ?? ''
    // Block comment
    if (c === '/' && c2 === '*') {
      const end = code.indexOf('*/', i + 2)
      const stop = end < 0 ? n : end + 2
      for (let j = i; j < stop; j++) out[j] = code[j] === '\n' ? '\n' : ' '
      i = stop
      continue
    }
    // Line comment
    if (c === '/' && c2 === '/') {
      let j = i
      while (j < n && code[j] !== '\n') {
        out[j] = ' '
        j++
      }
      i = j
      continue
    }
    out[i] = c
    i++
  }
  return out.join('')
}

/** Collect every name imported via `import { ... }` / `import X` / `import * as X`. */
export function _collectImportedNames(code: string): Set<string> {
  const out = new Set<string>()
  // Named imports: `import { A, B as C } from '...'`
  const namedRe = /import\s*(?:type\s+)?\{([^}]+)\}\s*from\s*['"][^'"]+['"]/g
  let m: RegExpExecArray | null
  while ((m = namedRe.exec(code)) !== null) {
    for (const spec of m[1]!.split(',')) {
      const trimmed = spec.trim()
      if (!trimmed) continue
      // `A` or `A as B` — the LOCAL name is what matters (the part
      // after `as`, or the original if no rename).
      const asIdx = trimmed.indexOf(' as ')
      out.add(asIdx >= 0 ? trimmed.slice(asIdx + 4).trim() : trimmed)
    }
  }
  // Default + namespace imports: `import D from '...'` / `import * as N from '...'`
  const defaultRe = /import\s+(\w+)(?:\s*,\s*\{[^}]*\})?\s+from\s*['"][^'"]+['"]/g
  while ((m = defaultRe.exec(code)) !== null) {
    out.add(m[1]!)
  }
  const nsRe = /import\s+\*\s+as\s+(\w+)\s+from\s*['"][^'"]+['"]/g
  while ((m = nsRe.exec(code)) !== null) {
    out.add(m[1]!)
  }
  return out
}

/** Escape a string for safe use inside a RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
      const raw = readFileSync(file, 'utf-8')
      // Same auto-naming the transform applies — keeps the prescan's view
      // of derived names byte-identical to what the runtime will receive.
      const code = injectIslandNames(raw, file, root) ?? raw
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
): boolean {
  // `[\s\S]` lets the options block span multiple lines. The lazy `?` after
  // the options block prevents over-matching when several `island()` calls
  // appear in the same file.
  // `[^}]{0,500}` instead of `[\s\S]*?` — real island() option blocks
  // are tiny (`{ name: 'X', hydrate: 'load' }`); excluding `}` from
  // the inner class also tightens the match against the outer `\}`.
  const ISLAND_CALL_RE =
    /island\s*\(\s*\(\s*\)\s*=>\s*import\s*\(\s*['"]([^'"]+)['"]\s*\)\s*,\s*\{([^}]{0,500})\}\s*\)/g
  const decls: IslandDecl[] = []
  let match: RegExpExecArray | null
  while ((match = ISLAND_CALL_RE.exec(code)) !== null) {
    const importPath = match[1]!
    const optsBlock = match[2]!
    const nameMatch = /(?:^|[\s,{])name\s*:\s*['"]([^'"]+)['"]/.exec(optsBlock)
    if (!nameMatch) continue // can't auto-register without a name
    const hydrateMatch = /(?:^|[\s,{])hydrate\s*:\s*['"]([^'"]+)['"]/.exec(optsBlock)
    const hydrate = hydrateMatch ? hydrateMatch[1]! : 'load'
    // PR-S12: Windows path normalization. `pathJoin` uses native
    // separators — on Windows that's `\`. The emitted `loaderAbsPath`
    // goes into a JSON string in `renderIslandsRegistry`, then into
    // `import('${path}')` in the generated registry module. Vite's
    // resolver expects FORWARD slashes regardless of OS, so backslash
    // paths fail to resolve. `normalizeModuleId` already does the
    // forward-slash conversion (its body is `id.replace(/\\/g, '/')`),
    // so applying it to the resolved path before storage closes the
    // Windows-dev gap.
    const rawAbsPath = importPath.startsWith('.')
      ? resolveRelative(filePath, importPath)
      : importPath
    const loaderAbsPath = normalizeModuleId(rawAbsPath)
    decls.push({ name: nameMatch[1]!, hydrate, loaderAbsPath })
  }
  // PR-S12: return whether the registry actually changed so the caller
  // can decide whether to invalidate downstream consumers (the
  // `virtual:pyreon/islands-registry` virtual module). Without change
  // detection, every transform call would invalidate the virtual module
  // even when no island declarations changed — slow and noisy.
  const key = normalizeModuleId(filePath)
  const existing = registry.get(key)
  const changed = !islandDeclsEqual(existing, decls.length > 0 ? decls : undefined)
  if (decls.length > 0) {
    registry.set(key, decls)
  } else {
    // Clean up if file no longer declares islands (e.g. after edit)
    registry.delete(key)
  }
  return changed
}

/** PR-S12: structural equality check for IslandDecl arrays. */
function islandDeclsEqual(a: IslandDecl[] | undefined, b: IslandDecl[] | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!
    const bi = b[i]!
    if (ai.name !== bi.name || ai.hydrate !== bi.hydrate || ai.loaderAbsPath !== bi.loaderAbsPath) {
      return false
    }
  }
  return true
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
function renderIslandsRegistry(registry: Map<string, IslandDecl[]>, enabled: boolean): string {
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
async function prescanSignalExports(
  root: string,
  registry: Map<string, Set<string>>,
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
// Bounded `\s{1,10}` instead of unbounded `\s+` to remove worst-case
// backtracking; real import specifiers have 1-2 spaces around `as`.
const AS_SPLIT_RE = /\s{1,10}as\s{1,10}/

function scanSignalExports(
  code: string,
  moduleId: string,
  registry: Map<string, Set<string>>,
): void {
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
    // Bounded `[^}]{1,500}` — real export blocks fit easily.
    const NAMED_EXPORT_RE = /export\s*\{([^}]{1,500})\}/g
    while ((match = NAMED_EXPORT_RE.exec(code)) !== null) {
      // Skip re-exports (export { x } from '...')
      const afterBrace = code.slice(match.index + match[0].length).trimStart()
      if (afterBrace.startsWith('from')) continue

      for (const spec of match[1]!.split(',')) {
        const trimmed = spec.trim()
        if (!trimmed) continue
        const parts = trimmed.split(AS_SPLIT_RE)
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
  pluginCtx: {
    resolve: (
      id: string,
      importer?: string,
      options?: { skipSelf: boolean },
    ) => Promise<{ id: string } | null>
  },
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

      const parts = trimmed.split(AS_SPLIT_RE)
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
