/**
 * Import the modules discovery found, and attach the real component functions.
 *
 * Discovery is deliberately static — it reads source and infers prop shapes
 * without executing anything, which is why it is fast and safe to run over a
 * whole project. The consequence is that `ComponentIntelligence.component` is
 * undefined, so every check that needs to MOUNT skips. The mount harness
 * without this is a road with no on-ramp.
 *
 * It is opt-in and separate from discovery for a reason: importing a project's
 * modules runs its top-level code, and that is the user's decision.
 *
 * ## Why a Vite loader rather than a bare `import()`
 *
 * A bare dynamic import was the obvious first cut and it is WRONG, in a way
 * that is invisible until something mounts. The importing runtime compiles the
 * `.tsx`, and the project's JSX configuration is not necessarily in effect:
 * under bun, the repo's `"jsx": "preserve"` (correct — Vite does the transform)
 * means bun falls back to its OWN default, the React automatic runtime. Every
 * component then compiles against React, and mounting fails with
 *
 *     Invalid VNode type: … received symbol (Symbol(react.fragment))
 *
 * which reads like a broken component and is really a broken loader. Loading
 * through Vite runs the project's real plugin chain, `@pyreon/vite-plugin`
 * included, so what gets mounted is what the project actually ships.
 *
 * Honest limit, stated where it matters: `ssrLoadModule` transforms in SSR
 * mode, so a component arrives via the compiler's `h()` lowering rather than
 * the `_tpl()` template path a browser build produces. The two are both
 * supported Pyreon paths and both mount, but they are KNOWN to diverge on
 * reactivity lowering — so a check on this loader may claim what threw, and
 * must never claim a reactivity verdict. That belongs to `atlas dev`, where a
 * real browser runs the real client build.
 */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ComponentIntelligence, ComponentRef } from '../core'
import { defineAtlasPlugin } from '../plugins'
import type { AtlasPlugin, DecorateContext } from '../plugins'
import { hostCollectGarbage, type MountRuntime, sizeOfGraph } from '../verify/harness'
import {
  type PackageMap,
  resolveFromWorkspace,
  resolveWorkspaceSpecifier,
} from './workspace-packages'

/** Loads a module by absolute path. */
export interface ModuleLoader {
  load(file: string): Promise<Record<string, unknown>>
  close(): Promise<void>
  /** How modules are being compiled — reported in diagnostics. */
  kind: 'vite' | 'runtime'
}

/** The always-available fallback: whatever transform the host runtime applies. */
export function runtimeLoader(): ModuleLoader {
  return {
    kind: 'runtime',
    load: (file) => import(pathToFileURL(file).href) as Promise<Record<string, unknown>>,
    close: async () => {},
  }
}

/**
 * A loader backed by the project's own Vite pipeline.
 *
 * Falls back to the runtime loader when Vite or the Pyreon plugin is missing —
 * a library validating its catalog in CI without Vite still gets *something*,
 * and `kind` says which it got rather than leaving the caller to guess.
 */
