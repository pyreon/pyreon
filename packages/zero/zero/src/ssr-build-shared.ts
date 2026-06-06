/**
 * Shared infrastructure for SSR/ISR/SSG build hooks.
 *
 * SSG (`ssg-plugin.ts`) and SSR/ISR (`ssr-plugin.ts`) both need to:
 *
 *   1. Materialize a synthetic SSR entry to disk (because Rolldown's
 *      `rollupOptions.input` doesn't resolve `\0`-prefixed virtual ids
 *      at the entry-resolution stage — see SSG plugin notes).
 *   2. Run a programmatic Vite `build()` against that entry with the
 *      same plugin chain the outer build uses.
 *   3. Gate against infinite recursion via an env-flag — the inner
 *      sub-build loads the same vite config + plugin chain, so without
 *      a flag the outer hook would re-trigger inside the inner build.
 *
 * Factoring these three pieces into ONE module eliminates the drift
 * risk where SSG and SSR could independently evolve their env-flag
 * cleanup / entry-write / build-config recipes and diverge. The shared
 * helpers are the single source of truth; the per-mode plugins
 * (`ssg-plugin.ts`, `ssr-plugin.ts`) only own their mode-specific
 * post-render work (manifest emission, adapter dispatch, etc.).
 *
 * NOT a public API surface — exported via `_internal` on each plugin
 * for unit-test access, never re-exported from `@pyreon/zero/server`.
 */

import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import type { BuildOptions, Plugin } from 'vite'
import type { ZeroConfig } from './types'

/**
 * The kind of synthetic entry to render. SSG needs a full per-path
 * renderer (the existing ~250-LOC template in `ssg-plugin.ts`); SSR/ISR
 * needs the canonical 6-line `createServer({ routes, routeMiddleware,
 * apiRoutes })` shape that consumer apps write by hand. Both pull from
 * the same `virtual:zero/*` modules so the inner-build plugin chain
 * resolves identically.
 */
export type SsrEntryKind = 'ssg' | 'ssr' | 'isr'

export interface RenderSsrEntryOptions {
  kind: SsrEntryKind
  /**
   * Locale list baked into the SSG entry so the per-locale 404 walker
   * (PR K) can detect which RouteRecord serves which locale at
   * module-eval time. Empty array for non-SSG kinds.
   */
  locales: readonly string[]
}

/**
 * Generate the synthetic SSR entry source for a build mode.
 *
 * For `kind: 'ssg'` this delegates to `renderSsgEntrySource` (defined
 * in `ssg-plugin.ts` and forwarded here at registration time — see
 * `_registerSsgEntryRenderer` below). The dependency direction keeps
 * the SSG-specific renderer co-located with its closeBundle wiring.
 *
 * For `kind: 'ssr' | 'isr'` this emits the canonical entry that mirrors
 * what users hand-write in `src/entry-server.ts`:
 *
 *   import { routes } from "virtual:zero/routes"
 *   import { routeMiddleware } from "virtual:zero/route-middleware"
 *   import { apiRoutes } from "virtual:zero/api-routes"
 *   import { createServer } from "@pyreon/zero/server"
 *
 *   export default createServer({ routes, routeMiddleware, apiRoutes })
 *
 * `createServer` handles the mode dispatch internally via
 * `wireRenderMode(config.mode, baseHandler, config)` — so the same
 * synthetic entry works for both `'ssr'` and `'isr'`. The runtime
 * decides which wrapper applies.
 *
 * The synthetic entry deliberately does NOT carry user-authored
 * middleware (`securityHeaders()`, `cacheMiddleware()`, custom ssr
 * mode overrides). Consumers who need those write their own
 * `src/entry-server.ts` and the SSR plugin's `existsSync` precondition
 * picks that file up instead of generating a synthetic one.
 */
export function renderSsrEntrySource(options: RenderSsrEntryOptions): string {
  if (options.kind === 'ssg') {
    if (!_ssgEntryRenderer) {
      throw new Error(
        '[Pyreon] SSG entry renderer not registered. Import ssg-plugin before calling renderSsrEntrySource({ kind: "ssg" }).',
      )
    }
    return _ssgEntryRenderer(options.locales)
  }
  // SSR / ISR: canonical createServer body. Same module shape as
  // `examples/ssr-showcase/src/entry-server.ts`.
  return `import { routes } from "virtual:zero/routes"
import { routeMiddleware } from "virtual:zero/route-middleware"
import { apiRoutes } from "virtual:zero/api-routes"
import { createServer } from "@pyreon/zero/server"

export default createServer({ routes, routeMiddleware, apiRoutes })
`
}

