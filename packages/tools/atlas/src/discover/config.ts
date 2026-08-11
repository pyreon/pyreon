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
import { CONFIG_FILENAMES, sectionFrom } from '@pyreon/config'
import type { AtlasExtension, ComponentRef } from '../core'
import { validateExtensions } from '../core'
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
  /**
   * Authored scenarios, keyed by COMPONENT NAME — the progressive-enrichment
   * channel. Everything stays derived; this adds only what derivation cannot
   * know: a named state worth pinning, and a `play` script that says what
   * "exercised" means for it. An authored scenario wins over a generated one
   * with the same id.
   */
  scenarios?: Record<string, readonly AuthoredScenario[]>
  /**
   * The site's name — browser tab, workbench chrome, and the `<title>` of a
   * built static site. `--title` on the CLI wins over this.
   */
  title?: string
  /**
   * Per-component presentation, keyed by COMPONENT NAME.
   *
   * Presentation ONLY. Nothing here can change what was discovered or
   * verified: a `title` renames the sidebar entry, it does not rename the
   * component, and the catalog keeps the real name so an agent reading the
   * machine surface is never handed a display string it cannot import.
   */
  pages?: Record<string, PageMeta>
  /**
   * Monorepo roots — scan several packages into ONE site.
   *
   * Each project contributes its components under its own `name`, which becomes
   * both the top-level sidebar group and part of each component's identity
   * (`project/Name`). That identity is what lets two packages each export a
   * `Button` without one silently replacing the other.
   *
   * With this set the single `dir` is ignored; without it nothing changes and
   * every derived key stays byte-identical to a single-package scan.
   *
   * @example
   * ```ts
   * export default {
   *   title: 'Acme Design System',
   *   projects: [
   *     { name: 'Core', dir: 'packages/core/src' },
   *     { name: 'Admin', dir: 'packages/admin/src' },
   *   ],
   * }
   * ```
   */
  projects?: readonly ProjectRoot[]
  /**
   * Extra module aliases, for imports Atlas cannot otherwise resolve.
   *
   * Atlas ALREADY reads `resolve.alias` out of the project's own vite config,
   * so most projects need nothing here — this is the escape hatch for when
   * that config cannot be loaded (it imports a plugin this command does not
   * install, or reads env the workbench does not set), and for aliases that
   * live somewhere else entirely.
   *
   * Entries declared here WIN over discovered ones: Vite matches aliases in
   * order and these are placed first.
   *
   * Only `resolve.alias` is ever taken from the project's config — never its
   * plugins. Atlas runs the real `@pyreon/vite-plugin` itself, and applying a
   * second copy would compile every component's JSX twice.
   *
   * @example
   * ```ts
   * export const alias = { '~': './src', '@app': './src/app' }
   * ```
   */
  alias?: Record<string, string> | readonly { find: string | RegExp; replacement: string }[]
  /**
   * Render extensions — what a scenario needs to render like your app.
   *
   * Each contributes a layer around every scenario and/or a one-time setup,
   * and several COMPOSE (outside-in, in declaration order). `wrapper` is the
   * one-provider shorthand and composes as the innermost layer.
   *
   * @example
   * ```ts
   * extensions: [pyreonUI({ theme }), fonts({ family: 'Inter' })]
   * ```
   */
  extensions?: readonly AtlasExtension[]
}

/** One monorepo root — see `AtlasConfig.projects`. */
export interface ProjectRoot {
  /** Top-level group, and the qualifier in every component's key. */
  name: string
  /** Directory to scan, relative to the project root. */
  dir: string
}

/** Per-component presentation — see `AtlasConfig.pages`. */
export interface PageMeta {
  /** Display name in the sidebar and the docs heading. */
  title?: string
  /** Overrides the group derived from the file's directory. */
  group?: string
  /**
   * Sort weight within a group; lower sorts first, ties fall back to name.
   * Components with no order sort AFTER every ordered one, so pinning three
   * favourites to the top does not scramble the rest.
   */
  order?: number
  /** One-line summary, shown under the heading. Overrides a derived summary. */
  summary?: string
}