export async function createModuleLoader(
  root: string,
  packages: PackageMap = new Map(),
): Promise<ModuleLoader> {
  // Structural types, not `typeof import('vite')`: naming Vite's types here
  // would put it in the type graph unconditionally, defeating the dynamic
  // import — `atlas scan` must typecheck in a project that has no Vite.
  type ViteServer = {
    ssrLoadModule: (url: string) => Promise<Record<string, unknown>>
    close: () => Promise<void>
  }
  type CreateServer = (config: Record<string, unknown>) => Promise<ViteServer>

  let createServer: CreateServer
  let plugin: unknown
  try {
    createServer = ((await import('vite')) as unknown as { createServer: CreateServer }).createServer
    const mod = (await import('@pyreon/vite-plugin')) as unknown as {
      default?: (o?: unknown) => unknown
      pyreon?: (o?: unknown) => unknown
    }
    const factory = mod.default ?? mod.pyreon
    // Not a throw: this is a resolution outcome, not an error to report. The
    // caller's fallback is a perfectly good loader.
    if (typeof factory !== 'function') return runtimeLoader()
    // `devErrorPrinter` injects a virtual module for a browser console this
    // loader does not have; `ssrTemplate` would lower JSX to string templates,
    // and a string cannot be mounted.
    plugin = factory({ devErrorPrinter: false, ssrTemplate: false })
  } catch {
    return runtimeLoader()
  }

  // Resolve WORKSPACE specifiers by lookup.
  //
  // A package manager links a workspace member only into the packages that
  // DECLARE it, so resolution from a given file depends on that file having a
  // `node_modules` neighbour with the link. Components satisfy this by
  // construction — they live inside a package that declares its own
  // dependencies — which is why they mount without help.
  //
  // `atlas.config.ts` does not. It sits at the repo ROOT, whose `package.json`
  // has no reason to depend on the UI packages, so importing the project's own
  // theme from it fails to resolve. That is the ONE field that unlocks
  // rocketstyle discovery, in the one file that structurally cannot import it —
  // measured on a real 78-package monorepo, where the config errored and every
  // rocketstyle chain stayed invisible.
  //
  // A `resolveId` hook rather than `resolve.alias`: an alias `find` string
  // matches by PREFIX, so aliasing `@acme/ui` would also capture `@acme/ui-grid`.
  // This reuses the same longest-name-first lookup the prop-type resolver uses,
  // so both answers come from one place, and it defers to Vite for anything the
  // workspace does not own — a real third-party dependency resolves normally.
  // Only the config gets the second tier. A COMPONENT that fails to resolve an
  // import has a real dependency bug, and quietly resolving it from some other
  // package would hide it — the config is special precisely because the root is
  // not a package that can declare anything.
  const configFiles = new Set(
    ['ts', 'tsx', 'mjs', 'js'].flatMap((ext) => [
      resolve(root, `atlas.config.${ext}`),
      resolve(root, `pyreon.config.${ext}`),
    ]),
  )
  const workspaceDirs = [...packages.values()]
  const workspaceResolver =
    packages.size > 0
      ? {
          name: 'atlas:workspace-resolve',
          enforce: 'pre' as const,
          resolveId(id: string, importer?: string): string | undefined {
            // Tier 1 — a workspace package, by name. Exact for everyone.
            const own = resolveWorkspaceSpecifier(id, packages)
            if (own) return own
            // Tier 2 — the CONFIG only: anything else it imports
            // (`@pyreon/core`, for a `wrapper`), resolved from a package that
            // declares it.
            //
            // Deliberately NOT extended to Atlas's own bare loads (`loadRuntime`
            // fetching `@pyreon/core`). That was tried, to silence three
            // `Failed to load url` lines — and those lines are cosmetic in a
            // matched install, where `loadRuntime` falls back to Atlas's copy
            // and it is the same copy. Widening resolution to quiet a harmless
            // message is not a trade worth making.
            if (importer && configFiles.has(importer)) {
              return resolveFromWorkspace(id, workspaceDirs)
            }
            return undefined
          },
        }
      : undefined

  const server = await createServer({
    root,
    configFile: false,
    // Middleware mode with no app: nothing is served, the server exists purely
    // as a module pipeline. `optimizeDeps.entries: []` stops it crawling the
    // project's `index.html`, which belongs to the app and pre-bundles a graph
    // this has no use for.
    appType: 'custom',
    server: { middlewareMode: true },
    optimizeDeps: { entries: [] },
    // Resolve EXTERNALISED ssr imports with the host's conditions.
    //
    // `@pyreon/vite-plugin` sets `ssr.noExternal: [/@pyreon\//]`, but Vite
    // still externalises some of the graph, and it resolves those ids with
    // `externalConditions` — which defaults to `['node']` and lands on `lib/`,
    // while the host (bun) lands on `src/`. Same package, two files, two
    // instances, and the singleton sentinel throws before anything mounts.
    // Prepended rather than replaced, so a package without a `bun` export
    // resolves exactly as it did.
    ...(isBun
      ? {
          environments: {
            ssr: { resolve: { externalConditions: ['bun', 'node', 'module'], conditions: ['bun'] } },
          },
        }
      : {}),
    // Two settings that only make sense together, and without BOTH the
    // framework ends up loaded twice and the singleton sentinel throws
    // `Multiple instances of @pyreon/reactivity detected` before a single
    // component mounts.
    //
    //   1. Externalise every `@pyreon/*` package BY NAME. Vite does not
    //      externalise workspace-LINKED packages under a blanket
    //      `external: true`, and processing them puts a second copy in Vite's
    //      own module registry. Externalised, they are imported by the host
    //      runtime — the same instances the harness already holds, which is
    //      also what lets a component share the harness's reactivity graph.
    //
    //   2. Resolve with the HOST's conditions. Vite still resolves an external
    //      id to a path, and its server defaults pick `lib/` while bun (which
    //      honours the `bun` condition) picks `src/` — the same package, two
    //      files, two instances. Prepended, not replaced, so a package without
    //      a `bun` export resolves exactly as before.
    // The workspace resolver is `enforce: 'pre'`, so it answers before Vite's
    // own resolution reaches `node_modules` and finds nothing.
    plugins: workspaceResolver ? [workspaceResolver, plugin] : [plugin],
  })

  return {
    kind: 'vite',
    // A bare specifier is passed through unchanged so the framework itself can
    // be pulled from this same graph (see `loadRuntime`); only real paths are
    // turned into URLs.
    load: (file) => server.ssrLoadModule(file.startsWith('/') ? pathToFileURL(file).pathname : file),
    close: () => server.close(),
  }
}