/**
 * Dependency-inversion hook: `ssg-plugin.ts` registers its
 * locale-aware renderer here at module load (so SSG-shaped imports
 * don't transitively pull the SSR plugin and vice-versa). Mirrors
 * the `_setDefaultChromeLayout` pattern in `@pyreon/router`'s
 * `match.ts` and `_setLocaleStoreReader` in `i18n-routing.ts`.
 */
type SsgEntryRenderer = (locales: readonly string[]) => string
let _ssgEntryRenderer: SsgEntryRenderer | null = null

/**
 * Wire the SSG entry renderer into the shared dispatcher. Called once
 * from `ssg-plugin.ts` at module load.
 *
 * @internal
 */
export function _registerSsgEntryRenderer(renderer: SsgEntryRenderer): void {
  _ssgEntryRenderer = renderer
}

export interface BuildSsrBundleOptions {
  /** Project root — passed to Vite as `root`. */
  root: string
  /** Absolute path to the synthetic entry file on disk. */
  entryPath: string
  /** Output directory for the inner SSR sub-build. */
  outDir: string
  /** Output filename (e.g. `entry-server.js`). */
  outputFilename: string
  /**
   * Env-var name used to gate the outer-plugin hook from re-triggering
   * inside the inner build. Per-mode flag namespaces eliminate the
   * cross-mode flag-leak failure class.
   */
  envFlag: string
  /** Original user config — forwarded to the recursively-loaded plugin chain. */
  userConfig: ZeroConfig
  /**
   * The OUTER (client) build's `build.assetsInlineLimit`, captured from the
   * plugin's `configResolved` hook. The inner build runs with `configFile:
   * false` (it must NOT re-load + re-run the user's whole vite.config), so
   * without this it falls back to Vite's 4 KB default — meaning a `<= 4 KB`
   * asset the client build emitted as a hashed file gets inlined as a `data:`
   * URI in the SSR/SSG-rendered HTML. The two builds then disagree on the
   * `<img src>` of every small image: an avoidable hydration mismatch (client
   * expects `/assets/x-HASH.png`, SSR baked `data:image/...`). Threading the
   * outer value keeps asset emission identical across the two builds.
   * `undefined` → the inner build keeps Vite's default (no behaviour change
   * for apps that don't set it).
   */
  /**
   * The OUTER (client) build's resolved `base` URL. Without forwarding
   * this to the inner SSR build, the inner build defaults to `/` and
   * any SSR-rendered asset URL constructed from `__ZERO_BASE__` (e.g.
   * `<img src={`${__ZERO_BASE__}brand/logo.svg`} />` in user components)
   * gets BAKED into the prerendered HTML with the wrong prefix. The
   * client-side hydration then renders the correct prefix and triggers
   * a hydration mismatch — OR users see 404s on initial load before the
   * client patches the DOM.
   *
   * Pre-fix the configResolved-sync of `__ZERO_BASE__` in vite-plugin.ts
   * only worked for the OUTER build; the inner build's `resolvedConfig.base`
   * was always `/` because `configFile: false` doesn't replay the outer
   * vite.config.ts and the inner `build({...})` call didn't receive
   * `base`. Captured from the outer's `configResolved` and threaded
   * here so both builds agree on the asset prefix.
   */
  base?: string
  assetsInlineLimit?: BuildOptions['assetsInlineLimit']
  /** The OUTER build's `build.assetsDir` — same URL-consistency rationale. */
  assetsDir?: string | undefined
  /**
   * USER plugins from the outer Vite config — propagated into the inner
   * SSR sub-build so non-zero plugins (`@pyreon/zero-content`'s
   * `content()`, custom Vite plugins, etc.) can still resolve their
   * virtual modules + transform their file types inside the SSG path
   * enumeration + per-page render passes.
   *
   * Pre-fix the inner build's plugin chain was hardcoded to
   * `[pyreon(), zeroPlugin()]`. The SSG plugin's `getStaticPaths`
   * enumeration evaluates the user's route files in the inner SSR
   * module graph; if any route imports a virtual module from a user
   * plugin (e.g. `virtual:zero-content/collections`), or imports a
   * file type the user plugin transforms (e.g. `.md` for
   * `@pyreon/zero-content`), Rolldown couldn't resolve it and the
   * build failed with `Cannot assign to this expression` for `.md`
   * files or `Failed to resolve import` for virtual ids.
   *
   * Excluded from the forwarded set: any plugin whose name starts
   * with `pyreon-zero` or `pyreon-vite-plugin` — those are added back
   * by the inner build's own `[pyreon(), zeroPlugin()]` array. Adding
   * them twice would double-register hooks and crash with duplicate-
   * virtual-module errors.
   */
  userPlugins?: readonly Plugin[]
}

