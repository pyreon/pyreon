/**
 * `atlas.config.ts` — the project's own answer to "what does my component need
 * in order to render?".
 *
 * Nothing else can answer it. Atlas derives controls, scenarios and variants
 * from types, but a design-system component reading a theme token needs a
 * provider around it, and that provider lives in the project. Storybook calls
 * this a decorator; the shape here is the same idea with no framework-specific
 * contract — a component that receives `children`.
 *
 * Optional by design. Absent config is the normal case for a plain component
 * library, and must never be an error.
 */
import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import type { ComponentRef } from '../core'
import { type ModuleLoader, runtimeLoader } from './load'

/** What a project may export from `atlas.config.{ts,tsx,js,mjs}`. */
export interface AtlasConfig {
  /**
   * Wraps every mounted scenario — theme, router, i18n, a query client.
   * Receives the scenario as `children`.
   */
  wrapper?: ComponentRef
  /**
   * The theme rocketstyle dimensions are read against.
   *
   * Dimension values live in `.variants((t) => ({ solid: { color: t.accent } }))`
   * callbacks, so introspecting them RUNS those callbacks — with no theme the
   * first token read throws and the component reports no axes. Only the keys
   * are used; the values never reach the catalog.
   */
  theme?: unknown
}

/** Filenames tried, in order. */
const CANDIDATES = ['atlas.config.tsx', 'atlas.config.ts', 'atlas.config.mjs', 'atlas.config.js']

export interface LoadedConfig {
  config: AtlasConfig
  /** The file it came from, or undefined when there is none. */
  path?: string
  /**
   * Set when a config file EXISTS but could not be used.
   *
   * Distinguished from "no config" on purpose: a project that wrote one and
   * has it silently ignored gets a puzzling round of "why is nothing wrapped?",
   * where a project that wrote none should hear nothing at all.
   */
  error?: string
}

/**
 * Find and import the project's config, if it has one.
 *
 * Takes the same loader the components go through, so a config written in JSX
 * compiles the same way they do. With the fallback runtime loader the project's
 * JSX configuration may not be in effect — see `./load` — which is why the
 * example's config is plain `h()`.
 */
export async function loadAtlasConfig(
  cwd: string,
  loader: ModuleLoader = runtimeLoader(),
): Promise<LoadedConfig> {
  const found = CANDIDATES.map((name) => resolve(cwd, name)).find((file) => existsSync(file))
  if (!found) return { config: {} }

  let mod: Record<string, unknown>
  try {
    mod = await loader.load(found)
  } catch (err) {
    return {
      config: {},
      path: found,
      error: `could not load ${found}: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // Accept a named export or a default object — both read naturally, and
  // guessing wrong between them is a silently-unwrapped catalog.
  const fromDefault = (mod.default ?? {}) as AtlasConfig
  const wrapper = (mod.wrapper ?? fromDefault.wrapper) as unknown
  if (wrapper !== undefined && typeof wrapper !== 'function') {
    return { config: {}, path: found, error: `${found}: \`wrapper\` must be a component function` }
  }
  const theme = mod.theme ?? fromDefault.theme
  return {
    config: {
      ...(wrapper ? { wrapper: wrapper as ComponentRef } : {}),
      ...(theme !== undefined ? { theme } : {}),
    },
    path: found,
  }
}

/** Resolve a user-supplied path against cwd, leaving absolute paths alone. */
export function resolveFrom(cwd: string, file: string): string {
  return isAbsolute(file) ? file : resolve(cwd, file)
}