/** The host runtime honours the `bun` export condition. */
const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'

/**
 * The framework instances a loader's modules were compiled against.
 *
 * `@pyreon/vite-plugin` sets `ssr.noExternal: [/@pyreon\//]`, so a Vite loader
 * ALWAYS owns its own copy of the framework — externalising it is not an option
 * a consumer can take away. The answer is not to fight that but to mount with
 * the copy the components already hold, which is what this returns.
 */
export async function loadRuntime(
  loader: ModuleLoader,
  onFailure?: (message: string) => void,
): Promise<MountRuntime | undefined> {
  if (loader.kind !== 'vite') return undefined
  try {
    const [core, dom, reactivity, server] = await Promise.all([
      loader.load('@pyreon/core'),
      loader.load('@pyreon/runtime-dom'),
      loader.load('@pyreon/reactivity'),
      // Optional: a component library with no SSR story is a legitimate
      // project. Absent -> the parity check skips with that reason, so a
      // missing renderer never reads as a failing component.
      loader.load('@pyreon/runtime-server').catch(() => undefined),
    ])
    const h = core.h
    const mount = dom.mount
    const registerErrorHandler = core.registerErrorHandler
    if (typeof h !== 'function' || typeof mount !== 'function') return undefined
    const gc = hostCollectGarbage()
    const hasRegistry = typeof reactivity.getReactiveGraph === 'function'
    return {
      h: h as MountRuntime['h'],
      mount: mount as MountRuntime['mount'],
      registerErrorHandler: registerErrorHandler as MountRuntime['registerErrorHandler'],
      // The graph reader MUST come from this same loader graph — the
      // components' own `@pyreon/reactivity` instance — AND it must be
      // re-resolved PER READ: a Vite dep re-optimisation mid-scan invalidates
      // the SSR module graph and quietly swaps the instance, so a reference
      // captured here reads a dead registry forever. `ssrLoadModule` is cached
      // between invalidations, so the per-read load is cheap.
      ...(hasRegistry
        ? {
            reactiveGraphSize: async () => {
              const live = await loader.load('@pyreon/reactivity')
              return sizeOfGraph(live)
            },
          }
        : {}),
      ...(gc ? { collectGarbage: gc } : {}),
      ...ssrHalf(dom, server),
    }
  } catch (err) {
    // The project may not depend on the DOM runtime at all (a headless catalog).
    // Falling back to Atlas's own copy is wrong here — it would be a second
    // instance — so the caller mounts nothing and the check skips.
    onFailure?.(err instanceof Error ? err.message : String(err))
    return undefined
  }
}

/**
 * The SSR half of the runtime, when the project actually has one.
 *
 * All three pieces or none: a `renderToString` without a matching
 * `hydrateRoot` cannot express the check, and reporting a partial capability
 * would make the parity verdict depend on which module happened to resolve.
 *
 * `onHydrationMismatch` is taken from the SAME `@pyreon/runtime-dom` the
 * hydration runs through. Taken from anywhere else it subscribes to a
 * different module's collector and reports a serene zero for every scenario —
 * the silent-false-pass shape this whole check exists to prevent.
 */