/**
 * Construct the inner sub-build's `build` options. Pure + exported so the
 * config can be asserted without spawning a real Vite build. `target: 'esnext'`
 * and the `format: 'es'` / `external: [/^node:/]` rollup output are
 * deliberately SSR-runtime-fixed (NOT inherited from the user), whereas the
 * asset-emission settings (`assetsInlineLimit`, `assetsDir`) ARE inherited so
 * the rendered HTML's asset URLs match the client.
 *
 * `external: [/^node:/]` keeps Node builtins unbundled. The SSR handler depends
 * on them (`node:async_hooks` for `runWithRequestContext`, `node:fs` for the
 * template fallback); they resolve natively on Node/Bun (node/vercel/netlify
 * adapters) AND on Cloudflare workerd — but workerd ONLY resolves `node:*` with
 * the `nodejs_compat` flag, which the create-zero cloudflare scaffold provides
 * (`wrangler.toml: compatibility_flags = ["nodejs_compat"]`). Without it the
 * worker fails to start at module-eval. See the cloudflareAdapter JSDoc.
 */
export function buildInnerBuildOptions(options: BuildSsrBundleOptions): BuildOptions {
  const build: BuildOptions = {
    ssr: options.entryPath,
    outDir: options.outDir,
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      input: options.entryPath,
      output: {
        format: 'es',
        entryFileNames: options.outputFilename,
      },
      external: [/^node:/],
    },
  }
  if (options.assetsInlineLimit !== undefined) build.assetsInlineLimit = options.assetsInlineLimit
  if (options.assetsDir !== undefined) build.assetsDir = options.assetsDir
  return build
}

/**
 * Run a programmatic Vite `build()` against the synthetic entry.
 *
 * Owns the env-flag set/clear recipe in a try/finally — both the SSG
 * and SSR/ISR plugins go through this same helper, so the cleanup
 * contract can never diverge. Pre-extraction the recipe lived inline
 * in `ssg-plugin.ts` and any new mode-plugin would have copy-pasted
 * it (with the typical "I'll just tweak one thing" drift hazard).
 *
 * The `external: [/^node:/]` keeps Node builtins from being bundled.
 * They resolve natively on Node/Bun and — via the `nodejs_compat` flag —
 * on Cloudflare workerd (see `buildInnerBuildOptions` above). Same
 * `target: 'esnext'` and `format: 'es'` as the SSG sub-build so the
 * runtime contract is identical across modes.
 */
