/**
 * The project's OWN Vite config, applied to the workbench app.
 *
 * `atlas dev` / `atlas build` run Atlas's app with `configFile: false` (the
 * Vite root is the app, see `./zero-app`), so nothing in the project's
 * `vite.config.*` applied: a Tailwind v4 project (`@tailwindcss/vite`) or any
 * project whose components depend on a custom plugin rendered unstyled or
 * failed to load. This reads that config with Vite's own `loadConfigFromFile`
 * and hands back the parts that describe how the PROJECT's code compiles:
 *
 * - `plugins` — minus the project's own `pyreon()` and `zero()`: Atlas runs
 *   its own copies, and a second `pyreon()` compiles every JSX file twice
 *   while a second `zero()` would route the project's `src/routes`;
 * - `resolve` — except `alias`, which the scan already resolved (with
 *   `atlas.config.ts`'s on top) and passes in, so the scan and the workbench
 *   agree on what an import means;
 * - `css` — a relative `css.postcss` directory resolved against the project;
 *   with none set, the PostCSS config is searched from the project;
 * - `define`, `envPrefix`.
 *
 * Everything else (`root`, `base`, `build`, `server`, the project's own
 * `publicDir` / `envDir`, which `projectDirs` already points at the project)
 * belongs to the project's app, not to the workbench.
 *
 * A config that cannot be loaded is reported and skipped, never fatal: the
 * workbench still serves every component that does not need it.
 */
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

/** One Vite plugin, as far as this module needs to know. */
interface PluginLike {
  name?: string
}

export interface ProjectViteConfig {
  plugins: unknown[]
  resolve: Record<string, unknown>
  css: Record<string, unknown>
  define?: Record<string, unknown>
  envPrefix?: string | string[]
  /** The config file that was read, when there is one. */
  file?: string
  /** Why the config could not be used, when it could not. */
  warning?: string
}

type LoadConfigFromFile = (
  env: { command: 'serve' | 'build'; mode: string },
  configFile: string | undefined,
  root: string,
) => Promise<{ path: string; config: Record<string, unknown> } | null>

/** A plugin Atlas already runs its own copy of. */
export function isAtlasOwnedPlugin(plugin: unknown): boolean {
  const name = (plugin as PluginLike | null)?.name
  return name === 'pyreon' || (typeof name === 'string' && name.startsWith('pyreon-zero'))
}

/** Vite accepts nested arrays, promises and falsy entries in `plugins`. */
async function flattenPlugins(value: unknown): Promise<unknown[]> {
  const settled = await value
  if (Array.isArray(settled)) return (await Promise.all(settled.map(flattenPlugins))).flat()
  return settled ? [settled] : []
}

export async function loadProjectViteConfig(
  root: string,
  command: 'serve' | 'build',
  load?: LoadConfigFromFile,
): Promise<ProjectViteConfig> {
  const empty: ProjectViteConfig = { plugins: [], resolve: {}, css: {} }
  let loadConfig = load
  if (!loadConfig) {
    try {
      loadConfig = ((await import('vite')) as unknown as { loadConfigFromFile: LoadConfigFromFile }).loadConfigFromFile
    } catch {
      return empty
    }
  }
  let loaded: Awaited<ReturnType<LoadConfigFromFile>>
  try {
    loaded = await loadConfig({ command, mode: command === 'build' ? 'production' : 'development' }, undefined, root)
  } catch (error) {
    return {
      ...empty,
      warning:
        `could not load this project's vite config, so its plugins do not apply to the workbench ` +
        `(${error instanceof Error ? error.message : String(error)}).`,
    }
  }
  if (!loaded) return empty

  const config = loaded.config
  const plugins = (await flattenPlugins(config.plugins)).filter((p) => !isAtlasOwnedPlugin(p))
  const { alias: _alias, ...resolveRest } = (config.resolve ?? {}) as Record<string, unknown>
  const css = { ...((config.css ?? {}) as Record<string, unknown>) }
  if (typeof css.postcss === 'string' && !isAbsolute(css.postcss)) css.postcss = resolve(root, css.postcss)

  return {
    plugins,
    resolve: resolveRest,
    css,
    ...(config.define ? { define: config.define as Record<string, unknown> } : {}),
    ...(config.envPrefix ? { envPrefix: config.envPrefix as string | string[] } : {}),
    file: loaded.path,
  }
}

/**
 * The Vite config fields the project contributes, merged with Atlas's own.
 * `css.postcss` defaults to the project root (see `projectDirs`); `dedupe`
 * is the union of both lists.
 */
export function projectConfigFields(
  project: ProjectViteConfig,
  projectRoot: string,
  atlasResolve: { alias?: unknown[]; dedupe?: string[] },
): Record<string, unknown> {
  const projectDedupe = Array.isArray(project.resolve.dedupe) ? (project.resolve.dedupe as string[]) : []
  const dedupe = [...new Set([...(atlasResolve.dedupe ?? []), ...projectDedupe])]
  return {
    resolve: {
      ...project.resolve,
      ...(atlasResolve.alias && atlasResolve.alias.length > 0 ? { alias: atlasResolve.alias } : {}),
      ...(dedupe.length > 0 ? { dedupe } : {}),
    },
    css: { postcss: projectRoot, ...project.css },
    ...(project.define ? { define: project.define } : {}),
    ...(project.envPrefix ? { envPrefix: project.envPrefix } : {}),
  }
}

/** `@import "tailwindcss"` (either quote), without a `source(...)` argument. */
const TAILWIND_IMPORT = /@import\s+(['"])tailwindcss\1(?![^;]*\bsource\()[^;]*;/

/**
 * Tailwind v4 scans for class names from Vite's `root` — here the workbench
 * app, so a project's Tailwind CSS compiled with NO utilities (the classes its
 * components use were never found). Same rule as every other root-relative
 * default (`projectDirs`): point it at the project. A CSS root that imports
 * `tailwindcss` without its own `source(...)` gets `@source "<project>";`,
 * which ADDS the project to what Tailwind scans. A file that already names its
 * sources is left exactly as written.
 */
export function tailwindSourcePlugin(projectRoot: string): {
  name: string
  enforce: 'pre'
  transform: (code: string, id: string) => string | null
} {
  return {
    name: 'atlas:tailwind-source',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0] ?? id
      if (!file.endsWith('.css') || file.includes(`${sep}node_modules${sep}`)) return null
      if (!TAILWIND_IMPORT.test(code) || /@source\s/.test(code)) return null
      const rel = relative(dirname(file), projectRoot).split(sep).join('/') || '.'
      return `${code}\n@source "${rel}";\n`
    },
  }
}