/** One authored scenario — see `AtlasConfig.scenarios`. */
export interface AuthoredScenario {
  name: string
  args?: Record<string, unknown>
  play?: import('../core').PlayFn
}

/**
 * Filenames tried, in order.
 *
 * `atlas.config.*` first, then the ecosystem-wide `pyreon.config.*`'s `atlas`
 * key. The per-tool file wins deliberately: a project that has both has almost
 * certainly just started migrating, and having the general file silently
 * override the specific one mid-migration is the worst possible ordering.
 */
const CANDIDATES = ['atlas.config.tsx', 'atlas.config.ts', 'atlas.config.mjs', 'atlas.config.js']

/**
 * The ecosystem-wide config, read for its `atlas` section.
 *
 * The filename list and the section reader come from `@pyreon/config` rather
 * than being restated here. They were duplicated when this loader landed, and
 * a second copy of "which filenames, and how to pull a tool's section out" is
 * a drift waiting to happen: the day `pyreon.config.mts` is added to one list,
 * the other silently keeps ignoring it — and a config that is silently ignored
 * is the exact failure the shared file exists to reduce.
 */
const SHARED_CANDIDATES = CONFIG_FILENAMES

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
  const own = CANDIDATES.map((name) => resolve(cwd, name)).find((file) => existsSync(file))
  const shared = SHARED_CANDIDATES.map((name) => resolve(cwd, name)).find((file) => existsSync(file))
  const found = own ?? shared
  if (!found) return { config: {} }

  let loadedModule: Record<string, unknown>
  try {
    loadedModule = await loader.load(found)
  } catch (err) {
    return {
      config: {},
      path: found,
      error: `could not load ${found}: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // From `pyreon.config.*` the config is one SECTION of the module, not the
  // module itself — everything below then reads identically for both files,
  // which is the point: one shape, two places it can live.
  let mod = loadedModule
  if (!own) {
    // `sectionFrom` owns the named-vs-default lookup for every tool, so atlas
    // and the next package to read this file cannot disagree about where a
    // section lives.
    const section = sectionFrom(loadedModule, 'atlas')
    if (section === undefined) {
      // A `pyreon.config.ts` with no `atlas` key is not an error — it is a
      // project configuring some other tool. Silence is correct here.
      return { config: {} }
    }
    if (typeof section !== 'object' || section === null || Array.isArray(section)) {
      return { config: {}, path: found, error: `${found}: \`atlas\` must be an object` }
    }
    // Wrapped so the named-export pass below finds the section's own fields.
    mod = { default: section }
  }

  // Accept a named export or a default object — both read naturally, and
  // guessing wrong between them is a silently-unwrapped catalog.
  const fromDefault = (mod.default ?? {}) as AtlasConfig
  const wrapper = (mod.wrapper ?? fromDefault.wrapper) as unknown
  if (wrapper !== undefined && typeof wrapper !== 'function') {
    return { config: {}, path: found, error: `${found}: \`wrapper\` must be a component function` }
  }
  const theme = mod.theme ?? fromDefault.theme

  // Accumulated progressively rather than re-spread at each early return: the
  // rule is "one bad export is NAMED and ignored, every other export still
  // applies", and the previous shape restated the whole object per error
  // branch — so each new field had to be added to every branch, and the one
  // that got missed would be silently dropped whenever an unrelated export
  // was malformed.
  const config: AtlasConfig = {
    ...(wrapper ? { wrapper: wrapper as ComponentRef } : {}),
    ...(theme !== undefined ? { theme } : {}),
  }
  /**
 * `alias` must be Vite's own shape — the object form or the array form.
 *
 * Validated rather than trusted because a malformed alias does not fail
 * loudly: Vite ignores an entry it cannot read, so the import it was meant to
 * fix keeps failing and the config LOOKS applied. Naming it here is the
 * difference between a five-second fix and an afternoon.
 */
function validateAlias(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const e = entry as { find?: unknown; replacement?: unknown }
      if (!e || (typeof e.find !== 'string' && !(e.find instanceof RegExp))) {
        return 'every array entry needs a string or RegExp `find`'
      }
      if (typeof e.replacement !== 'string') {
        return 'every array entry needs a string `replacement`'
      }
    }
    return undefined
  }
  if (typeof value !== 'object' || value === null) {
    return '`alias` must be an object (`{ "~": "./src" }`) or an array of { find, replacement }'
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v !== 'string') return `\`alias["${k}"]\` must be a string path`
  }
  return undefined
}