export async function buildSsrBundle(options: BuildSsrBundleOptions): Promise<void> {
  // Lazy-load Vite so the plugin doesn't pull it into the runtime dep
  // graph at module-evaluation time. Same pattern as ssg-plugin.ts.
  const { build } = await import('vite')

  // Re-assemble zero's plugin chain plus `@pyreon/vite-plugin` (JSX
  // compiler) — every Pyreon app already has both. Loading both
  // lazily keeps this helper off the module-eval critical path.
  // Env-flag gate prevents the inner plugin instance from re-triggering
  // its own closeBundle.
  process.env[options.envFlag] = '1'
  try {
    const [{ zeroPlugin }, pyreonModule] = await Promise.all([
      import('./vite-plugin'),
      import('@pyreon/vite-plugin'),
    ])
    const pyreon = (pyreonModule as { default: () => unknown }).default

    // Forward user-supplied plugins from the outer Vite config so non-
    // zero plugins (most importantly @pyreon/zero-content's content()
    // plugin which transforms .md → .tsx and serves
    // virtual:zero-content/* modules) work inside the SSG path-
    // enumeration + per-page render passes.
    //
    // Two categories of plugins are EXCLUDED from inner-build forwarding:
    //
    // 1. Re-added by the inner build via `[pyreon(), zeroPlugin()]` —
    //    adding them twice crashes with duplicate-hook / duplicate-
    //    virtual-module / duplicate-helper-declaration errors.
    //    The pyreon JSX plugin is registered with name `pyreon` (see
    //    `packages/tools/vite-plugin/src/index.ts:625`), NOT
    //    `pyreon-vite-plugin` (which is the PACKAGE name). zeroPlugin
    //    auto-mounts `ssg`/`ssr`/`images`/`fonts`/`font-import` based on
    //    user config — those also re-instantiate inside the inner build.
    //
    // 2. Stateful plugins from `@pyreon/zero` that the user imports +
    //    adds to the chain themselves. These capture `distDir` from
    //    their OUTER `configResolved` hook but their `closeBundle` runs
    //    AFTER the inner build returns control to the outer flow.
    //    Forwarding the plugin INSTANCE causes the inner build's
    //    `configResolved` to mutate the captured `distDir` to the inner
    //    sub-dist (`<dist>/.zero-ssg-server`), so the outer
    //    `closeBundle` then writes output to the WRONG location.
    //    Symptom: `sitemap.xml` disappears from `dist/` because
    //    `seoPlugin`'s distDir got rewritten. Same shape would apply
    //    to `og-image`, `favicon`, `ai`, `i18n-routing`.
    //    These plugins DON'T need to be in the inner build anyway —
    //    they're output-emission plugins, not source-transform or
    //    virtual-module-serving plugins.
    //
    // EVERY OTHER plugin (including `pyreon-zero-content` which is the
    // most important non-zero plugin in practice — it transforms `.md`
    // → `.tsx` AND serves `virtual:zero-content/*` modules, both needed
    // inside the SSG inner build for `getStaticPaths` enumeration) is
    // forwarded as-is.
    const RE_ADDED_PLUGIN_NAMES = new Set([
      // Category 1 — re-added by the inner build:
      'pyreon',
      'pyreon-zero',
      'pyreon-zero-ssg',
      'pyreon-zero-ssr',
      'pyreon-zero-images',
      'pyreon-zero-fonts',
      'pyreon-zero-font-import',
      // Category 2 — stateful output-emission plugins that mutate
      // captured state in `configResolved` (see comment above):
      'pyreon-zero-seo',
      'pyreon-zero-og-image',
      'pyreon-zero-favicon',
      'pyreon-zero-ai',
      'pyreon-zero-i18n-routing',
    ])
    const userPlugins = (options.userPlugins ?? []).filter((p) => {
      const name =
        typeof p === 'object' && p !== null ? (p as { name?: string }).name : ''
      if (!name) return true
      return !RE_ADDED_PLUGIN_NAMES.has(name)
    })

    // Synthesize the inner build's zero config with the outer build's
    // resolved base. The plugin's `config()` return BEATS the inline
    // `build({base})` arg in Vite's merge order (the PR #1395 trap), so
    // we must inject the base via `zeroPlugin(userConfig)` not via the
    // top-level build call. Defaulting back to `userConfig` when no
    // base was forwarded (e.g. older callers).
    const innerZeroConfig: ZeroConfig =
      options.base !== undefined && options.base !== '/'
        ? { ...options.userConfig, base: options.base }
        : options.userConfig

    await build({
      root: options.root,
      mode: 'production',
      logLevel: 'error',
      configFile: false,
      publicDir: false,
      // Also pass at top-level for any non-zero consumer that reads
      // `resolvedConfig.base` directly (forwarded plugins, etc.).
      ...(options.base !== undefined ? { base: options.base } : {}),
      plugins: [pyreon(), zeroPlugin(innerZeroConfig), ...userPlugins] as Plugin[],
      resolve: { conditions: ['bun'] },
      build: buildInnerBuildOptions(options),
    })
  } finally {
    delete process.env[options.envFlag]
  }
}

/**
 * Write the synthetic entry to disk inside the project root. The path
 * must sit at `root` (not under `node_modules/`) so its imports resolve
 * relative to the user's source tree — the inner build's plugin chain
 * picks it up identically to user-authored code.
 *
 * Caller is responsible for cleanup (best-effort `rm` in a `finally`
 * block at the call site). The helper just writes the file.
 */
export async function materializeEntry(entryPath: string, source: string): Promise<void> {
  await writeFile(entryPath, source, 'utf-8')
}

