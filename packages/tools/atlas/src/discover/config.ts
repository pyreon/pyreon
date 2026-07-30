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
// Type-only: the presets CONTRACT lives with the UI that renders it, and a
// type import is erased — `atlas scan` never loads the workbench.
import type { WorkbenchPresets } from '../ui/catalog'
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
  /**
   * Per-project addon presets — the lists the workbench renders its Viewport /
   * Background / Locale / Roles pickers from. Plain JSON data; each omitted
   * family keeps the shipped defaults. See `WorkbenchPresets` in
   * `@pyreon/atlas/ui` for the field-by-field contract.
   */
  presets?: WorkbenchPresets
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
  const rawPresets = (mod.presets ?? fromDefault.presets) as unknown
  const presetsError = rawPresets === undefined ? undefined : validatePresets(rawPresets)
  if (presetsError) {
    // The other exports still apply — a typo in one preset list must not
    // silently unwrap the whole catalog — but the problem is NAMED.
    return {
      config: {
        ...(wrapper ? { wrapper: wrapper as ComponentRef } : {}),
        ...(theme !== undefined ? { theme } : {}),
      },
      path: found,
      error: `${found}: \`presets\` ignored — ${presetsError}`,
    }
  }
  return {
    config: {
      ...(wrapper ? { wrapper: wrapper as ComponentRef } : {}),
      ...(theme !== undefined ? { theme } : {}),
      ...(rawPresets !== undefined ? { presets: rawPresets as WorkbenchPresets } : {}),
    },
    path: found,
  }
}

/**
 * Shape-check the presets export. Returns a MESSAGE (not a boolean) so the
 * config error names exactly what is wrong — "presets are ignored" with no
 * reason is a puzzle, not a diagnostic.
 */
export function validatePresets(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return '`presets` must be an object'
  const presets = value as Record<string, unknown>
  const families = ['viewports', 'backgrounds', 'locales', 'roles'] as const
  for (const family of families) {
    const list = presets[family]
    if (list === undefined) continue
    if (!Array.isArray(list)) return `\`presets.${family}\` must be an array`
    if (list.length === 0) return `\`presets.${family}\` must not be empty (omit it to keep the defaults)`
    for (const entry of list as unknown[]) {
      const e = entry as Record<string, unknown>
      if (typeof e !== 'object' || e === null || typeof e.id !== 'string' || typeof e.label !== 'string') {
        return `every \`presets.${family}\` entry needs string \`id\` and \`label\``
      }
      if (family === 'viewports' && typeof e.width !== 'number' && e.width !== null) {
        return `\`presets.viewports\` entry "${String(e.id)}" needs \`width: number | null\``
      }
      if (family === 'locales' && e.dir !== undefined && e.dir !== 'ltr' && e.dir !== 'rtl') {
        return `\`presets.locales\` entry "${String(e.id)}" has an invalid \`dir\``
      }
    }
  }
  return undefined
}

/** Resolve a user-supplied path against cwd, leaving absolute paths alone. */
export function resolveFrom(cwd: string, file: string): string {
  return isAbsolute(file) ? file : resolve(cwd, file)
}