/** Validate one optional export; on failure NAME it and leave it out. */
  const take = (
    key: keyof AtlasConfig,
    validate: (value: unknown) => string | undefined,
  ): string | undefined => {
    const raw = (mod[key] ?? (fromDefault as Record<string, unknown>)[key]) as unknown
    if (raw === undefined) return undefined
    const problem = validate(raw)
    if (problem) return `${found}: \`${key}\` ignored — ${problem}`
    ;(config as Record<string, unknown>)[key] = raw
    return undefined
  }

  // First problem wins the `error` slot; every VALID export is applied either
  // way, which is why these run unconditionally rather than short-circuiting.
  const problems = [
    take('presets', validatePresets),
    take('scenarios', validateAuthoredScenarios),
    take('title', (v) => (typeof v === 'string' ? undefined : '`title` must be a string')),
    take('pages', validatePages),
    take('projects', validateProjects),
    take('extensions', validateExtensions),
    take('alias', validateAlias),
  ].filter((p): p is string => p !== undefined)

  return { config, path: found, ...(problems[0] ? { error: problems[0] } : {}) }
}

/** Shape-check the `projects` export — the monorepo roots. */
export function validateProjects(value: unknown): string | undefined {
  if (!Array.isArray(value)) return '`projects` must be an array'
  if (value.length === 0) return '`projects` must not be empty'
  const names = new Set<string>()
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return 'every `projects` entry must be an object'
    }
    const p = entry as Record<string, unknown>
    if (typeof p.name !== 'string' || p.name.length === 0) {
      return 'every `projects` entry needs a non-empty string `name`'
    }
    if (typeof p.dir !== 'string' || p.dir.length === 0) {
      return `\`projects.${p.name}\` needs a non-empty string \`dir\``
    }
    // A `/` would make `project/Name` keys ambiguous to read and would nest a
    // group where the author meant one level.
    if (p.name.includes('/')) return `\`projects\` name "${p.name}" must not contain "/"`
    // Two projects sharing a name would key their components identically —
    // reintroducing the exact silent collapse `project` exists to prevent.
    if (names.has(p.name)) return `duplicate \`projects\` name "${p.name}"`
    names.add(p.name)
  }
  return undefined
}

/** Shape-check the `pages` export — presentation overrides keyed by component. */
export function validatePages(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return '`pages` must be an object keyed by component name'
  }
  for (const [component, meta] of Object.entries(value as Record<string, unknown>)) {
    if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
      return `\`pages.${component}\` must be an object`
    }
    const m = meta as Record<string, unknown>
    for (const key of ['title', 'group', 'summary'] as const) {
      if (m[key] !== undefined && typeof m[key] !== 'string') {
        return `\`pages.${component}.${key}\` must be a string`
      }
    }
    // `Number.isFinite` rather than `typeof === 'number'`: NaN is a number and
    // would sort unpredictably against every sibling.
    if (m.order !== undefined && !Number.isFinite(m.order)) {
      return `\`pages.${component}.order\` must be a finite number`
    }
  }
  return undefined
}


/** Shape-check the authored-scenarios export — the message names what is wrong. */
export function validateAuthoredScenarios(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return '`scenarios` must be an object keyed by component name'
  }
  for (const [component, list] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(list)) return `\`scenarios.${component}\` must be an array`
    for (const entry of list as unknown[]) {
      const e = entry as Record<string, unknown>
      if (typeof e !== 'object' || e === null || typeof e.name !== 'string') {
        return `every \`scenarios.${component}\` entry needs a string \`name\``
      }
      if (e.args !== undefined && (typeof e.args !== 'object' || e.args === null)) {
        return `\`scenarios.${component}\` entry "${String(e.name)}" has a non-object \`args\``
      }
      if (e.play !== undefined && typeof e.play !== 'function') {
        return `\`scenarios.${component}\` entry "${String(e.name)}" has a non-function \`play\``
      }
    }
  }
  return undefined
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