/**
 * Write `content` to `target` atomically: write to a sibling temp file
 * first, then `rename` into place. Rename is an atomic syscall on POSIX
 * (and Windows for same-volume renames) — readers either see the OLD
 * content or the FULL new content, never a half-written file.
 *
 * Used for manifests that adapters consume (`_redirects`,
 * `_pyreon-ssg-paths.json`, `_pyreon-revalidate.json`, etc.). A SIGINT
 * during a sequential plain-`writeFile` chain in `closeBundle` would
 * leave partial state: half the manifests pointing at the new render,
 * half the old. Atomic writes mean each manifest is independently
 * consistent.
 *
 * Per-page HTML writes (`dist/<path>/index.html`) intentionally do NOT
 * use this — they're individually-readable files (no cross-file
 * invariants), and the rename-per-page cost on 10k-path sites would
 * be significant.
 *
 * @internal
 */
let _atomicSeq = 0
export async function writeFileAtomic(
  target: string,
  content: string | Uint8Array,
): Promise<void> {
  const tmp = `${target}.tmp.${process.pid}.${++_atomicSeq}`
  try {
    await writeFile(tmp, content)
    await rename(tmp, target)
  } catch (err) {
    // Best-effort cleanup — if rename succeeded the tmp file is gone;
    // if it failed (or writeFile failed), unlink it. unlink-on-missing
    // is fine.
    try {
      await unlink(tmp)
    } catch {
      // Already gone (rename succeeded, or writeFile never produced it).
    }
    throw err
  }
}

/**
 * Inject a rendered SSR result into the index.html template. Prefers
 * Pyreon's `<!--pyreon-head-->` / `<!--pyreon-app-->` /
 * `<!--pyreon-scripts-->` placeholders; falls back to inserting before
 * `</head>` / inside `<div id="app">` / before `</body>` so a bare
 * Vite-style `index.html` (no Pyreon comments) still receives content.
 *
 * Shared so the 404 emission path AND any future SSR-side
 * template-injection logic apply the exact same injection rules —
 * keeps rendered pages subject to the same head/body/scripts pipeline
 * (styler tag, @pyreon/head meta, hashed asset preload links).
 *
 * @internal
 */
export function injectIntoTemplate(
  template: string,
  result: { appHtml: string; head: string; loaderScript: string },
): string {
  let html = template
  if (html.includes('<!--pyreon-head-->')) {
    html = html.replace('<!--pyreon-head-->', result.head)
  } else if (result.head) {
    html = html.replace('</head>', `${result.head}</head>`)
  }
  if (html.includes('<!--pyreon-app-->')) {
    html = html.replace('<!--pyreon-app-->', result.appHtml)
  } else if (result.appHtml) {
    const appDivMatch = html.match(/<div\s+id=["']app["']\s*>([\s\S]*?)<\/div>/)
    if (appDivMatch) {
      html = html.replace(appDivMatch[0], `<div id="app">${result.appHtml}</div>`)
    } else {
      html = html.replace('</body>', `<div id="app">${result.appHtml}</div></body>`)
    }
  }
  if (html.includes('<!--pyreon-scripts-->')) {
    html = html.replace('<!--pyreon-scripts-->', result.loaderScript)
  } else if (result.loaderScript) {
    html = html.replace('</body>', `${result.loaderScript}</body>`)
  }
  return html
}

/**
 * Dedup mkdir calls across a per-path render loop. Concurrent workers
 * often mkdir the SAME directory; without dedup, every path makes its
 * own `mkdir(dirname, { recursive: true })` call — N filesystem
 * syscalls for N paths even when they share parent directories.
 *
 * `mkdirOnce` returns a cached Promise per directory string. First
 * call launches the mkdir; concurrent callers await the SAME Promise.
 * After resolution the Promise stays cached — subsequent paths skip
 * the mkdir entirely.
 *
 * Cache is per-build: cleared at the start AND end of each
 * `closeBundle` via `_resetMkdirCache()`.
 *
 * @internal
 */
const _mkdirCache = new Map<string, Promise<void>>()
export async function mkdirOnce(dir: string): Promise<void> {
  let p = _mkdirCache.get(dir)
  if (!p) {
    p = mkdir(dir, { recursive: true }).then(() => undefined)
    _mkdirCache.set(dir, p)
  }
  await p
}
export function _resetMkdirCache(): void {
  _mkdirCache.clear()
}
export function _peekMkdirCacheSize(): number {
  return _mkdirCache.size
}