function ssrHalf(
  dom: Record<string, unknown>,
  server: Record<string, unknown> | undefined,
): Partial<MountRuntime> {
  const renderToString = server?.renderToString
  const hydrateRoot = dom.hydrateRoot
  const onHydrationMismatch = dom.onHydrationMismatch
  if (
    typeof renderToString !== 'function' ||
    typeof hydrateRoot !== 'function' ||
    typeof onHydrationMismatch !== 'function'
  ) {
    return {}
  }
  return {
    renderToString: renderToString as NonNullable<MountRuntime['renderToString']>,
    hydrateRoot: hydrateRoot as NonNullable<MountRuntime['hydrateRoot']>,
    onHydrationMismatch: onHydrationMismatch as NonNullable<MountRuntime['onHydrationMismatch']>,
  }
}

/**
 * Does this failure mean Atlas and the project hold DIFFERENT framework copies?
 *
 * Worth its own predicate because the consequence is specific and severe. When
 * the two disagree, mounting still "works" — it just mounts components compiled
 * against one copy using another — and every check then reports a verdict about
 * the mismatch rather than about the component. Observed on a real workspace:
 * 2051 scenarios reported as failing, every one of them a harness artifact.
 *
 * Atlas ships in the fixed release group, so an ordinary install puts both on
 * one copy. The way to reach this is to upgrade Atlas alone, or to run a
 * development build against an installed project.
 */
export function isDualInstanceFailure(message: string): boolean {
  return /Multiple instances of @pyreon\//.test(message)
}

/**
 * Pull the two resolved module locations (+ versions) out of the sentinel's
 * message, so the CLI can PRINT them.
 *
 * The sentinel already names both copies (`A: <path> (vX)` / `B: <path> (vY)`)
 * — but Atlas catches that error and reports its own summary, and a re-report
 * that drops the paths sends the reader into nested-node_modules archaeology
 * for a fact the caught error was already carrying (upstream-reported: a
 * manifest revert and a --force reinstall before finding the cause that two
 * printed paths make a one-line fix).
 *
 * Returns the `A:`/`B:` lines verbatim (trimmed), or undefined when the
 * message shape has no such lines — the summary then stands alone rather than
 * echoing an unparseable blob.
 */
export function dualInstanceDetail(message: string): string | undefined {
  const lines = message.split('\n').filter((line) => /^\s*[AB]: \S/.test(line))
  if (lines.length === 0) return undefined
  return lines.map((line) => line.trim()).join('\n')
}

export interface LoadResult {
  component?: ComponentRef
  /** why nothing was attached — for a diagnostic, never for a verdict */
  reason?: string
}

/**
 * Import `source` and pull out the export named `name`.
 *
 * Falls back to the default export, because a single-component file commonly
 * has one. It does NOT fall back to "the only function export": a file whose
 * exports do not include the name discovery recorded is a file whose shape was
 * misread, and guessing there attaches the WRONG component to a name — mounting
 * one thing and reporting the verdict under another label is worse than
 * reporting nothing.
 */
export async function loadComponent(
  source: string,
  name: string,
  loader: ModuleLoader = runtimeLoader(),
): Promise<LoadResult> {
  let mod: Record<string, unknown>
  try {
    mod = await loader.load(source)
  } catch (err) {
    return { reason: `could not import ${source}: ${err instanceof Error ? err.message : String(err)}` }
  }
  const candidate = mod[name] ?? mod.default
  if (typeof candidate !== 'function') {
    return { reason: `${source} has no callable export named "${name}"` }
  }
  return { component: candidate as ComponentRef }
}

/**
 * Attach real component functions to already-discovered intelligence.
 *
 * A decorate plugin rather than a discover one: discovery stays static and this
 * layers on top, so a catalog can be built with or without executing the
 * project's code by including or omitting this single plugin.
 */
export function componentLoaderPlugin(loader?: ModuleLoader): AtlasPlugin {
  const active = loader ?? runtimeLoader()
  return defineAtlasPlugin({
    name: 'atlas:component-loader',
    async decorate(ci: ComponentIntelligence, _ctx: DecorateContext): Promise<ComponentIntelligence> {
      // Already carried a component (an authored catalog) — never overwrite it
      // with a re-imported one, which would be a second module instance.
      if (typeof ci.component === 'function' || !ci.source) return ci
      // `source` is already relative to the PROCESS cwd (discovery joins the
      // scan root itself), so it resolves against that — joining `ctx.cwd`
      // again produces `examples/x/examples/x/...` and every load fails.
      const { component } = await loadComponent(resolve(ci.source), ci.name, active)
      return component ? { ...ci, component } : ci
    },
  })
}
