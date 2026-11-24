/**
 * The workbench as a `@pyreon/zero` app — shared by `atlas dev` and `atlas build`.
 *
 * The workbench ships as a small zero app inside this package (`app/`):
 * `index.html`, a client entry, and file routes (`/` and `/:component`)
 * under one `_layout` that renders `<Workbench>`. Both commands run that
 * app with the same plugin chain — `@pyreon/vite-plugin`, `zero()`, and
 * `atlasDevPlugin` (the derived catalog, the RPC channel, the `<head>`
 * lines) — so the dev server and the deployed site are one app, not a dev
 * server and a separately generated static entry that could drift apart.
 *
 * ── Why the Vite root is the APP, not the project ─────────────────────────
 *
 * zero reads its routes from `<root>/src/routes`. Rooting at the project would
 * route the project's OWN `src/routes`. Project files are imported by absolute
 * path (the generated catalog), and the project directory is added to
 * `server.fs.allow`, so nothing the workbench loads depends on the root being
 * the project. The project still owns the env files (`envDir`) and the
 * dependency cache (`cacheDir`).
 *
 * ── Why the mode is declared, never inferred ──────────────────────────────
 *
 * `mode: 'auto'` resolves the routes directory from `process.cwd()` — the
 * user's repo — at plugin-factory time. `mode: 'ssg'` with every route
 * declared `renderMode = 'spa'` (in `app/src/routes/_layout.tsx`) is explicit:
 * the build writes the client shell at every path it is given (one per
 * component) and never server-renders the workbench, which mounts arbitrary
 * project components that need a browser.
 */
import { existsSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The bundled zero app's directory, resolved from THIS module rather than cwd.
 *
 * The scanned project does not depend on Atlas (it is a tool pointed AT a
 * library), so neither a bare specifier nor a cwd-relative path finds it.
 * Climbing covers both layouts: `src/dev/zero-app.ts` running from source and
 * `lib/<entry>.js` or `lib/_chunks/<hash>.js` in an install.
 *
 * REALPATH'd: Vite resolves the entry to a real path while `root` is whatever
 * it was given, and the html plugin names the emitted page by relativizing one
 * against the other — a symlinked root (`/tmp` on macOS) escapes upward and
 * the build refuses it.
 */
export function appDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i += 1) {
    const candidate = join(dir, 'app')
    if (existsSync(join(candidate, 'index.html')) && existsSync(join(candidate, 'src', 'routes'))) {
      return realpathSync(candidate)
    }
    dir = dirname(dir)
  }
  throw new Error(
    '[Pyreon] atlas: could not locate the workbench app (`app/`) next to the @pyreon/atlas install. ' +
      'Reinstall @pyreon/atlas; the package ships it.',
  )
}

/**
 * Missing-dependency message for `dev` and `build`.
 *
 * Written out rather than letting the raw resolution error surface: "Cannot
 * find package 'vite'" does not tell a library author why a workbench needed
 * one, and the fix (install it) is not obvious from the error.
 */
export function missingStackMessage(command: 'dev' | 'build', what: string): string {
  return (
    `[Pyreon] atlas ${command} needs ${what}, which is not installed in this project.\n` +
    '  Install the workbench stack as dev dependencies:\n\n' +
    '    bun add -d vite @pyreon/vite-plugin @pyreon/zero\n\n' +
    '  `atlas scan` needs none of them and keeps working without them.'
  )
}

type PluginFactory = (options?: unknown) => unknown

/** The two plugin factories every workbench run needs. */
export interface ZeroStack {
  pyreon: PluginFactory
  zero: PluginFactory
}

/**
 * Import `@pyreon/vite-plugin` and `@pyreon/zero` DYNAMICALLY.
 *
 * Both are optional peers: `atlas scan` must run in a project that has no
 * bundler, and a top-level import would drag a dev server into that path —
 * and into anything that imports the CLI at all.
 *
 * Each try covers ONLY its import, so "the import failed" is translated into
 * "not installed" and nothing else is masked behind that message (a factory
 * that is missing is reported as such, not as a missing install).
 */
export async function loadZeroStack(command: 'dev' | 'build'): Promise<ZeroStack> {
  let pyreonMod: { default?: PluginFactory }
  try {
    pyreonMod = (await import('@pyreon/vite-plugin')) as unknown as typeof pyreonMod
  } catch {
    throw new Error(missingStackMessage(command, '@pyreon/vite-plugin'))
  }
  let zeroMod: { default?: PluginFactory }
  try {
    zeroMod = (await import('@pyreon/zero/server')) as unknown as typeof zeroMod
  } catch {
    throw new Error(missingStackMessage(command, '@pyreon/zero'))
  }
  const pyreon = pyreonMod.default
  if (typeof pyreon !== 'function') {
    throw new Error(`[Pyreon] atlas ${command}: @pyreon/vite-plugin did not export a plugin factory`)
  }
  const zero = zeroMod.default
  if (typeof zero !== 'function') {
    throw new Error(`[Pyreon] atlas ${command}: @pyreon/zero/server did not export a plugin factory`)
  }
  return { pyreon, zero }
}

/**
 * The plugin options both commands pass.
 *
 * `devErrorPrinter: false` — that feature injects a virtual module importing
 * `@pyreon/compiler/diagnose` into the served app. It is aimed at a user's OWN
 * app; the workbench surfaces component errors in its own canvas, and the
 * resulting Vite overlay would cover the whole workbench.
 */
export const PYREON_OPTIONS = { devErrorPrinter: false } as const

/**
 * zero's options. `base` and `port` go to zero as well as to Vite: zero's own
 * `config` hook returns `base` (default `/`) and `server.port` (default 3000),
 * which win over the inline Vite config, and its router reads the same base.
 */
export function zeroOptions(options: {
  base?: string | undefined
  port?: number | undefined
  paths?: readonly string[]
}): Record<string, unknown> {
  return {
    mode: 'ssg',
    ...(options.base !== undefined ? { base: options.base } : {}),
    ...(options.port !== undefined ? { port: options.port } : {}),
    ...(options.paths !== undefined ? { ssg: { paths: [...options.paths] } } : {}),
  }
}
